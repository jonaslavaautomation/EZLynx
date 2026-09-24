import { accountName } from '@/lib/format';
import type { Account, ClaimTransaction, ClaimTransactionType, CommissionRule, CommissionStatementLine, Policy, StatementStatus, TransactionType } from '@/lib/types';
import type { Tone } from '@/components/ui';

export { parseAmount, proRataReturn, signedMoney, TERM_OPTIONS } from '@/modules/policies/shared';

/** Round to cents so sums don't accumulate float noise. */
export const cents = (n: number) => Math.round(n * 100) / 100;

export const TX_TYPES: TransactionType[] = ['New Business', 'Renewal', 'Endorsement', 'Cancellation', 'Reinstatement', 'Audit', 'Rewrite'];
export const TX_TONES: Record<TransactionType, Tone> = {
  'New Business': 'green', Renewal: 'teal', Endorsement: 'blue', Cancellation: 'red', Reinstatement: 'purple', Audit: 'amber', Rewrite: 'purple',
};

export const CLAIM_TX_TYPES: ClaimTransactionType[] = ['Reserve', 'Payment', 'Expense', 'Recovery'];
export const CLAIM_TX_TONES: Record<ClaimTransactionType, Tone> = { Reserve: 'blue', Payment: 'green', Expense: 'amber', Recovery: 'purple' };
export const CLAIM_TX_HINTS: Record<ClaimTransactionType, string> = {
  Reserve: 'Sets the claim’s current reserve to this amount.',
  Payment: 'Adds to the amount paid on the claim.',
  Expense: 'Adjusting / legal expense; tracked separately from loss payments.',
  Recovery: 'Salvage or subrogation recovered; reduces the amount paid.',
};

export const STATEMENT_STATUSES: StatementStatus[] = ['Open', 'Reconciled', 'Posted'];
export const STATEMENT_TONES: Record<StatementStatus, Tone> = { Open: 'blue', Reconciled: 'amber', Posted: 'green' };

export const LINE_TX_TYPES = ['New Business', 'Renewal', 'Endorsement', 'Cancellation', 'Audit', 'Rewrite', 'Chargeback'];

export const insuredName = (a: Account | undefined | null) => (a ? accountName(a) : 'Unknown account');

/** Summaries of claim transactions (amounts are always positive; the type gives the direction). */
export function claimTxTotals(rows: ClaimTransaction[]) {
  const byClaim = new Map<string, { reserve: number | null; reserveDate: string; paid: number; expense: number; recovery: number }>();
  let paid = 0, expense = 0, recovery = 0;
  for (const t of rows) {
    const c = byClaim.get(t.claim_id) ?? { reserve: null, reserveDate: '', paid: 0, expense: 0, recovery: 0 };
    const amt = Number(t.amount) || 0;
    if (t.type === 'Reserve') {
      const key = `${t.transaction_date}|${t.created_at}`;
      if (key >= c.reserveDate) { c.reserve = amt; c.reserveDate = key; }
    } else if (t.type === 'Payment') { c.paid += amt; paid += amt; }
    else if (t.type === 'Expense') { c.expense += amt; expense += amt; }
    else if (t.type === 'Recovery') { c.recovery += amt; recovery += amt; }
    byClaim.set(t.claim_id, c);
  }
  let reserves = 0, incurred = 0;
  for (const c of byClaim.values()) {
    reserves += c.reserve ?? 0;
    // Incurred = net paid + outstanding reserve + expenses.
    incurred += Math.max(c.reserve ?? 0, c.paid - c.recovery) + c.expense;
  }
  return { reserves: cents(reserves), paid: cents(paid), expense: cents(expense), recovery: cents(recovery), incurred: cents(incurred) };
}

// ── Commission rules ──

export type BusinessKind = 'New Business' | 'Renewal' | null;

export function businessKind(transactionType: string): BusinessKind {
  const s = transactionType.toLowerCase();
  if (s.includes('new')) return 'New Business';
  if (s.includes('renew')) return 'Renewal';
  return null;
}

const specificity = (r: CommissionRule) => (r.carrier ? 2 : 0) + (r.line_of_business ? 1 : 0) + (r.business_type !== 'All' ? 1 : 0);

export function ruleApplies(r: CommissionRule, kind: BusinessKind, line: string | null, carrier: string | null) {
  if (!r.active) return false;
  if (r.business_type !== 'All' && r.business_type !== kind) return false;
  if (r.line_of_business && r.line_of_business !== line) return false;
  if (r.carrier && (r.carrier || '').toLowerCase() !== (carrier || '').toLowerCase()) return false;
  return true;
}

/**
 * The rule that pays `staff` for a line with this scope: the most specific applicable rule
 * (carrier > line > business type), so a carrier-specific override replaces a general rule.
 */
export function bestRule(rules: CommissionRule[], staff: string, kind: BusinessKind, line: string | null, carrier: string | null) {
  let best: CommissionRule | null = null;
  for (const r of rules) {
    if (r.staff_name !== staff || !ruleApplies(r, kind, line, carrier)) continue;
    if (!best || specificity(r) > specificity(best)) best = r;
  }
  return best;
}

/** The service team assigned to a policy: its producer (policy, else account) and the account CSR. */
export function assignedTeam(policy: Policy | undefined, account: Account | undefined) {
  const producer = policy?.producer || account?.producer || null;
  const csr = account?.csr || null;
  return [...new Set([producer, csr].filter((x): x is string => !!x))];
}

export type PayoutRow = {
  id: string;
  line_id: string;
  policy_number: string;
  insured: string;
  staff_name: string;
  rule: string;
  split_percent: number;
  commission: number;
  payout: number;
};

/** Runs statement lines through the Service Team Rules. Unmatched lines pay nothing (the agency keeps it all). */
export function computePayouts(opts: {
  lines: CommissionStatementLine[];
  statementCarrier: string;
  rules: CommissionRule[];
  policies: Map<string, Policy>;
  accounts: Map<string, Account>;
}) {
  const rows: PayoutRow[] = [];
  let commission = 0;
  for (const l of opts.lines) {
    const amt = Number(l.commission_amount) || 0;
    commission += amt;
    if (!l.policy_id) continue;
    const p = opts.policies.get(l.policy_id);
    if (!p) continue;
    const a = opts.accounts.get(p.account_id);
    const kind = businessKind(l.transaction_type);
    for (const staff of assignedTeam(p, a)) {
      const r = bestRule(opts.rules, staff, kind, p.line_of_business, opts.statementCarrier || p.carrier);
      if (!r) continue;
      rows.push({
        id: `${l.id}:${staff}`, line_id: l.id, policy_number: l.policy_number, insured: l.insured_name || insuredName(a), staff_name: staff,
        rule: r.name, split_percent: Number(r.split_percent), commission: amt, payout: cents((amt * Number(r.split_percent)) / 100),
      });
    }
  }
  const byStaff = new Map<string, { staff_name: string; lines: number; commission: number; payout: number }>();
  for (const r of rows) {
    const s = byStaff.get(r.staff_name) ?? { staff_name: r.staff_name, lines: 0, commission: 0, payout: 0 };
    s.lines += 1;
    s.commission = cents(s.commission + r.commission);
    s.payout = cents(s.payout + r.payout);
    byStaff.set(r.staff_name, s);
  }
  const paid = cents(rows.reduce((s, r) => s + r.payout, 0));
  return { rows, byStaff: [...byStaff.values()].sort((a, b) => b.payout - a.payout), commission: cents(commission), paid, retained: cents(commission - paid) };
}

/**
 * Scopes where a policy's producer and CSR together could earn more than 100% of the commission.
 * Evaluates every combination of business type × line × carrier mentioned by the active rules.
 */
export function overAllocatedScopes(rules: CommissionRule[]) {
  const active = rules.filter((r) => r.active);
  const lines = [null, ...new Set(active.map((r) => r.line_of_business).filter((x): x is string => !!x))];
  const carriers = [null, ...new Set(active.map((r) => r.carrier).filter((x): x is string => !!x))];
  const staff = [...new Set(active.map((r) => r.staff_name))];
  const out: { scope: string; total: number; members: string[] }[] = [];
  for (const kind of ['New Business', 'Renewal', null] as BusinessKind[]) {
    for (const line of lines) {
      for (const carrier of carriers) {
        const splits = staff
          .map((s) => ({ s, pct: Number(bestRule(active, s, kind, line, carrier)?.split_percent ?? 0) }))
          .filter((x) => x.pct > 0)
          .sort((a, b) => b.pct - a.pct);
        const single = splits[0];
        const top2 = splits.slice(0, 2);
        const total = top2.reduce((t, x) => t + x.pct, 0);
        if (single && (single.pct > 100 || total > 100)) {
          out.push({ scope: [kind ?? 'Other transactions', line ?? 'any line', carrier ?? 'any carrier'].join(' · '), total, members: top2.map((x) => `${x.s} ${x.pct}%`) });
        }
      }
    }
  }
  return out;
}

// ── CSV ──

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const normNumber = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, '');
