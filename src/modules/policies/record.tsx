import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Menu, Modal, Select, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { addTransaction, logActivity } from '@/lib/domain';
import { accountName, fmtMoney, today } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { navigate, setParam, useRoute } from '@/lib/router';
import { US_STATES, type Account, type Driver, type Policy, type PolicyTransaction, type Vehicle } from '@/lib/types';
import { useAppConfig, type AdditionalInterest, type PolicyExtras, type ServiceTeamMember } from '@/modules/admin/config';
import { ApplicantDrawer, RecordTabs, useQuoteThemeDialogs } from '@/modules/autoquote/shell';
import { decodeVin } from '@/modules/autoquote/rate';
import { GenerateModal } from '@/modules/documents/actions';
import { DocumentList } from '@/modules/documents';
import { CoverageEditor } from './coverages';
import { isAutoLine, lobTitle, mdy, mmddyyyy, savePolicyExtras, usePolicyExtras, writingCompanies } from './extras';
import { canDo, fromDrafts, parseAmount, signedMoney, toDrafts, type CoverageDraft, type PolicyAction } from './shared';
import { TransactionModal } from './transactions';
import { ClaimsTab, HistoryTab } from './PolicyDetail';

/*
 * EZLynx policy screens inside the insured's record (left panel + record tabs, Policies tab active):
 *   /accounts/:id/policy/:pid          Policy summary (Summary / History / Claims / Documents / Notes)
 *   /accounts/:id/policy/:pid/change   Change Policy form (endorsement)
 *   /accounts/:id/policy/:pid/edit     Policy editor (Insured Information … Additional Interests)
 */

export type PolicyView = 'summary' | 'change' | 'edit';
export const policyPath = (p: Pick<Policy, 'id' | 'account_id'>, view: PolicyView = 'summary', qs = '') =>
  `/accounts/${p.account_id}/policy/${p.id}${view === 'summary' ? '' : `/${view}`}${qs ? `?${qs}` : ''}`;

const cents = (n: number) => Math.round(n * 100) / 100;
const moneyIn = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BODY_STYLES = ['SEDAN 4', 'COUPE 2', 'HATCHBACK', 'SUV 4', 'PICKUP 2', 'PICKUP 4', 'VAN', 'WAGON', 'CONVERTIBLE', 'MOTORCYCLE', 'TRUCK'];
const INTEREST_TYPES = ['Lienholder', 'Loss Payee', 'Additional Insured', 'Mortgagee', 'Lessor'];

/** Suggested note to the insured about the latest change on this policy (last 7 days). */
function changeDraft(a: Account, p: Policy, change: PolicyExtras['last_change']) {
  if (!change || Date.now() - new Date(change.at).getTime() > 7 * 86400000) return undefined;
  const first = a.first_name || accountName(a);
  const line = isAutoLine(p) ? 'auto' : p.line_of_business === 'Homeowners' ? 'home' : lobTitle(p).toLowerCase();
  const what = change.description.replace(/[.s]+$/, '');
  return `Hi ${first}, we received an update from your carrier and your ${line} policy has been updated: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`;
}

export function PolicyRecordRoute({ accountId, policyId, view }: { accountId: string; policyId: string; view: PolicyView }) {
  const account = useRow('accounts', accountId);
  const policy = useRow('policies', policyId);
  const details = useAppConfig('policy_details');
  useQuoteThemeDialogs();
  if ((account.loading && !account.data) || (policy.loading && !policy.data)) return <LoadingBlock label="Loading policy…" />;
  const a = account.data, p = policy.data;
  if (!a || !p || p.account_id !== a.id) return <EmptyState icon={<User size={22} />} title="Policy not found" message="It may have been deleted." action={<Button onClick={() => navigate(`/accounts/${accountId}?tab=policies`)}>Back to policies</Button>} />;
  return (
    <div className="theme-quote -mx-5 -mt-4 flex min-h-[calc(var(--vh100)-104px)] bg-white">
      <ApplicantDrawer account={a} composeDraft={changeDraft(a, p, details.value.byPolicy[p.id]?.last_change)} />
      <div className="flex-1 min-w-0">
        <RecordTabs accountId={a.id} active="policies" />
        {view === 'change' && <ChangePolicy account={a} policy={p} />}
        {view === 'edit' && <PolicyEditor account={a} policy={p} />}
        {view === 'summary' && <PolicySummary account={a} policy={p} />}
      </div>
    </div>
  );
}

// ── Small building blocks ──

function Row({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3 min-h-[42px]">
      <label className="text-[12.5px] text-ink-700">{label}{required && <span className="text-red-600"> *</span>}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
const box = 'w-full h-9 rounded-sm border border-ink-300 bg-white px-2 text-[13px] outline-none focus:border-brand-500 disabled:bg-ink-50 disabled:text-ink-500';
const money = 'text-right tabular-nums';
function SectionHead({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-semibold tracking-wide uppercase text-ink-900 mb-2">{children}</h3>;
}

function PolicyBanner({ policy: p, extras, full }: { policy: Policy; extras: PolicyExtras; full?: boolean }) {
  const items: [string, string][] = [['Line of Business', lobTitle(p)], ['Term', `${mdy(p.effective_date)} - ${mdy(p.expiration_date)}`], ['Carrier', p.carrier], ['Full Term Premium', moneyIn(Number(p.premium))], ['Source', p.source]];
  if (full && extras.rating_state) items.push(['Rating State', extras.rating_state]);
  return (
    <div>
      <h1 className="text-[20px] text-[#2e9d4f]" data-testid="policy-banner">Policy Number: {p.policy_number} - {p.status}</h1>
      <div className="flex flex-wrap items-center text-[12.5px] text-ink-800 mt-0.5">
        {items.map(([k, v], i) => <span key={k} className={cx('pr-3 mr-3', i < items.length - 1 && 'border-r border-ink-300')}>{k}: <span className="text-ink-600">{v}</span></span>)}
      </div>
    </div>
  );
}

// ── Change Policy (endorsement) ──

function ChangePolicy({ account, policy: p }: { account: Account; policy: Policy }) {
  const { carriers, activeStaff, me } = useAppData();
  const { toast } = useFeedback();
  const { extras } = usePolicyExtras(p, account, carriers);
  const txns = useTable('policy_transactions', { eq: { policy_id: p.id }, order: { column: 'effective_date' } });
  const departments = useTable('departments', { order: { column: 'name' } });
  const rules = useTable('commission_rules', {});
  const firstTerm = txns.data.find((t) => t.type === 'New Business')?.effective_date ?? p.effective_date;

  const [date, setDate] = useState(() => (today() >= p.effective_date && today() <= p.expiration_date ? today() : p.effective_date));
  const [master, setMaster] = useState(p.carrier);
  const [writing, setWriting] = useState('');
  const [billing, setBilling] = useState<Policy['billing_type']>(p.billing_type);
  const [state, setState] = useState('');
  const [codes, setCodes] = useState({ original: '', override: '', agency: '' });
  const [change, setChange] = useState('');
  const [fees, setFees] = useState('');
  const [taxes, setTaxes] = useState('');
  const [fullTerm, setFullTerm] = useState<string | null>(null); // null = follows current + change
  const [written, setWritten] = useState<string | null>(null);
  const [commission, setCommission] = useState(String(p.commission_rate));
  const [commissionKind, setCommissionKind] = useState<'%' | '$'>('%');
  const [department, setDepartment] = useState('');
  const [team, setTeam] = useState<ServiceTeamMember[] | null>(null);
  const [override, setOverride] = useState(false);
  const [desc, setDesc] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'save' | 'edit'>(null);
  // A field's error clears as soon as it is edited.
  const fix = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  // Defaults from the stored extras once they load.
  useEffect(() => {
    setWriting((w) => w || extras.writing_company || writingCompanies(p.carrier)[0]);
    setState((s) => s || extras.rating_state || account.state || 'TX');
    setDepartment((d) => d || extras.department || '');
    setCodes((c) => (c.original || c.override || c.agency ? c : { original: extras.original_producer_code ?? '', override: extras.producer_code_override ?? '', agency: extras.agency_code ?? '' }));
  }, [extras.writing_company, extras.rating_state, extras.department, extras.original_producer_code, extras.producer_code_override, extras.agency_code, account.state, p.carrier]);

  const delta = change.trim() === '' ? 0 : parseAmount(change);
  const current = Number(p.premium);
  const termDays = Math.max(1, (new Date(p.expiration_date).getTime() - new Date(p.effective_date).getTime()) / 86400000);
  const leftDays = Math.min(termDays, Math.max(0, (new Date(p.expiration_date).getTime() - new Date(date || p.effective_date).getTime()) / 86400000));
  const autoFull = cents(current + (delta ?? 0));
  const autoWritten = cents(current + (delta ?? 0) * (leftDays / termDays));
  const full = fullTerm === null ? autoFull : parseAmount(fullTerm);
  const writ = written === null ? autoWritten : parseAmount(written);
  const annual = full === null ? null : cents(full * (12 / Math.max(1, p.term_months)));
  const commissionPct = commissionKind === '%' ? parseAmount(commission) : full ? ((parseAmount(commission) ?? 0) / full) * 100 : null;

  // Service team: the matching commission rule, unless overridden.
  const rule = rules.data.find((r) => r.active && (!r.carrier || r.carrier === master) && (!r.line_of_business || r.line_of_business === p.line_of_business) && (r.business_type === 'All' || r.business_type === 'New Business'));
  const ruleTeam: ServiceTeamMember[] = rule ? [{ staff: rule.staff_name, percent: rule.split_percent }] : extras.service_team ?? [];
  const members = override || !rule ? team ?? ruleTeam : ruleTeam;
  const commissionOnChange = (delta ?? 0) * ((commissionPct ?? 0) / 100);
  const staffNames = activeStaff.map((s) => s.name);
  const deptOptions = [...new Set(['Personal Lines (P/L)', 'Commercial Lines (C/L)', ...departments.data.map((d) => d.name)])];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!date) e.date = 'Change date is required';
    else if (date < p.effective_date || date > p.expiration_date) e.date = `Must fall within the term (${mdy(p.effective_date)} – ${mdy(p.expiration_date)})`;
    if (!master) e.master = 'Master company is required';
    if (delta === null) e.change = 'Enter the change premium (0 for none)';
    if (full === null || full < 0) e.full = 'Full-term premium must be 0 or more';
    if (writ === null || writ < 0) e.written = 'Written premium must be 0 or more';
    if (commissionPct === null || commissionPct < 0 || commissionPct > 100) e.commission = 'Commission must be between 0 and 100%';
    if (!desc.trim()) e.desc = 'Describe the change';
    if (members.reduce((s, m) => s + m.percent, 0) > 100) e.team = 'Service team splits cannot exceed 100%';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (then: 'summary' | 'edit') => {
    if (!validate()) return;
    setBusy(then === 'edit' ? 'edit' : 'save');
    try {
      const d = delta ?? 0;
      await addTransaction(p, 'Endorsement', date, d, desc.trim());
      await db.update('policies', p.id, { premium: full!, carrier: master, billing_type: billing, commission_rate: cents(commissionPct ?? p.commission_rate) });
      await savePolicyExtras(p.id, (x) => ({
        ...x, writing_company: writing, rating_state: state, department, original_producer_code: codes.original, producer_code_override: codes.override, agency_code: codes.agency,
        service_team: members, override_rule: override, last_change: { date, description: desc.trim(), premium_change: d, at: new Date().toISOString() },
      }));
      await logActivity({ account_id: p.account_id, policy_id: p.id, subject: `Policy changed — ${lobTitle(p)} ${p.policy_number}`, description: `${desc.trim()} (effective ${mdy(date)}, premium ${signedMoney(d, fmtMoney)}${fees ? `, fees ${fees}` : ''}${taxes ? `, taxes ${taxes}` : ''})`, assigned_to: me?.name ?? null }).catch(() => {});
      toast(`Policy ${p.policy_number} changed`);
      navigate(then === 'edit' ? policyPath(p, 'edit', `tab=${isAutoLine(p) ? 'vehicles' : 'coverages'}&from=change`) : policyPath(p, 'summary', 'changed=1'));
    } catch (e) {
      setErrors({ form: (e as Error).message });
      setBusy(null);
    }
  };

  const err = (k: string) => errors[k] && <div className="text-[11px] text-red-600 mt-0.5">{errors[k]}</div>;
  const moneyBox = (value: string, set: (v: string) => void, k: string, label: string, placeholder = '') => (
    <><input aria-label={label} className={cx(box, money, errors[k] && 'border-red-500')} value={value} placeholder={placeholder} inputMode="decimal" onChange={(e) => { set(e.target.value); fix(k); }} onBlur={() => { const n = parseAmount(value); if (n !== null && value.trim()) set(moneyIn(n)); }} />{err(k)}</>
  );

  return (
    <div className="px-5 py-4">
      <h1 className="text-[20px] font-semibold text-ink-900 mb-4">Change Policy</h1>
      {errors.form && <div className="mb-3"><ErrorBanner message={errors.form} /></div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-x-10 gap-y-6">
        <section>
          <SectionHead>Policy Info</SectionHead>
          <Row label="Line of Business" required><select aria-label="Line of Business" className={box} disabled value={lobTitle(p)}><option>{lobTitle(p)}</option></select></Row>
          <Row label="Change Date" required><input aria-label="Change Date" type="date" className={cx(box, errors.date && 'border-red-500')} value={date} min={p.effective_date} max={p.expiration_date} onChange={(e) => { setDate(e.target.value); fix('date'); }} />{err('date')}</Row>
          <Row label="Master Company" required>
            <select aria-label="Master Company" className={box} value={master} onChange={(e) => { setMaster(e.target.value); setWriting(writingCompanies(e.target.value)[0]); }}>
              {[...new Set([p.carrier, ...carriers.filter((c) => c.lines.includes(p.line_of_business)).map((c) => c.name)])].map((c) => <option key={c}>{c}</option>)}
            </select>{err('master')}
          </Row>
          <Row label="Writing Company"><select aria-label="Writing Company" className={box} value={writing} onChange={(e) => setWriting(e.target.value)}>{[...new Set([writing, ...writingCompanies(master)].filter(Boolean))].map((w) => <option key={w}>{w}</option>)}</select></Row>
          <Row label="Billing Type" required><select aria-label="Billing Type" className={cx(box, 'w-40')} value={billing} onChange={(e) => setBilling(e.target.value as Policy['billing_type'])}><option value="Direct Bill">Direct</option><option value="Agency Bill">Agency</option></select></Row>
          <Row label="Rating State" required><select aria-label="Rating State" className={box} value={state} onChange={(e) => setState(e.target.value)}>{US_STATES.map((s) => <option key={s}>{s}</option>)}</select></Row>
          <Row label="LOB Orig. Date"><span className="text-[13px] text-brand-700">{mdy(firstTerm)}</span></Row>
          <Row label="Original Producer Code"><input aria-label="Original Producer Code" className={box} value={codes.original} maxLength={20} onChange={(e) => setCodes({ ...codes, original: e.target.value })} /></Row>
          <Row label="Producer Code Override"><input aria-label="Producer Code Override" className={box} value={codes.override} maxLength={20} onChange={(e) => setCodes({ ...codes, override: e.target.value })} /></Row>
          <Row label="Agency Code"><input aria-label="Agency Code" className={box} value={codes.agency} maxLength={20} onChange={(e) => setCodes({ ...codes, agency: e.target.value })} /></Row>
        </section>

        <section>
          <SectionHead>Premium &amp; Additional Charges</SectionHead>
          <Row label="Change Premium" required>{moneyBox(change, setChange, 'change', 'Change Premium', '$0.00')}<div className="text-[11px] text-ink-500 mt-0.5">Current premium {moneyIn(current)}. Negative for a return premium.</div></Row>
          <Row label="Written Premium" required>{moneyBox(written ?? (writ === null ? '' : moneyIn(autoWritten)), (v) => setWritten(v), 'written', 'Written Premium')}</Row>
          <Row label="Estimated Fees">{moneyBox(fees, setFees, 'fees', 'Estimated Fees')}</Row>
          <Row label="Estimated Taxes">{moneyBox(taxes, setTaxes, 'taxes', 'Estimated Taxes')}</Row>
          <Row label="Full-Term Premium" required>{moneyBox(fullTerm ?? moneyIn(autoFull), (v) => setFullTerm(v), 'full', 'Full-Term Premium')}</Row>
          <Row label="Annual Premium" required><input aria-label="Annual Premium" className={cx(box, money)} disabled value={annual === null ? '' : moneyIn(annual)} /></Row>
          <Row label="Total Commission">
            <div className="flex gap-2"><input aria-label="Total Commission" className={cx(box, money, errors.commission && 'border-red-500')} value={commission} inputMode="decimal" onChange={(e) => { setCommission(e.target.value); fix('commission'); }} />
              <select aria-label="Commission type" className={cx(box, 'w-16')} value={commissionKind} onChange={(e) => { const k = e.target.value as '%' | '$'; setCommissionKind(k); setCommission(k === '$' ? String(cents((full ?? 0) * p.commission_rate / 100)) : String(p.commission_rate)); }}><option>%</option><option>$</option></select>
            </div>{err('commission')}
          </Row>
        </section>

        <section>
          <SectionHead>Department</SectionHead>
          <select aria-label="Department" className={cx(box, 'max-w-[380px]')} value={department} onChange={(e) => setDepartment(e.target.value)}>{deptOptions.map((d) => <option key={d}>{d}</option>)}</select>
          <div className="mt-4"><SectionHead>Service Team</SectionHead></div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!!rule && !override} onClick={() => setTeam([...members, { staff: staffNames.find((n) => !members.some((m) => m.staff === n)) ?? staffNames[0] ?? '', percent: 0 }])} className="inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-ink-300 bg-white text-[13px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"><Plus size={13} /> Add</button>
            <span className="text-[12.5px] font-semibold text-brand-700">{rule ? `Matches rule: ${rule.name}` : 'No commission rule matches'}</span>
            <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-ink-700"><input type="checkbox" className="accent-[#007a78]" checked={override} disabled={!rule} onChange={(e) => { setOverride(e.target.checked); setTeam(ruleTeam); }} /> Override Rule</label>
          </div>
          <div className="mt-2 space-y-2" aria-label="Service team">
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_90px_24px] items-center gap-2">
                <select aria-label="Service team member" className={box} disabled={!!rule && !override} value={m.staff} onChange={(e) => setTeam(members.map((x, j) => (j === i ? { ...x, staff: e.target.value } : x)))}>{[...new Set([m.staff, ...staffNames])].map((n) => <option key={n}>{n}</option>)}</select>
                <div className="flex"><input aria-label="Split percent" className={cx(box, money, 'rounded-r-none')} disabled={!!rule && !override} value={m.percent} inputMode="decimal" onChange={(e) => setTeam(members.map((x, j) => (j === i ? { ...x, percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)))} /><span className="h-9 px-2 grid place-items-center border border-l-0 border-ink-300 bg-ink-50 text-[12px] text-ink-500 rounded-r-sm">%A</span></div>
                <span className="text-[13px] tabular-nums text-right">{moneyIn(cents(commissionOnChange * m.percent / 100))}</span>
                {(!rule || override) ? <button type="button" aria-label="Remove service team member" onClick={() => setTeam(members.filter((_, j) => j !== i))} className="text-ink-400 hover:text-red-600"><Trash2 size={14} /></button> : <span />}
              </div>
            ))}
            {!members.length && <div className="text-[12.5px] text-ink-500">No service team members.</div>}
            {err('team')}
          </div>
          <div className="mt-5">
            <label className="block text-[12px] text-ink-700 mb-1" htmlFor="change-desc">Description<span className="text-red-600"> *</span></label>
            <textarea id="change-desc" aria-label="Description" className={cx('w-full h-[200px] rounded-sm border bg-white p-2 text-[13px] font-mono outline-none focus:border-brand-500', errors.desc ? 'border-red-500' : 'border-ink-300')} value={desc} maxLength={1000} onChange={(e) => { setDesc(e.target.value); fix('desc'); }} placeholder="e.g. Adding new car" />
            {err('desc')}
          </div>
        </section>
      </div>
      <div className="flex flex-wrap justify-end gap-3 mt-6">
        <Button onClick={() => navigate(policyPath(p))} disabled={!!busy}>Cancel</Button>
        <Button onClick={() => void save('summary')} loading={busy === 'save'} disabled={!!busy}>Change Policy</Button>
        <Button variant="primary" onClick={() => void save('edit')} loading={busy === 'edit'} disabled={!!busy}>Change &amp; Edit Policy</Button>
      </div>
    </div>
  );
}

// ── Policy editor (Insured Information / Coverages / Vehicles / Drivers / Underwriting / Additional Interests) ──

const EDIT_TABS = [
  { key: 'insured', label: 'Insured Information' }, { key: 'coverages', label: 'Coverages' }, { key: 'vehicles', label: 'Vehicles' },
  { key: 'drivers', label: 'Drivers' }, { key: 'underwriting', label: 'Underwriting' }, { key: 'interests', label: 'Additional Interests' },
] as const;
type EditTab = (typeof EDIT_TABS)[number]['key'];
type VehicleDraft = Omit<Vehicle, 'created_at' | 'account_id'> & { body: string; driver: string; isNew?: boolean };
type DriverDraft = Omit<Driver, 'created_at' | 'account_id'> & { isNew?: boolean };
const UNDERWRITING_Q = [
  'Any vehicle used for ride-sharing or delivery?', 'Any driver license suspended or revoked in the last 5 years?', 'Any vehicle with existing damage?',
  'Any business use other than commuting?', 'Prior insurance cancelled or non-renewed in the last 3 years?',
];
const HOME_UNDERWRITING_Q = ['Any business conducted on the premises?', 'Trampoline or swimming pool on premises?', 'Any dogs with a bite history?', 'Property vacant or unoccupied more than 30 days?', 'Any open claims or pending litigation?'];

function PolicyEditor({ account, policy: p }: { account: Account; policy: Policy }) {
  const { params } = useRoute();
  const { carriers } = useAppData();
  const { toast, confirm } = useFeedback();
  const { extras, loading: exLoading } = usePolicyExtras(p, account, carriers);
  const auto = isAutoLine(p);
  const tabs = EDIT_TABS.filter((t) => auto || (t.key !== 'vehicles' && t.key !== 'drivers'));
  const raw = params.get('tab') as EditTab | null;
  const tab: EditTab = tabs.some((t) => t.key === raw) ? raw! : tabs[0].key;
  const vehiclesQ = useTable('vehicles', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const driversQ = useTable('drivers', { eq: { account_id: account.id }, order: { column: 'created_at' } });

  const [insured, setInsured] = useState({ first_name: account.first_name, last_name: account.last_name, business_name: account.business_name ?? '', address: account.address ?? '', city: account.city ?? '', state: account.state ?? '', zip: account.zip ?? '', email: account.email ?? '', mobile_phone: account.mobile_phone ?? '', dob: account.dob ?? '' });
  const [coverages, setCoverages] = useState<CoverageDraft[]>(() => toDrafts(p.coverages));
  const [vehicles, setVehicles] = useState<VehicleDraft[] | null>(null);
  const [drivers, setDrivers] = useState<DriverDraft[] | null>(null);
  const [removedV, setRemovedV] = useState<string[]>([]);
  const [removedD, setRemovedD] = useState<string[]>([]);
  const [underwriting, setUnderwriting] = useState<Record<string, string> | null>(null);
  const [interests, setInterests] = useState<AdditionalInterest[] | null>(null);
  const [payor, setPayor] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<{ kind: 'vehicle'; v?: VehicleDraft } | { kind: 'driver'; d?: DriverDraft } | { kind: 'interest'; i?: AdditionalInterest } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed drafts from the database once loaded.
  useEffect(() => {
    if (vehicles === null && !vehiclesQ.loading && !exLoading) setVehicles(vehiclesQ.data.map((v) => ({ ...v, body: extras.body_styles?.[v.id] ?? '', driver: extras.vehicle_drivers?.[v.id] ?? '' })));
  }, [vehicles, vehiclesQ.loading, vehiclesQ.data, exLoading, extras.body_styles, extras.vehicle_drivers]);
  useEffect(() => { if (drivers === null && !driversQ.loading) setDrivers(driversQ.data.map((d) => ({ ...d }))); }, [drivers, driversQ.loading, driversQ.data]);
  const uw = underwriting ?? extras.underwriting ?? {};
  const ints = interests ?? extras.interests ?? [];
  const mark = () => setDirty(true);

  const idx = tabs.findIndex((t) => t.key === tab);
  const go = (k: EditTab) => setParam('tab', k);
  const close = () => navigate(policyPath(p, 'summary', params.get('from') === 'change' ? 'changed=1' : ''));
  const cancel = async () => { if (dirty && !(await confirm({ title: 'Discard changes?', message: 'Your edits to this policy will be lost.', confirmLabel: 'Discard', danger: true }))) return; close(); };

  const saveAll = async () => {
    const e: string[] = [];
    if (!insured.last_name.trim() && !insured.business_name.trim()) e.push('Insured Information: a last name (or business name) is required.');
    if (insured.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(insured.email)) e.push('Insured Information: enter a valid email.');
    const cov = fromDrafts(coverages);
    if (cov.error) e.push(`Coverages: ${cov.error}`);
    if (e.length) { setError(e.join('\n')); return; }
    setBusy(true); setError(null);
    try {
      await db.update('accounts', account.id, { ...insured, business_name: insured.business_name || null, dob: insured.dob || null, mobile_phone: insured.mobile_phone || null });
      await db.update('policies', p.id, { coverages: cov.coverages });
      const bodies: Record<string, string> = { ...(extras.body_styles ?? {}) };
      const vDrivers: Record<string, string> = { ...(extras.vehicle_drivers ?? {}) };
      for (const id of removedV) { await db.remove('vehicles', id); delete bodies[id]; delete vDrivers[id]; }
      for (const v of vehicles ?? []) {
        const row = { year: v.year, make: v.make, model: v.model, vin: v.vin || null, usage: v.usage, annual_miles: v.annual_miles, ownership: v.ownership, garaging_zip: v.garaging_zip };
        const saved = v.isNew ? await db.insert('vehicles', { ...row, account_id: account.id }) : await db.update('vehicles', v.id, row);
        if (v.body) bodies[saved.id] = v.body; else delete bodies[saved.id];
        if (v.driver) vDrivers[saved.id] = v.driver; else delete vDrivers[saved.id];
      }
      for (const id of removedD) await db.remove('drivers', id);
      for (const d of drivers ?? []) {
        const row = { first_name: d.first_name, last_name: d.last_name, dob: d.dob, gender: d.gender, marital_status: d.marital_status, relationship: d.relationship, license_number: d.license_number, license_state: d.license_state, violations: d.violations, accidents: d.accidents };
        if (d.isNew) await db.insert('drivers', { ...row, account_id: account.id }); else await db.update('drivers', d.id, row);
      }
      await savePolicyExtras(p.id, (x) => ({ ...x, body_styles: bodies, vehicle_drivers: vDrivers, underwriting: uw, interests: ints, policy_payor: payor ?? x.policy_payor }));
      toast('Policy saved');
      setDirty(false);
      close();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  const bar = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" onClick={() => void saveAll()} loading={busy}>Save &amp; Close</Button>
      <Button onClick={() => void cancel()} disabled={busy}>Cancel</Button>
      <div className="flex-1" />
      <Button icon={<ChevronLeft size={14} />} disabled={idx <= 0} onClick={() => go(tabs[idx - 1].key)}>Previous</Button>
      <Button disabled={idx >= tabs.length - 1} onClick={() => go(tabs[idx + 1].key)}>Next <ChevronRight size={14} /></Button>
      <div className="hidden xl:block flex-1" />
    </div>
  );
  const th = 'px-3 py-2 text-left text-[13px] font-semibold text-ink-900 border-b-2 border-[#2e9d4f]';
  const td = 'px-3 py-2.5 text-[13px] text-ink-800 border-b border-ink-200';
  const rowMenu = (items: { label: string; onClick: () => void; danger?: boolean }[]) => <Menu trigger={<button type="button" className="inline-flex items-center gap-1 text-brand-700 hover:underline">Actions <ChevronDown size={13} /></button>} items={items} />;

  return (
    <div className="px-5 py-4">
      <PolicyBanner policy={p} extras={extras} full />
      <div className="my-5">{bar}</div>
      {error && <div className="mb-3 whitespace-pre-line"><ErrorBanner message={error} /></div>}
      <div className="flex flex-wrap gap-1 border-b border-ink-200 px-8" role="tablist" aria-label="Policy sections">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} onClick={() => go(t.key)}
            className={cx('px-3.5 py-2 text-[13px] font-semibold -mb-px border', t.key === tab ? 'border-ink-200 border-b-white bg-white text-ink-900 rounded-t' : 'border-transparent text-brand-700 hover:underline')}>{t.label}</button>
        ))}
      </div>

      <div className="py-3 min-h-[160px]">
        {tab === 'insured' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[980px]">
            {account.account_type === 'Commercial' && <Field label="Business name" className="md:col-span-3"><Input value={insured.business_name} onChange={(e) => { setInsured({ ...insured, business_name: e.target.value }); mark(); }} /></Field>}
            <Field label="First name"><Input value={insured.first_name} onChange={(e) => { setInsured({ ...insured, first_name: e.target.value }); mark(); }} /></Field>
            <Field label="Last name" required><Input value={insured.last_name} onChange={(e) => { setInsured({ ...insured, last_name: e.target.value }); mark(); }} /></Field>
            <Field label="Date of birth"><Input type="date" value={insured.dob} onChange={(e) => { setInsured({ ...insured, dob: e.target.value }); mark(); }} /></Field>
            <Field label="Address" className="md:col-span-3"><Input value={insured.address} onChange={(e) => { setInsured({ ...insured, address: e.target.value }); mark(); }} /></Field>
            <Field label="City"><Input value={insured.city} onChange={(e) => { setInsured({ ...insured, city: e.target.value }); mark(); }} /></Field>
            <Field label="State"><Select value={insured.state} onChange={(e) => { setInsured({ ...insured, state: e.target.value }); mark(); }} options={US_STATES} /></Field>
            <Field label="ZIP"><Input value={insured.zip} inputMode="numeric" maxLength={10} onChange={(e) => { setInsured({ ...insured, zip: e.target.value }); mark(); }} /></Field>
            <Field label="Email"><Input value={insured.email} onChange={(e) => { setInsured({ ...insured, email: e.target.value }); mark(); }} /></Field>
            <Field label="Mobile phone"><Input value={insured.mobile_phone} onChange={(e) => { setInsured({ ...insured, mobile_phone: e.target.value }); mark(); }} /></Field>
            <Field label="Policy payor"><Input value={payor ?? extras.policy_payor ?? ''} placeholder={accountName(account)} onChange={(e) => { setPayor(e.target.value); mark(); }} /></Field>
          </div>
        )}
        {tab === 'coverages' && <CoverageEditor rows={coverages} onChange={(r) => { setCoverages(r); mark(); }} />}
        {tab === 'vehicles' && (
          vehicles === null ? <div className="py-6 text-[13px] text-ink-500"><Loader2 size={15} className="inline animate-spin mr-1" /> Loading vehicles…</div> : (
            <table className="w-full border-collapse" aria-label="Vehicles">
              <thead><tr><th className={th}>Vehicle #</th><th className={th}>Year</th><th className={th}>Make</th><th className={th}>Model</th><th className={th}>Body Style</th><th className={th}>VIN</th><th className={cx(th, 'text-right')}><Button variant="primary" size="sm" onClick={() => setModal({ kind: 'vehicle' })}>Add Vehicle</Button></th></tr></thead>
              <tbody>
                {vehicles.map((v, i) => (
                  <tr key={v.id} data-testid="vehicle-row"><td className={td}>{i + 1}</td><td className={td}>{v.year}</td><td className={td}>{v.make.toUpperCase()}</td><td className={td}>{v.model.toUpperCase()}</td><td className={td}>{v.body}</td><td className={td}>{v.vin}</td>
                    <td className={cx(td, 'text-right')}>{rowMenu([{ label: 'Edit', onClick: () => setModal({ kind: 'vehicle', v }) }, { label: 'Remove', danger: true, onClick: () => { setVehicles(vehicles.filter((x) => x.id !== v.id)); if (!v.isNew) setRemovedV([...removedV, v.id]); mark(); } }])}</td></tr>
                ))}
                {!vehicles.length && <tr><td colSpan={7} className={cx(td, 'text-center text-ink-500 py-6')}>No vehicles on this policy. Use Add Vehicle.</td></tr>}
              </tbody>
            </table>
          )
        )}
        {tab === 'drivers' && (
          drivers === null ? <div className="py-6 text-[13px] text-ink-500">Loading drivers…</div> : (
            <table className="w-full border-collapse" aria-label="Drivers">
              <thead><tr><th className={th}>Driver #</th><th className={th}>Name</th><th className={th}>Date of Birth</th><th className={th}>Relationship</th><th className={th}>License</th><th className={th}>Incidents</th><th className={cx(th, 'text-right')}><Button variant="primary" size="sm" onClick={() => setModal({ kind: 'driver' })}>Add Driver</Button></th></tr></thead>
              <tbody>
                {drivers.map((d, i) => (
                  <tr key={d.id} data-testid="driver-row"><td className={td}>{i + 1}</td><td className={td}>{d.first_name} {d.last_name}</td><td className={td}>{mdy(d.dob)}</td><td className={td}>{d.relationship}</td><td className={td}>{[d.license_state, d.license_number].filter(Boolean).join(' ')}</td><td className={td}>{d.violations} violation{d.violations === 1 ? '' : 's'}, {d.accidents} accident{d.accidents === 1 ? '' : 's'}</td>
                    <td className={cx(td, 'text-right')}>{rowMenu([{ label: 'Edit', onClick: () => setModal({ kind: 'driver', d }) }, { label: 'Remove', danger: true, onClick: () => { setDrivers(drivers.filter((x) => x.id !== d.id)); if (!d.isNew) setRemovedD([...removedD, d.id]); mark(); } }])}</td></tr>
                ))}
                {!drivers.length && <tr><td colSpan={7} className={cx(td, 'text-center text-ink-500 py-6')}>No drivers. Use Add Driver.</td></tr>}
              </tbody>
            </table>
          )
        )}
        {tab === 'underwriting' && (
          <div className="max-w-[760px] divide-y divide-ink-100">
            {(auto ? UNDERWRITING_Q : HOME_UNDERWRITING_Q).map((q) => (
              <div key={q} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                <span>{q}</span>
                <select aria-label={q} className={cx(box, 'w-28')} value={uw[q] ?? ''} onChange={(e) => { setUnderwriting({ ...uw, [q]: e.target.value }); mark(); }}><option value="" /><option>No</option><option>Yes</option></select>
              </div>
            ))}
            <div className="pt-3"><Field label="Underwriting notes"><Textarea rows={3} value={uw.notes ?? ''} onChange={(e) => { setUnderwriting({ ...uw, notes: e.target.value }); mark(); }} /></Field></div>
          </div>
        )}
        {tab === 'interests' && (
          <table className="w-full border-collapse" aria-label="Additional interests">
            <thead><tr><th className={th}>Type</th><th className={th}>Name</th><th className={th}>Address</th><th className={th}>Loan #</th><th className={cx(th, 'text-right')}><Button variant="primary" size="sm" onClick={() => setModal({ kind: 'interest' })}>Add Interest</Button></th></tr></thead>
            <tbody>
              {ints.map((it) => (
                <tr key={it.id}><td className={td}>{it.type}</td><td className={td}>{it.name}</td><td className={td}>{it.address}</td><td className={td}>{it.loan_number}</td>
                  <td className={cx(td, 'text-right')}>{rowMenu([{ label: 'Edit', onClick: () => setModal({ kind: 'interest', i: it }) }, { label: 'Remove', danger: true, onClick: () => { setInterests(ints.filter((x) => x.id !== it.id)); mark(); } }])}</td></tr>
              ))}
              {!ints.length && <tr><td colSpan={5} className={cx(td, 'text-center text-ink-500 py-6')}>No lienholders, loss payees or additional insureds.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-ink-200 pt-5">{bar}</div>

      {modal?.kind === 'vehicle' && <VehicleModal v={modal.v} drivers={drivers ?? []} zip={account.zip ?? ''} onClose={() => setModal(null)} onSave={(v) => { setVehicles((list) => (modal.v ? (list ?? []).map((x) => (x.id === v.id ? v : x)) : [...(list ?? []), v])); mark(); setModal(null); }} />}
      {modal?.kind === 'driver' && <DriverModal d={modal.d} state={account.state ?? ''} onClose={() => setModal(null)} onSave={(d) => { setDrivers((list) => (modal.d ? (list ?? []).map((x) => (x.id === d.id ? d : x)) : [...(list ?? []), d])); mark(); setModal(null); }} />}
      {modal?.kind === 'interest' && <InterestModal i={modal.i} onClose={() => setModal(null)} onSave={(it) => { setInterests(modal.i ? ints.map((x) => (x.id === it.id ? it : x)) : [...ints, it]); mark(); setModal(null); }} />}
    </div>
  );
}

function VehicleModal({ v, drivers, zip, onClose, onSave }: { v?: VehicleDraft; drivers: DriverDraft[]; zip: string; onClose: () => void; onSave: (v: VehicleDraft) => void }) {
  const [f, setF] = useState({ year: v ? String(v.year) : '', make: v?.make ?? '', model: v?.model ?? '', body: v?.body ?? '', vin: v?.vin ?? '', usage: v?.usage ?? 'Commute', annual_miles: v?.annual_miles ? String(v.annual_miles) : '12000', ownership: v?.ownership ?? 'Owned', garaging_zip: v?.garaging_zip ?? zip, driver: v?.driver ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [decoding, setDecoding] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const decode = async () => {
    const vin = f.vin.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { setErr({ vin: 'A VIN is 17 letters and numbers (no I, O or Q)' }); return; }
    setDecoding(true);
    try {
      const info = await decodeVin(vin);
      setF((x) => ({ ...x, vin, year: info.year || x.year, make: info.make || x.make, model: info.model || x.model, body: x.body || bodyFrom(info.body) }));
      setErr({});
    } finally { setDecoding(false); }
  };
  const submit = () => {
    const e: Record<string, string> = {};
    const y = Number(f.year);
    if (!y || y < 1950 || y > new Date().getFullYear() + 1) e.year = 'Enter a valid model year';
    if (!f.make.trim()) e.make = 'Make is required';
    if (!f.model.trim()) e.model = 'Model is required';
    if (f.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(f.vin.trim())) e.vin = 'A VIN is 17 letters and numbers (no I, O or Q)';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ id: v?.id ?? uuid(), isNew: v ? v.isNew : true, year: y, make: f.make.trim(), model: f.model.trim(), body: f.body, vin: f.vin.trim().toUpperCase() || null, usage: f.usage, annual_miles: Number(f.annual_miles) || null, ownership: f.ownership, garaging_zip: f.garaging_zip || null, driver: f.driver });
  };
  return (
    <Modal title={v ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{v ? 'Save' : 'Add Vehicle'}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="VIN" error={err.vin} className="sm:col-span-2">
          <div className="flex gap-2"><Input value={f.vin} maxLength={17} onChange={set('vin')} placeholder="17-character VIN" /><Button onClick={() => void decode()} loading={decoding}>Decode VIN</Button></div>
        </Field>
        <Field label="Year" required error={err.year}><Input value={f.year} inputMode="numeric" maxLength={4} onChange={set('year')} /></Field>
        <Field label="Make" required error={err.make}><Input value={f.make} onChange={set('make')} /></Field>
        <Field label="Model" required error={err.model}><Input value={f.model} onChange={set('model')} /></Field>
        <Field label="Body Style"><Select value={f.body} onChange={set('body')} placeholder="Select" options={BODY_STYLES} /></Field>
        <Field label="Usage"><Select value={f.usage ?? ''} onChange={set('usage')} options={['Commute', 'Pleasure', 'Business', 'Farm']} /></Field>
        <Field label="Annual miles"><Input value={f.annual_miles} inputMode="numeric" onChange={set('annual_miles')} /></Field>
        <Field label="Ownership"><Select value={f.ownership ?? ''} onChange={set('ownership')} options={['Owned', 'Financed', 'Leased']} /></Field>
        <Field label="Garaging ZIP"><Input value={f.garaging_zip ?? ''} maxLength={10} onChange={set('garaging_zip')} /></Field>
        <Field label="Principal driver"><Select value={f.driver} onChange={set('driver')} placeholder="—" options={drivers.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} /></Field>
      </div>
    </Modal>
  );
}
function bodyFrom(body: string) {
  const b = body.toLowerCase();
  if (/pickup/.test(b)) return 'PICKUP 4';
  if (/sport utility|suv/.test(b)) return 'SUV 4';
  if (/sedan/.test(b)) return 'SEDAN 4';
  if (/coupe/.test(b)) return 'COUPE 2';
  if (/hatch/.test(b)) return 'HATCHBACK';
  if (/van/.test(b)) return 'VAN';
  if (/wagon/.test(b)) return 'WAGON';
  if (/convertible/.test(b)) return 'CONVERTIBLE';
  if (/motorcycle/.test(b)) return 'MOTORCYCLE';
  return '';
}

function DriverModal({ d, state, onClose, onSave }: { d?: DriverDraft; state: string; onClose: () => void; onSave: (d: DriverDraft) => void }) {
  const [f, setF] = useState({ first_name: d?.first_name ?? '', last_name: d?.last_name ?? '', dob: d?.dob ?? '', gender: d?.gender ?? '', marital_status: d?.marital_status ?? '', relationship: d?.relationship ?? 'Child', license_number: d?.license_number ?? '', license_state: d?.license_state ?? state, violations: String(d?.violations ?? 0), accidents: String(d?.accidents ?? 0) });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.first_name.trim()) e.first = 'First name is required';
    if (!f.last_name.trim()) e.last = 'Last name is required';
    if (f.dob && f.dob > today()) e.dob = 'Date of birth cannot be in the future';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ id: d?.id ?? uuid(), isNew: d ? d.isNew : true, first_name: f.first_name.trim(), last_name: f.last_name.trim(), dob: f.dob || null, gender: f.gender || null, marital_status: f.marital_status || null, relationship: f.relationship || null, license_number: f.license_number || null, license_state: f.license_state || null, violations: Math.max(0, Number(f.violations) || 0), accidents: Math.max(0, Number(f.accidents) || 0) });
  };
  return (
    <Modal title={d ? 'Edit driver' : 'Add driver'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{d ? 'Save' : 'Add Driver'}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First name" required error={err.first}><Input value={f.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name" required error={err.last}><Input value={f.last_name} onChange={set('last_name')} /></Field>
        <Field label="Date of birth" error={err.dob}><Input type="date" value={f.dob} onChange={set('dob')} /></Field>
        <Field label="Relationship"><Select value={f.relationship} onChange={set('relationship')} options={['Insured', 'Spouse', 'Child', 'Parent', 'Other']} /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={set('gender')} placeholder="—" options={['Male', 'Female', 'Non-binary']} /></Field>
        <Field label="Marital status"><Select value={f.marital_status} onChange={set('marital_status')} placeholder="—" options={['Single', 'Married', 'Divorced', 'Widowed']} /></Field>
        <Field label="License #"><Input value={f.license_number} onChange={set('license_number')} /></Field>
        <Field label="License state"><Select value={f.license_state} onChange={set('license_state')} options={US_STATES} /></Field>
        <Field label="Violations (5 yrs)"><Input value={f.violations} inputMode="numeric" onChange={set('violations')} /></Field>
        <Field label="At-fault accidents (5 yrs)"><Input value={f.accidents} inputMode="numeric" onChange={set('accidents')} /></Field>
      </div>
    </Modal>
  );
}

function InterestModal({ i, onClose, onSave }: { i?: AdditionalInterest; onClose: () => void; onSave: (i: AdditionalInterest) => void }) {
  const [f, setF] = useState<AdditionalInterest>(i ?? { id: uuid(), type: 'Lienholder', name: '', address: '', loan_number: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={i ? 'Edit additional interest' : 'Add additional interest'} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!f.name.trim()) { setErr('Name is required'); return; } onSave({ ...f, name: f.name.trim() }); }}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={INTEREST_TYPES} /></Field>
        <Field label="Name" required error={err}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Loan #"><Input value={f.loan_number} onChange={(e) => setF({ ...f, loan_number: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ── Policy summary ──

const SUMMARY_TABS = [{ key: 'summary', label: 'Summary' }, { key: 'history', label: 'History' }, { key: 'claims', label: 'Claims' }, { key: 'documents', label: 'Documents' }, { key: 'notes', label: 'Notes' }] as const;
type SummaryTab = (typeof SUMMARY_TABS)[number]['key'];

/** Premium in force on `asOf`: the term's starting premium plus changes effective by then. */
function premiumAsOf(p: Policy, txns: PolicyTransaction[], asOf: string) {
  const later = txns.filter((t) => t.type === 'Endorsement' && t.effective_date > asOf && t.effective_date >= p.effective_date);
  return cents(Number(p.premium) - later.reduce((s, t) => s + Number(t.premium_change || 0), 0));
}

function PolicySummary({ account: a, policy: p }: { account: Account; policy: Policy }) {
  const { params } = useRoute();
  const { carriers, me } = useAppData();
  const { toast, confirm } = useFeedback();
  const { extras } = usePolicyExtras(p, a, carriers);
  const txns = useTable('policy_transactions', { eq: { policy_id: p.id }, order: { column: 'created_at', ascending: false } });
  const claims = useTable('claims', { eq: { policy_id: p.id }, order: { column: 'date_of_loss', ascending: false } });
  const vehicles = useTable('vehicles', isAutoLine(p) ? { eq: { account_id: a.id }, order: { column: 'created_at' } } : null);
  const drivers = useTable('drivers', isAutoLine(p) ? { eq: { account_id: a.id }, order: { column: 'created_at' } } : null);
  const property = useTable('properties', isAutoLine(p) ? null : { eq: { account_id: a.id } });
  const notes = useTable('activities', { eq: { policy_id: p.id }, order: { column: 'created_at', ascending: false } });
  const raw = params.get('ptab') as SummaryTab | null;
  const tab: SummaryTab = SUMMARY_TABS.some((t) => t.key === raw) ? raw! : 'summary';
  const [asOfMode, setAsOfMode] = useState<'today' | 'effective' | 'custom'>('today');
  const [asOf, setAsOf] = useState(today());
  const [more, setMore] = useState(false);
  const [tx, setTx] = useState<PolicyAction | null>(null);
  const [form, setForm] = useState(false);
  const [note, setNote] = useState('');
  const changed = params.get('changed') === '1';
  const lastCancel = txns.data.find((t) => t.type === 'Cancellation' && !t.description?.startsWith('Non-renewal'));
  const premium = useMemo(() => premiumAsOf(p, txns.data, asOf), [p, txns.data, asOf]);
  const addr1 = [a.address].filter(Boolean).join('');
  const addr2 = [a.city, a.state, a.zip].filter(Boolean).join(',');

  const action = (kind: PolicyAction, label: string) => ({ label, disabled: !canDo(kind, p.status), onClick: () => setTx(kind) });
  const remove = async () => {
    if (!(await confirm({ title: 'Delete policy?', message: `This permanently deletes ${p.policy_number} and its transaction history.`, confirmLabel: 'Delete policy', danger: true }))) return;
    try { await db.remove('policies', p.id); toast(`Policy ${p.policy_number} deleted`); navigate(`/accounts/${a.id}?tab=policies`); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try { await logActivity({ account_id: a.id, policy_id: p.id, subject: note.trim().slice(0, 80), description: note.trim(), assigned_to: me?.name ?? null }); setNote(''); toast('Note added'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const h = 'text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1';
  const cellH = 'px-2 py-1 text-left text-[11.5px] font-semibold text-ink-700 border-b-2 border-ink-700';
  const cell = 'px-2 py-1 text-[12px] text-ink-800 border-b border-ink-200';

  return (
    <div className="px-5 py-3">
      <PolicyBanner policy={p} extras={extras} />
      <div className="flex gap-2 mt-2">
        <Menu align="left" trigger={<Button variant="primary" size="sm">Actions <ChevronDown size={13} /></Button>} items={[
          { label: 'Change', disabled: !canDo('endorse', p.status), onClick: () => navigate(policyPath(p, 'change')) },
          { label: 'Edit', onClick: () => navigate(policyPath(p, 'edit')) },
          action('renew', 'Renew'), action('audit', 'Audit'), 'divider',
          action('cancel', 'Cancel'), action('reinstate', 'Reinstate'), action('nonrenew', 'Non-renew'), 'divider',
          { label: 'Remarket / requote', onClick: () => navigate(`/quotes/new?account=${a.id}&line=${encodeURIComponent(p.line_of_business)}`) },
          { label: 'Delete policy', danger: true, onClick: () => void remove() },
        ]} />
        <Menu align="left" trigger={<Button variant="primary" size="sm">Forms <ChevronDown size={13} /></Button>} items={[
          { label: isAutoLine(p) ? 'Auto ID Card / Proof of Insurance' : 'Proof of Insurance', onClick: () => setForm(true) },
          { label: 'Policy Summary', onClick: () => setForm(true) },
          { label: 'Certificate', onClick: () => navigate(`/accounts/${a.id}?tab=certificates`) },
        ]} />
      </div>
      {changed && extras.last_change && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-[13px]" data-testid="change-saved">
          <span><b>Policy change saved:</b> {extras.last_change.description} ({signedMoney(extras.last_change.premium_change, fmtMoney)}, effective {mdy(extras.last_change.date)}). Let the insured know with the email or text icons on the left.</span>
          <button type="button" className="ml-auto text-ink-500 hover:text-ink-800" aria-label="Dismiss" onClick={() => setParam('changed', null)}>×</button>
        </div>
      )}
      <div className="flex gap-1 border-b border-ink-200 mt-4 px-3" role="tablist" aria-label="Policy record">
        {SUMMARY_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} onClick={() => setParam('ptab', t.key === 'summary' ? null : t.key)}
            className={cx('px-3.5 py-2 text-[12.5px] font-semibold -mb-px border', t.key === tab ? 'border-ink-200 border-b-white bg-white text-ink-900 rounded-t' : 'border-transparent text-brand-700 hover:underline')}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="py-3 space-y-5" data-testid="policy-summary">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
            Viewing Summary As Of
            <select aria-label="Viewing summary as of" className={cx(box, 'w-48 h-8')} value={asOfMode} onChange={(e) => { const m = e.target.value as typeof asOfMode; setAsOfMode(m); if (m === 'today') setAsOf(today()); if (m === 'effective') setAsOf(p.effective_date); }}>
              <option value="today">Today</option><option value="effective">Effective Date</option><option value="custom">Custom date</option>
            </select>
            <input aria-label="Summary date" type="date" className={cx(box, 'w-44 h-8')} value={asOf} min={p.effective_date} max={p.expiration_date} onChange={(e) => { setAsOf(e.target.value || today()); setAsOfMode('custom'); }} />
          </div>
          <button type="button" onClick={() => setMore(!more)} className="w-full text-left rounded bg-[#fdf6dd] border border-[#f4e6b0] px-3 py-2.5 text-[12px] text-brand-700 hover:underline">Click here for {more ? 'less' : 'additional'} policy information</button>
          {more && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]" data-testid="more-info">
              {([['Billing Type', p.billing_type], ['Payment Plan', p.payment_plan ?? '—'], ['Commission', `${p.commission_rate}%`], ['Producer', p.producer ?? '—'], ['Department', extras.department ?? '—'], ['Rating State', extras.rating_state ?? '—'], ['Agency Code', extras.agency_code || '—'], ['Service Team', (extras.service_team ?? []).map((m) => `${m.staff} ${m.percent}%`).join(', ') || '—']] as [string, string][]).map(([k, v]) => <div key={k}><div className="text-ink-500">{k}</div><div className="text-ink-900">{v}</div></div>)}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[13px] leading-snug">
            <div><div className={h}>Customer Information</div><div>{accountName(a)}</div><div className="uppercase">{addr1}</div><div className="uppercase">{addr2}</div></div>
            <div><div className={h}>Policy Information</div><div>Policy Number: {p.policy_number}</div><div>Effective Date: {mmddyyyy(p.effective_date)}</div><div>Expiration Date: {mmddyyyy(p.expiration_date)}</div><div data-testid="summary-premium">Total Premium: {moneyIn(premium)}</div><div>Policy Payor: {extras.policy_payor ?? ''}</div></div>
            <div><div className={h}>Carrier Information</div><div>Carrier: {p.carrier}</div><div>Writing Company: {extras.writing_company}</div><div>NAIC: {carriers.find((c) => c.name === p.carrier)?.naic ?? '—'}</div></div>
          </div>
          <div className="text-[13px]"><div className={h}>Named Insured as Listed on the Policy</div><div>{accountName(a)}</div><div className="text-brand-700 uppercase">{addr1}</div><div>{[a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}, United States</div></div>
          <div>
            <div className={h}>Coverage Limits</div>
            <table className="w-full max-w-[720px] border-collapse" aria-label="Coverage limits">
              <thead><tr><th className={cellH}>Coverage Type</th><th className={cellH}>Limit</th><th className={cellH}>Deductible</th></tr></thead>
              <tbody>{(p.coverages ?? []).map((c) => <tr key={c.name}><td className={cx(cell, 'font-semibold')}>{c.name}</td><td className={cell}>{/^[\d,]+$/.test(c.limit) ? `$${c.limit}` : c.limit}</td><td className={cell}>{c.deductible ? `$${c.deductible}` : '---'}</td></tr>)}
                {!(p.coverages ?? []).length && <tr><td colSpan={3} className={cell}>No coverages recorded. Use Actions → Edit → Coverages.</td></tr>}</tbody>
            </table>
          </div>
          {isAutoLine(p) && (
            <div>
              <div className={h}>Vehicles</div>
              <table className="w-full border-collapse" aria-label="Policy vehicles">
                <thead><tr>{['Veh #', 'Year', 'Make', 'Model', 'Type', 'VIN', 'Driver #', 'Garage Loc'].map((x) => <th key={x} className={cellH}>{x}</th>)}</tr></thead>
                <tbody>
                  {vehicles.data.map((v, i) => {
                    const di = drivers.data.findIndex((d) => d.id === extras.vehicle_drivers?.[v.id]);
                    return <tr key={v.id} data-testid="summary-vehicle"><td className={cell}>{i + 1}</td><td className={cell}>{v.year}</td><td className={cell}>{v.make.toUpperCase()}</td><td className={cell}>{v.model.toUpperCase()}</td><td className={cell}>{extras.body_styles?.[v.id] || '---'}</td><td className={cell}>{v.vin ?? '---'}</td><td className={cell}>{di >= 0 ? di + 1 : i === 0 && drivers.data.length ? 1 : '---'}</td><td className={cell}>1</td></tr>;
                  })}
                  {!vehicles.data.length && <tr><td colSpan={8} className={cell}>No vehicles. Use Actions → Edit → Vehicles.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!isAutoLine(p) && property.data[0] && (
            <div className="text-[13px]"><div className={h}>Dwelling</div>
              <div>{property.data[0].address}, {property.data[0].city} {property.data[0].state} {property.data[0].zip}</div>
              <div className="text-ink-600">Built {property.data[0].year_built ?? '—'} · {property.data[0].square_feet?.toLocaleString('en-US') ?? '—'} sq ft · {property.data[0].construction ?? '—'} · Roof {property.data[0].roof_type ?? '—'} {property.data[0].roof_year ?? ''}</div>
            </div>
          )}
          {(extras.interests ?? []).length > 0 && (
            <div><div className={h}>Additional Interests</div>
              <ul className="text-[13px]">{extras.interests!.map((it) => <li key={it.id}>{it.type}: {it.name}{it.loan_number ? ` · Loan ${it.loan_number}` : ''}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {tab === 'history' && <div className="py-3"><HistoryTab txns={txns.data} loading={txns.loading} error={txns.error} /></div>}
      {tab === 'claims' && <div className="py-3"><ClaimsTab claims={claims.data} loading={claims.loading} error={claims.error} /></div>}
      {tab === 'documents' && <div className="py-3"><DocumentList accountId={a.id} policyId={p.id} /></div>}
      {tab === 'notes' && (
        <div className="py-3 max-w-[820px] space-y-3">
          <div className="flex gap-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this policy" /><Button variant="primary" onClick={() => void addNote()} disabled={!note.trim()}>Add note</Button></div>
          <ul className="divide-y divide-ink-100 border border-ink-100 rounded">
            {notes.data.map((n) => <li key={n.id} className="px-3 py-2 text-[13px]"><div className="text-ink-900">{n.subject}</div>{n.description && n.description !== n.subject && <div className="text-ink-600 whitespace-pre-wrap">{n.description}</div>}<div className="text-[11px] text-ink-400 mt-0.5">{mdy(n.created_at)} · {n.assigned_to ?? '—'} · {n.type}</div></li>)}
            {!notes.data.length && <li className="px-3 py-4 text-[13px] text-ink-500">No notes yet.</li>}
          </ul>
        </div>
      )}
      {tx && <TransactionModal kind={tx} policy={p} lastCancel={lastCancel} txns={txns.data} onClose={() => setTx(null)} />}
      {form && <GenerateModal accountId={a.id} policyId={p.id} onClose={() => setForm(false)} />}
    </div>
  );
}
