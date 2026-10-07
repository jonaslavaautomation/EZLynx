import { db, uuid } from '@/lib/db';
import { addTransaction, createPolicy, logActivity } from '@/lib/domain';
import { addDays, addMonths, today } from '@/lib/format';
import { COMMERCIAL_LINES, type Account, type Carrier, type Claim, type Coverage, type LineOfBusiness, type Policy } from '@/lib/types';

/*
 * Carrier downloads, modeled on EZLynx's Ivans download process:
 *   - Each day the carriers send policy and claim transactions (here: a simulated feed built from the agency's book).
 *   - EZLynx auto-matches each one in a fixed order (personal: policy # + LOB + NAIC → name + SSN/DOB + ZIP → unique
 *     phone; commercial: EIN → company + ZIP → company) and applies matched transactions to the policy.
 *   - Anything that doesn't match waits in Unmatched until someone matches it, creates the account/policy, or deletes it.
 */

export type DownloadTxnType = 'New Business' | 'Renewal' | 'Policy Change' | 'Cancellation' | 'Reinstatement' | 'Non-Renewal' | 'Claim';
export type MatchMethod = 'Policy' | 'Account' | 'Phone' | 'EIN' | 'Company' | 'Manual' | 'Created';
export type DownloadInsured = {
  first_name: string; last_name: string; business_name: string | null; dob: string | null; ssn_last4: string | null; ein: string | null;
  address: string; city: string; state: string; zip: string; phone: string | null; email: string | null;
};
export type DownloadTxn = {
  id: string; received_at: string; kind: 'policy' | 'claim'; type: DownloadTxnType; carrier: string; naic: string | null;
  policy_number: string; line_of_business: LineOfBusiness; effective_date: string; expiration_date: string; term_months: number;
  premium: number; premium_change: number; description: string; insured: DownloadInsured; coverages: Coverage[];
  claim: { claim_number: string; date_of_loss: string; loss_type: string; status: Claim['status']; amount_reserved: number | null; amount_paid: number | null } | null;
  status: 'Matched' | 'Unmatched'; match_method: MatchMethod | null; account_id: string | null; policy_id: string | null;
  processed_at: string | null; processed_by: string | null; note: string | null;
};

const KEY = 'carrier_downloads';
const KEEP_DAYS = 45;
export const isCommercialLine = (l: string) => COMMERCIAL_LINES.includes(l as LineOfBusiness);

// ── Storage (app config row, shared by every user of the agency) ──

type Store = { items: DownloadTxn[]; last_run: string | null };
async function readStore(): Promise<{ id: string | null; value: Store }> {
  const [row] = await db.list('app_config', { eq: { key: KEY } });
  const v = (row?.value ?? {}) as Partial<Store>;
  return { id: row?.id ?? null, value: { items: Array.isArray(v.items) ? v.items : [], last_run: v.last_run ?? null } };
}
let chain: Promise<unknown> = Promise.resolve();
/** Serialized read-modify-write of the download store. */
export function updateStore<T>(fn: (s: Store) => Promise<T> | T): Promise<T> {
  const next = chain.catch(() => {}).then(async () => {
    const { id, value } = await readStore();
    const out = await fn(value);
    const cutoff = addDays(today(), -KEEP_DAYS);
    value.items = value.items.filter((i) => i.received_at.slice(0, 10) >= cutoff || i.status === 'Unmatched');
    const v = value as unknown as Record<string, unknown>;
    if (id) await db.update('app_config', id, { value: v }); else await db.insert('app_config', { key: KEY, value: v });
    return out;
  });
  chain = next;
  return next;
}

// ── Matching (EZLynx order) ──

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export type MatchResult = { account: Account; policy: Policy | null; method: MatchMethod } | null;

export function autoMatch(t: DownloadTxn, accounts: Account[], policies: Policy[], carriers: Carrier[]): MatchResult {
  const naicOf = (name: string) => carriers.find((c) => c.name === name)?.naic ?? null;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  // 1. Policy #, line of business and writing company NAIC
  const pol = policies.find((p) => norm(p.policy_number) === norm(t.policy_number) && p.line_of_business === t.line_of_business && (!t.naic || naicOf(p.carrier) === t.naic));
  if (pol && byId.has(pol.account_id)) return { account: byId.get(pol.account_id)!, policy: pol, method: 'Policy' };
  const i = t.insured;
  const commercial = isCommercialLine(t.line_of_business) || !!i.business_name;
  let account: Account | undefined;
  let method: MatchMethod | null = null;
  if (commercial) {
    // 2. EIN  3. company name + ZIP  4. company name
    if (digits(i.ein).length === 9) { account = accounts.find((a) => digits(a.tax_id) === digits(i.ein)); method = 'EIN'; }
    if (!account && i.business_name) {
      const same = accounts.filter((a) => norm(a.business_name) === norm(i.business_name));
      account = same.find((a) => digits(a.zip).slice(0, 5) === digits(i.zip).slice(0, 5)) ?? (same.length === 1 ? same[0] : undefined);
      method = 'Company';
    }
  } else {
    // 2. first + last name, SSN / date of birth, ZIP
    account = accounts.find((a) => a.account_type !== 'Commercial' && norm(a.first_name) === norm(i.first_name) && norm(a.last_name) === norm(i.last_name)
      && digits(a.zip).slice(0, 5) === digits(i.zip).slice(0, 5) && ((!!i.dob && a.dob === i.dob) || (!!i.ssn_last4 && a.ssn_last4 === i.ssn_last4)));
    method = 'Account';
  }
  if (!account) {
    // 3. phone number that belongs to exactly one account
    const ph = digits(i.phone).slice(-10);
    if (ph.length === 10) {
      const hits = accounts.filter((a) => [a.phone, a.mobile_phone].some((x) => digits(x).slice(-10) === ph));
      if (hits.length === 1) { account = hits[0]; method = 'Phone'; }
    }
  }
  if (!account || !method) return null;
  // A matched account: the policy is the one with this number, if it exists there.
  const existing = policies.find((p) => p.account_id === account!.id && norm(p.policy_number) === norm(t.policy_number));
  return { account, policy: existing ?? null, method };
}

/** Accounts that probably belong to an unmatched download (for the Search step), best first. */
export function suggestAccounts(t: DownloadTxn, accounts: Account[]) {
  const i = t.insured;
  const score = (a: Account) => {
    let s = 0;
    if (i.business_name && a.business_name && norm(a.business_name).includes(norm(i.business_name).slice(0, 6))) s += 4;
    if (norm(a.last_name) === norm(i.last_name)) s += 3;
    if (norm(a.first_name).slice(0, 3) === norm(i.first_name).slice(0, 3)) s += 1;
    if (digits(a.zip).slice(0, 5) === digits(i.zip).slice(0, 5)) s += 1;
    if (norm(a.address) && norm(a.address) === norm(i.address)) s += 3;
    if (digits(i.phone).length >= 10 && [a.phone, a.mobile_phone].some((x) => digits(x).slice(-10) === digits(i.phone).slice(-10))) s += 2;
    return s;
  };
  return accounts.map((a) => ({ a, s: score(a) })).filter((x) => x.s >= 3).sort((x, y) => y.s - x.s).slice(0, 5).map((x) => x.a);
}

// ── Applying a transaction ──

/** Applies a download to the agency's records. With no policy, New Business / claims create one under `account`. */
export async function applyDownload(t: DownloadTxn, account: Account, policy: Policy | null, actor: string | null): Promise<{ policy_id: string | null; note: string }> {
  if (t.kind === 'claim') {
    const pol = policy ?? (await db.list('policies', { eq: { account_id: account.id } })).find((p) => norm(p.policy_number) === norm(t.policy_number)) ?? null;
    const c = t.claim!;
    const [existing] = await db.list('claims', { eq: { claim_number: c.claim_number } });
    if (existing) {
      await db.update('claims', existing.id, { status: c.status, amount_paid: c.amount_paid, amount_reserved: c.amount_reserved ?? existing.amount_reserved });
      return { policy_id: existing.policy_id, note: `Claim ${c.claim_number} updated to ${c.status}` };
    }
    await db.insert('claims', {
      account_id: account.id, policy_id: pol?.id ?? null, claim_number: c.claim_number, date_of_loss: c.date_of_loss, reported_date: t.received_at.slice(0, 10),
      loss_type: c.loss_type, description: t.description, status: c.status, amount_reserved: c.amount_reserved, amount_paid: c.amount_paid, adjuster_name: null, adjuster_phone: null,
    });
    return { policy_id: pol?.id ?? null, note: `Claim ${c.claim_number} added` };
  }
  if (!policy) {
    // New business (or a transaction for a policy the agency doesn't have yet): create it from the download.
    const p = await createPolicy({
      account_id: account.id, policy_number: t.policy_number, carrier: t.carrier, line_of_business: t.line_of_business, status: t.type === 'Cancellation' ? 'Cancelled' : 'Active',
      effective_date: t.effective_date, expiration_date: t.expiration_date, term_months: t.term_months, premium: t.premium, commission_rate: 12,
      billing_type: 'Direct Bill', source: 'Download', producer: account.producer, coverages: t.coverages,
    });
    return { policy_id: p.id, note: `Policy ${p.policy_number} created from the download` };
  }
  const p = policy;
  switch (t.type) {
    case 'New Business':
    case 'Renewal': {
      await db.update('policies', p.id, { effective_date: t.effective_date, expiration_date: t.expiration_date, term_months: t.term_months, premium: t.premium, status: 'Active', source: 'Download', ...(t.coverages.length ? { coverages: t.coverages } : {}) });
      if (t.type === 'Renewal') await addTransaction(p, 'Renewal', t.effective_date, t.premium, `Renewal downloaded from ${t.carrier} (${t.effective_date} – ${t.expiration_date})`);
      return { policy_id: p.id, note: t.type === 'Renewal' ? `Renewed to ${t.expiration_date}` : 'Policy updated' };
    }
    case 'Policy Change': {
      await db.update('policies', p.id, { premium: Math.round((Number(p.premium) + t.premium_change) * 100) / 100, source: 'Download' });
      await addTransaction(p, 'Endorsement', t.effective_date, t.premium_change, `${t.description} (downloaded from ${t.carrier})`);
      return { policy_id: p.id, note: 'Policy change applied' };
    }
    case 'Cancellation': {
      await db.update('policies', p.id, { status: 'Cancelled', source: 'Download' });
      await addTransaction(p, 'Cancellation', t.effective_date, t.premium_change, `${t.description} (downloaded from ${t.carrier})`);
      await followUp(account, p, `Cancellation downloaded — ${p.policy_number}`, `${t.carrier}: ${t.description}, effective ${t.effective_date}. Call the insured about reinstating or replacing coverage.`, actor);
      return { policy_id: p.id, note: 'Policy cancelled; follow-up task created' };
    }
    case 'Reinstatement': {
      await db.update('policies', p.id, { status: 'Active', source: 'Download' });
      await addTransaction(p, 'Reinstatement', t.effective_date, t.premium_change, `Reinstated by ${t.carrier}`);
      return { policy_id: p.id, note: 'Policy reinstated' };
    }
    case 'Non-Renewal': {
      await db.update('policies', p.id, { status: 'Non-Renewed', source: 'Download' });
      await addTransaction(p, 'Cancellation', p.expiration_date, 0, `Non-renewal: ${t.description} (downloaded from ${t.carrier})`);
      await followUp(account, p, `Non-renewal downloaded — ${p.policy_number}`, `${t.carrier} will not renew this policy at ${p.expiration_date} (${t.description}). Remarket before expiration.`, actor);
      return { policy_id: p.id, note: 'Marked non-renewed; remarket task created' };
    }
    default:
      return { policy_id: p.id, note: '' };
  }
}

async function followUp(account: Account, p: Policy, subject: string, description: string, actor: string | null) {
  await db.insert('activities', {
    account_id: account.id, policy_id: p.id, type: 'Task', subject, description, due_date: addDays(today(), 1), priority: 'High', status: 'Open',
    assigned_to: account.csr ?? actor, completed_at: null,
  }).catch(() => {});
}

/** Auto-matches and applies every unmatched transaction it can. Returns how many matched. */
export async function rematch(ids: string[] | 'all', actor: string | null) {
  const [accounts, policies, carriers] = await Promise.all([db.list('accounts'), db.list('policies'), db.list('carriers')]);
  return updateStore(async (s) => {
    let n = 0;
    for (const t of s.items) {
      if (t.status !== 'Unmatched' || (ids !== 'all' && !ids.includes(t.id))) continue;
      const m = autoMatch(t, accounts, policies, carriers);
      if (!m) continue;
      const r = await applyDownload(t, m.account, m.policy, actor);
      Object.assign(t, { status: 'Matched', match_method: m.method, account_id: m.account.id, policy_id: r.policy_id, processed_at: new Date().toISOString(), processed_by: actor ?? 'System', note: r.note });
      if (r.policy_id && !policies.some((p) => p.id === r.policy_id)) { const np = await db.get('policies', r.policy_id); if (np) policies.push(np); }
      n++;
    }
    return n;
  });
}

/** Manual match / create from the Unmatched screen. */
export async function resolveDownload(id: string, account: Account, policy: Policy | null, method: MatchMethod, actor: string | null) {
  return updateStore(async (s) => {
    const t = s.items.find((x) => x.id === id);
    if (!t || t.status !== 'Unmatched') throw new Error('This download was already processed.');
    const r = await applyDownload(t, account, policy, actor);
    Object.assign(t, { status: 'Matched', match_method: method, account_id: account.id, policy_id: r.policy_id, processed_at: new Date().toISOString(), processed_by: actor, note: r.note });
    if (method === 'Manual' || method === 'Created') await logActivity({ account_id: account.id, policy_id: r.policy_id, subject: `Download matched — ${t.policy_number}`, description: `${t.type} from ${t.carrier} ${method === 'Created' ? 'created as a new account' : 'matched manually'}. ${r.note}`, assigned_to: actor }).catch(() => {});
    return r;
  });
}

export async function removeDownloads(ids: string[]) {
  return updateStore((s) => { const before = s.items.length; s.items = s.items.filter((t) => !(ids.includes(t.id) && t.status === 'Unmatched')); return before - s.items.length; });
}

/** Creates the account a download describes (Create new account and policy from transaction). */
export async function createAccountFromDownload(t: DownloadTxn, opts: { commercial: boolean; producer: string | null; csr: string | null }) {
  const i = t.insured;
  return db.insert('accounts', {
    first_name: i.first_name, last_name: i.last_name, email: i.email ?? '', phone: i.phone, mobile_phone: i.phone, address: i.address, city: i.city, state: i.state, zip: i.zip,
    dob: opts.commercial ? null : i.dob, ssn_last4: opts.commercial ? null : i.ssn_last4, tax_id: opts.commercial ? i.ein : null,
    account_type: opts.commercial ? 'Commercial' : 'Personal', business_name: opts.commercial ? i.business_name ?? `${i.first_name} ${i.last_name}` : null,
    status: 'Active', producer: opts.producer, csr: opts.csr, lead_source: 'Carrier Download', policy_type: t.line_of_business, customer_since: today(),
  } as never);
}

// ── Simulated daily feed ──

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const FIRST = ['Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Jamie', 'Quinn', 'Rowan', 'Elena', 'Marcus', 'Priya', 'Hector', 'Lena', 'Owen'];
const LAST = ['Calloway', 'Pruitt', 'Okafor', 'Lindqvist', 'Barajas', 'Whitcomb', 'Nakamura', 'Delgado', 'Haverford', 'Moreau', 'Kessler', 'Abernathy'];
const STREETS = ['Cedar Hollow Dr', 'Ridgeview Ln', 'Maple Crest Ct', 'Pecan Valley Rd', 'Lakeshore Blvd', 'Willow Run Way'];
const PLACES: [string, string, string][] = [['Austin', 'TX', '78745'], ['Round Rock', 'TX', '78664'], ['San Antonio', 'TX', '78258'], ['Plano', 'TX', '75093'], ['Tulsa', 'OK', '74133'], ['Denver', 'CO', '80202']];
const CHANGES = ['Vehicle added', 'Driver added', 'Coverage limits increased', 'Deductible changed', 'Address change', 'Lienholder added', 'Vehicle removed'];
const CANCELS = ['Non-payment of premium', 'Insured request', 'Non-payment of premium', 'Underwriting reasons'];
const NONRENEW = ['Underwriting — loss history', 'Carrier exiting the market', 'Property condition'];
const LOSSES: Record<string, string[]> = { auto: ['Collision', 'Comprehensive', 'Glass', 'Theft'], home: ['Wind/Hail', 'Water Damage', 'Fire', 'Theft'], comm: ['Liability', 'Property Damage', 'Workers Injury'] };

function insuredOf(a: Account): DownloadInsured {
  return { first_name: a.first_name, last_name: a.last_name, business_name: a.business_name, dob: a.dob, ssn_last4: a.ssn_last4, ein: a.tax_id, address: a.address ?? '', city: a.city ?? '', state: a.state ?? '', zip: a.zip ?? '', phone: a.mobile_phone ?? a.phone, email: a.email };
}
const policyNo = (line: string, r: () => number) => `${line.replace(/[^A-Z]/g, '').slice(0, 2) || 'PL'}-${Math.floor(1000000 + r() * 8999999)}`;

/** One day's transactions from the carriers, built from the agency's book (deterministic per day). */
export function buildDailyFeed(day: string, accounts: Account[], policies: Policy[], carriers: Carrier[], claims: Claim[]): DownloadTxn[] {
  // The named practice insureds (lava-demo.example) stay stable for training exercises.
  accounts = accounts.filter((a) => !/lava-demo\.example$/i.test(a.email ?? ''));
  if (!accounts.length) return [];
  const r = rng(Number(day.replace(/-/g, '')) * 7 + accounts.length);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const naic = (name: string) => carriers.find((c) => c.name === name)?.naic ?? null;
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const active = policies.filter((p) => p.status === 'Active' && acct.has(p.account_id));
  const at = (h: number) => `${day}T${String(6 + h).padStart(2, '0')}:${String(Math.floor(r() * 59)).padStart(2, '0')}:00.000Z`;
  const out: DownloadTxn[] = [];
  const base = (p: Policy | null, a: Account, type: DownloadTxnType, extra: Partial<DownloadTxn>): DownloadTxn => ({
    id: uuid(), received_at: at(out.length), kind: 'policy', type, carrier: p?.carrier ?? pick(carriers).name, naic: naic(p?.carrier ?? ''), policy_number: p?.policy_number ?? '',
    line_of_business: p?.line_of_business ?? 'Personal Auto', effective_date: p?.effective_date ?? day, expiration_date: p?.expiration_date ?? addMonths(day, 12), term_months: p?.term_months ?? 12,
    premium: Number(p?.premium ?? 0), premium_change: 0, description: '', insured: insuredOf(a), coverages: [], claim: null,
    status: 'Unmatched', match_method: null, account_id: null, policy_id: null, processed_at: null, processed_by: null, note: null, ...extra,
  });
  const used = new Set<string>();
  const take = (list: Policy[]) => { const p = list.filter((x) => !used.has(x.id))[Math.floor(r() * list.length)]; if (p) used.add(p.id); return p; };

  // Renewals: policies at (or just past) expiration.
  for (const p of active.filter((x) => x.expiration_date <= addDays(day, 21) && x.expiration_date >= addDays(day, -5)).slice(0, 3)) {
    used.add(p.id);
    const prem = Math.round(Number(p.premium) * (1 + (r() * 0.14 - 0.02)));
    out.push(base(p, acct.get(p.account_id)!, 'Renewal', { effective_date: p.expiration_date, expiration_date: addMonths(p.expiration_date, p.term_months), premium: prem, premium_change: prem, description: `Renewal ${p.expiration_date}` }));
  }
  // Policy changes
  for (let k = 0; k < 2; k++) {
    const p = take(active); if (!p) break;
    const ch = Math.round((r() * 220 - 40) * 100) / 100;
    out.push(base(p, acct.get(p.account_id)!, 'Policy Change', { effective_date: day, premium: Number(p.premium) + ch, premium_change: ch, description: pick(CHANGES) }));
  }
  // Cancellation (most days) and non-renewal (some days)
  if (r() < 0.7) { const p = take(active); if (p) out.push(base(p, acct.get(p.account_id)!, 'Cancellation', { effective_date: addDays(day, 10), premium_change: -Math.round(Number(p.premium) * 0.3), description: pick(CANCELS) })); }
  if (r() < 0.35) { const p = take(active.filter((x) => x.expiration_date <= addDays(day, 60))); if (p) out.push(base(p, acct.get(p.account_id)!, 'Non-Renewal', { description: pick(NONRENEW) })); }
  // Reinstatement of a policy the carrier cancelled
  const cancelled = policies.filter((p) => p.status === 'Cancelled' && p.source === 'Download' && acct.has(p.account_id));
  if (cancelled.length && r() < 0.5) { const p = pick(cancelled); out.push(base(p, acct.get(p.account_id)!, 'Reinstatement', { effective_date: day, premium_change: Math.round(Number(p.premium) * 0.3), description: 'Payment received' })); }
  // New business for an existing insured (matches on account)
  const personal = accounts.filter((a) => a.account_type !== 'Commercial' && a.dob && a.zip);
  if (personal.length) {
    const a = pick(personal); const line: LineOfBusiness = pick(['Umbrella', 'Renters', 'Motorcycle', 'Boat'] as LineOfBusiness[]); const c = carriers.find((x) => x.lines.includes(line)) ?? pick(carriers);
    const prem = Math.round(180 + r() * 600);
    out.push(base(null, a, 'New Business', { carrier: c.name, naic: c.naic, policy_number: policyNo(line, r), line_of_business: line, effective_date: day, expiration_date: addMonths(day, 12), premium: prem, premium_change: prem, description: `New ${line} policy` }));
  }
  // Unmatched: an insured the agency doesn't have yet …
  if (r() < 0.8) {
    const [city, state, zip] = pick(PLACES); const first = pick(FIRST), last = pick(LAST); const line: LineOfBusiness = pick(['Personal Auto', 'Homeowners'] as LineOfBusiness[]);
    const c = carriers.find((x) => x.lines.includes(line)) ?? pick(carriers); const prem = Math.round(900 + r() * 1800);
    out.push({ ...base(null, accounts[0], 'New Business', { carrier: c.name, naic: c.naic, policy_number: policyNo(line, r), line_of_business: line, effective_date: day, expiration_date: addMonths(day, line === 'Personal Auto' ? 6 : 12), term_months: line === 'Personal Auto' ? 6 : 12, premium: prem, premium_change: prem, description: `New ${line} policy` }),
      insured: { first_name: first, last_name: last, business_name: null, dob: `19${60 + Math.floor(r() * 39)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`, ssn_last4: String(1000 + Math.floor(r() * 8999)), ein: null, address: `${100 + Math.floor(r() * 9800)} ${pick(STREETS)}`, city, state, zip, phone: `(512) 555-${String(1000 + Math.floor(r() * 8999))}`, email: `${first}.${last}@lava-demo.example`.toLowerCase() } });
  }
  // … and an existing insured whose download details don't line up (name spelled differently, moved ZIP).
  if (r() < 0.6 && personal.length) {
    const a = pick(personal); const p = policies.find((x) => x.account_id === a.id);
    if (p) out.push({ ...base(p, a, 'Policy Change', { policy_number: `${p.policy_number.replace(/-/g, '')}0`, effective_date: day, premium_change: 45, premium: Number(p.premium) + 45, description: 'Driver added' }), insured: { ...insuredOf(a), first_name: a.first_name.slice(0, 1) + '.', zip: String(Number(a.zip ?? '0') + 1).padStart(5, '0'), dob: null, ssn_last4: null, phone: null } });
  }
  // Claims: a new claim on an active policy, an update on an open one, sometimes one for an unknown policy.
  const cp = take(active);
  if (cp) {
    const kind = ['Personal Auto', 'Commercial Auto', 'Motorcycle'].includes(cp.line_of_business) ? 'auto' : isCommercialLine(cp.line_of_business) ? 'comm' : 'home';
    const reserve = Math.round(1500 + r() * 9000);
    out.push(base(cp, acct.get(cp.account_id)!, 'Claim', { kind: 'claim', effective_date: day, description: 'First notice of loss reported to the carrier', claim: { claim_number: `CLM-${Math.floor(100000 + r() * 899999)}`, date_of_loss: addDays(day, -Math.floor(1 + r() * 6)), loss_type: pick(LOSSES[kind]), status: 'Open', amount_reserved: reserve, amount_paid: null } }));
  }
  const open = claims.filter((c) => c.claim_number && (c.status === 'Open' || c.status === 'Under Review') && c.policy_id);
  if (open.length && r() < 0.6) {
    const c = pick(open); const p = policies.find((x) => x.id === c.policy_id); const a = acct.get(c.account_id);
    if (p && a) { const paid = Math.round((c.amount_reserved ?? 4000) * (0.6 + r() * 0.4)); out.push(base(p, a, 'Claim', { kind: 'claim', effective_date: day, description: `Claim payment issued`, claim: { claim_number: c.claim_number!, date_of_loss: c.date_of_loss, loss_type: c.loss_type, status: 'Paid', amount_reserved: c.amount_reserved, amount_paid: paid } })); }
  }
  return out;
}

/**
 * Runs the daily download once per day (on app start): receives each missing day's feed (the past week on first
 * run), then auto-matches and applies everything it can. Returns how many transactions arrived.
 */
export async function runDailyDownload(actor: string | null = null) {
  const t = today();
  const { value } = await readStore();
  if (value.last_run === t) return 0;
  const start = value.last_run && value.last_run > addDays(t, -7) ? addDays(value.last_run, 1) : addDays(t, -6);
  // Claim today's run first so another tab or user doesn't download the same days again.
  const claimed = await updateStore((s) => { if (s.last_run === t) return false; s.last_run = t; return true; });
  if (!claimed) return 0;
  let received = 0;
  // Day by day, applying each day's matches before the next day's feed is built (as it happens in real life).
  for (let d = start; d <= t; d = addDays(d, 1)) {
    const [accounts, policies, carriers, claims] = await Promise.all([db.list('accounts'), db.list('policies'), db.list('carriers'), db.list('claims')]);
    if (!accounts.length || !carriers.length) break;
    const feed = buildDailyFeed(d, accounts, policies, carriers, claims);
    if (!feed.length) continue;
    await updateStore((s) => { s.items.push(...feed); });
    await rematch(feed.map((x) => x.id), actor);
    received += feed.length;
  }
  return received;
}

/** Re-delivers today's feed on demand (the "Run download now" button for trainers). */
export async function receiveNow(actor: string | null) {
  const [accounts, policies, carriers, claims] = await Promise.all([db.list('accounts'), db.list('policies'), db.list('carriers'), db.list('claims')]);
  const feed = buildDailyFeed(`${today()}`, accounts, policies, carriers, claims).map((x) => ({ ...x, id: uuid(), received_at: new Date().toISOString() }));
  // Re-running the same day would repeat the same policy numbers; make the new-business ones unique.
  for (const f of feed) if (f.type === 'New Business') f.policy_number = `${f.policy_number.slice(0, 3)}${Math.floor(1000000 + Math.random() * 8999999)}`;
  await updateStore((s) => { s.items.push(...feed); });
  await rematch(feed.map((f) => f.id), actor);
  return feed.length;
}
