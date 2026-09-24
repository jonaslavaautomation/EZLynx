import { useMemo, useState } from 'react';
import { Field, SearchInput, StatusBadge, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { commissionOf } from '@/lib/domain';
import { accountName, fmtDate, fmtMoney, fmtNumber, fmtPhone, today } from '@/lib/format';
import { href } from '@/lib/router';
import { LINES_OF_BUSINESS, type Account, type Coverage, type Policy, type PolicyTransaction, type TransactionType } from '@/lib/types';
import { BarChart, HBarChart } from './charts';
import { fmtCompactMoney } from './chart-utils';
import { fmtPct, groupBy, lastMonths, monthKey, producerOf, sum, type ReportData } from './data';
import { FilterPills, FilterSelect, ReportFrame } from './frame';

const money = (n: number) => fmtMoney(n);
const moneyCol = (v: number, strong = false) => <span className={'tabular-nums' + (strong ? ' font-semibold' : '')}>{fmtMoney(v)}</span>;
const numCol = (v: number) => <span className="tabular-nums">{fmtNumber(v)}</span>;
const acctLink = (d: ReportData, id: string) => <a href={href(`/accounts/${id}`)} className="hover:underline">{accountName(d.accountsById.get(id))}</a>;
const polLink = (p: Policy) => <a href={href(`/policies/${p.id}`)} className="font-semibold hover:underline">{p.policy_number}</a>;
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

function useProducers(d: ReportData) {
  const { staff } = useAppData();
  return useMemo(() => uniq([...staff.map((s) => s.name), ...d.accounts.map((a) => a.producer), ...d.policies.map((p) => producerOf(p, d.accountsById))]), [staff, d.accounts, d.policies, d.accountsById]);
}

const includesText = (q: string, ...parts: (string | null | undefined)[]) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};

// ── Applicant List ──
export function ApplicantList({ data: d }: { data: ReportData }) {
  const producers = useProducers(d);
  const [type, setType] = useState<'all' | 'Personal' | 'Commercial'>('all');
  const [status, setStatus] = useState('');
  const [producer, setProducer] = useState('');
  const [q, setQ] = useState('');
  const policyCount = useMemo(() => {
    const m = new Map<string, number>();
    d.policies.forEach((p) => { if (p.status === 'Active') m.set(p.account_id, (m.get(p.account_id) ?? 0) + 1); });
    return m;
  }, [d.policies]);
  const rows = d.accounts.filter((a) =>
    (type === 'all' || (a.account_type ?? 'Personal') === type) && (!status || a.status === status) && (!producer || (a.producer || 'Unassigned') === producer)
    && (!q || includesText(q, accountName(a), a.email, a.phone, a.mobile_phone, a.city, a.state, a.zip)));
  const byStatus = [...groupBy(rows, (a) => a.status ?? 'Unknown').entries()].map(([label, list]) => ({ label, value: list.length })).sort((a, b) => b.value - a.value);
  const commercial = rows.filter((a) => a.account_type === 'Commercial').length;
  const columns: Column<Account>[] = [
    { key: 'name', header: 'Applicant', sortValue: (a) => accountName(a), render: (a) => <a href={href(`/accounts/${a.id}`)} className="font-semibold hover:underline">{accountName(a)}</a> },
    { key: 'type', header: 'Type', sortValue: (a) => a.account_type, render: (a) => a.account_type ?? 'Personal' },
    { key: 'status', header: 'Status', sortValue: (a) => a.status, render: (a) => <StatusBadge status={a.status} /> },
    { key: 'producer', header: 'Producer', sortValue: (a) => a.producer, render: (a) => a.producer || <span className="text-ink-300">Unassigned</span> },
    { key: 'csr', header: 'CSR', sortValue: (a) => a.csr, render: (a) => a.csr || '—' },
    { key: 'email', header: 'Email', sortValue: (a) => a.email, render: (a) => (a.email ? <a href={`mailto:${a.email}`} className="hover:underline">{a.email}</a> : '—') },
    { key: 'phone', header: 'Phone', render: (a) => fmtPhone(a.phone || a.mobile_phone) || '—' },
    { key: 'loc', header: 'City / State', sortValue: (a) => `${a.state ?? ''} ${a.city ?? ''}`, render: (a) => [a.city, a.state].filter(Boolean).join(', ') || '—' },
    { key: 'pol', header: 'Active policies', align: 'right', sortValue: (a) => policyCount.get(a.id) ?? 0, render: (a) => numCol(policyCount.get(a.id) ?? 0) },
    { key: 'created', header: 'Added', sortValue: (a) => a.created_at, render: (a) => fmtDate(a.created_at) },
  ];
  return (
    <ReportFrame
      reportKey="applicant-list" title="Applicant List" description="Every account (applicant) with type, status, assigned producer and contact information."
      filters={<>
        <Field label="Search" className="w-full sm:w-56"><SearchInput value={q} onChange={setQ} placeholder="Name, email, phone, city…" /></Field>
        <FilterPills label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'Personal', label: 'Personal' }, { value: 'Commercial', label: 'Commercial' }]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={['Prospect', 'Active', 'Pending', 'Inactive']} />
        <FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={[...producers, 'Unassigned']} />
      </>}
      kpis={[
        { label: 'Applicants', value: fmtNumber(rows.length) },
        { label: 'Active clients', value: fmtNumber(rows.filter((a) => a.status === 'Active').length), tone: 'green' },
        { label: 'Prospects', value: fmtNumber(rows.filter((a) => a.status === 'Prospect').length), tone: 'purple' },
        { label: 'Commercial', value: fmtNumber(commercial), hint: `${fmtPct(commercial, rows.length)} of applicants` },
      ]}
      chartTitle="Applicants by status"
      chart={<HBarChart ariaLabel="Applicants by status" data={byStatus} onRowClick={(r) => setStatus(status === r.label ? '' : r.label)} />}
      columns={columns} rows={rows} initialSort={{ key: 'name', dir: 'asc' }}
      csv={() => rows.map((a) => ({
        name: accountName(a), type: a.account_type ?? 'Personal', status: a.status ?? '', producer: a.producer ?? '', csr: a.csr ?? '', email: a.email ?? '',
        phone: a.phone ?? a.mobile_phone ?? '', address: a.address ?? '', city: a.city ?? '', state: a.state ?? '', zip: a.zip ?? '', lead_source: a.lead_source ?? '',
        active_policies: policyCount.get(a.id) ?? 0, created: (a.created_at ?? '').slice(0, 10),
      }))}
      note="Tip: click a bar to filter by that status."
    />
  );
}

// ── Policy Coverage ──
type CoverageRow = { id: string; policy: Policy; coverage: Coverage };
export function PolicyCoverageReport({ data: d }: { data: ReportData }) {
  const [line, setLine] = useState('');
  const [name, setName] = useState('');
  const [carrier, setCarrier] = useState('');
  const all = useMemo<CoverageRow[]>(() => d.policies.filter((p) => p.status === 'Active').flatMap((p) => (Array.isArray(p.coverages) ? p.coverages : []).map((c, i) => ({ id: `${p.id}-${i}`, policy: p, coverage: c }))), [d.policies]);
  const inLine = all.filter((r) => (!line || r.policy.line_of_business === line) && (!carrier || r.policy.carrier === carrier));
  const rows = inLine.filter((r) => !name || r.coverage.name === name);
  const names = uniq(inLine.map((r) => r.coverage.name));
  const carriers = uniq(all.map((r) => r.policy.carrier));
  const common = [...groupBy(inLine, (r) => r.coverage.name || 'Unnamed').entries()]
    .map(([label, list]) => ({ label, value: list.length, hint: `${new Set(list.map((r) => r.policy.id)).size} policies` }))
    .sort((a, b) => b.value - a.value);
  const policies = new Set(rows.map((r) => r.policy.id)).size;
  const activePolicies = d.policies.filter((p) => p.status === 'Active' && (!line || p.line_of_business === line) && (!carrier || p.carrier === carrier)).length;
  const columns: Column<CoverageRow>[] = [
    { key: 'num', header: 'Policy #', sortValue: (r) => r.policy.policy_number, render: (r) => polLink(r.policy) },
    { key: 'acct', header: 'Insured', sortValue: (r) => accountName(d.accountsById.get(r.policy.account_id)), render: (r) => acctLink(d, r.policy.account_id) },
    { key: 'line', header: 'Line', sortValue: (r) => r.policy.line_of_business, render: (r) => r.policy.line_of_business },
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.policy.carrier, render: (r) => r.policy.carrier },
    { key: 'cov', header: 'Coverage', sortValue: (r) => r.coverage.name, render: (r) => <span className="font-semibold">{r.coverage.name}</span> },
    { key: 'limit', header: 'Limit', sortValue: (r) => r.coverage.limit, render: (r) => r.coverage.limit || '—' },
    { key: 'ded', header: 'Deductible', sortValue: (r) => r.coverage.deductible, render: (r) => r.coverage.deductible || '—' },
    { key: 'prem', header: 'Coverage premium', align: 'right', sortValue: (r) => Number(r.coverage.premium ?? 0), render: (r) => (r.coverage.premium != null ? moneyCol(Number(r.coverage.premium)) : '—') },
  ];
  return (
    <ReportFrame
      reportKey="policy-coverage" title="Policy Coverage" description="Every coverage line on active policies — limits and deductibles by insured."
      filters={<>
        <FilterSelect label="Line of business" value={line} onChange={(v) => { setLine(v); setName(''); }} placeholder="All lines" options={LINES_OF_BUSINESS} />
        <FilterSelect label="Coverage" value={name} onChange={setName} placeholder="All coverages" options={names} />
        <FilterSelect label="Carrier" value={carrier} onChange={setCarrier} placeholder="All carriers" options={carriers} />
      </>}
      kpis={[
        { label: 'Coverage lines', value: fmtNumber(rows.length) },
        { label: 'Policies', value: fmtNumber(policies), hint: name ? `${fmtPct(policies, activePolicies)} of active policies carry it` : undefined },
        { label: 'Distinct coverages', value: fmtNumber(names.length) },
        { label: 'Avg coverages / policy', value: activePolicies ? (inLine.length / activePolicies).toFixed(1) : '—' },
      ]}
      chartTitle="Most common coverages"
      chart={<HBarChart ariaLabel="Most common coverages" data={common} onRowClick={(r) => setName(name === r.label ? '' : r.label)} />}
      columns={columns} rows={rows} initialSort={{ key: 'num', dir: 'asc' }}
      csv={() => rows.map((r) => ({
        policy_number: r.policy.policy_number, insured: accountName(d.accountsById.get(r.policy.account_id)), line: r.policy.line_of_business, carrier: r.policy.carrier,
        coverage: r.coverage.name, limit: r.coverage.limit ?? '', deductible: r.coverage.deductible ?? '', coverage_premium: r.coverage.premium ?? '',
      }))}
      note="Tip: click a bar to filter the table to that coverage."
    />
  );
}

// ── Policy Transactions ──
const TX_TYPES: TransactionType[] = ['New Business', 'Endorsement', 'Renewal', 'Cancellation', 'Reinstatement', 'Audit', 'Rewrite'];
export function PolicyTransactions({ data: d }: { data: ReportData }) {
  const [period, setPeriod] = useState<'12' | 'ytd' | 'all'>('12');
  const [type, setType] = useState('');
  const [line, setLine] = useState('');
  const [view, setView] = useState<'month' | 'type'>('month');
  const [measure, setMeasure] = useState<'count' | 'premium'>('count');
  const months = lastMonths(12);
  const from = period === '12' ? months[0].start : period === 'ytd' ? `${today().slice(0, 4)}-01-01` : '';
  const lineOf = (t: PolicyTransaction) => d.policiesById.get(t.policy_id)?.line_of_business ?? '';
  const inPeriod = d.transactions.filter((t) => (!from || t.effective_date >= from) && t.effective_date <= months[11].end && (!line || lineOf(t) === line));
  const rows = inPeriod.filter((t) => !type || t.type === type);
  const val = (list: PolicyTransaction[]) => (measure === 'count' ? list.length : sum(list, (t) => t.premium_change));
  const fmt = measure === 'count' ? (n: number) => fmtNumber(n) : money;
  const chartMonths = period === 'all' ? months : months.filter((m) => m.end >= from);
  const byType = TX_TYPES.map((ty) => ({ label: ty, value: val(inPeriod.filter((t) => t.type === ty)) })).filter((r) => r.value !== 0);
  const count = (ty: TransactionType) => rows.filter((t) => t.type === ty).length;
  const columns: Column<PolicyTransaction>[] = [
    { key: 'date', header: 'Effective', sortValue: (t) => t.effective_date, render: (t) => fmtDate(t.effective_date) },
    { key: 'type', header: 'Type', sortValue: (t) => t.type, render: (t) => <span className={'font-semibold ' + (t.type === 'Cancellation' ? 'text-red-600' : '')}>{t.type}</span> },
    { key: 'num', header: 'Policy #', sortValue: (t) => d.policiesById.get(t.policy_id)?.policy_number, render: (t) => { const p = d.policiesById.get(t.policy_id); return p ? polLink(p) : '—'; } },
    { key: 'acct', header: 'Account', sortValue: (t) => accountName(d.accountsById.get(t.account_id)), render: (t) => acctLink(d, t.account_id) },
    { key: 'line', header: 'Line', sortValue: lineOf, render: (t) => lineOf(t) || '—' },
    { key: 'chg', header: 'Premium change', align: 'right', sortValue: (t) => Number(t.premium_change), render: (t) => <span className={'tabular-nums font-semibold ' + (Number(t.premium_change) < 0 ? 'text-red-600' : '')}>{fmtMoney(t.premium_change)}</span> },
    { key: 'desc', header: 'Description', render: (t) => <span className="text-ink-500">{t.description || '—'}</span> },
  ];
  return (
    <ReportFrame
      reportKey="policy-transactions" title="Policy Transactions" description="Transaction register — new business, endorsements, renewals, cancellations and more, by type and month."
      filters={<>
        <FilterPills label="Period" value={period} onChange={setPeriod} options={[{ value: '12', label: 'Last 12 months' }, { value: 'ytd', label: 'Year to date' }, { value: 'all', label: 'All time' }]} />
        <FilterSelect label="Transaction type" value={type} onChange={setType} placeholder="All types" options={TX_TYPES} />
        <FilterSelect label="Line of business" value={line} onChange={setLine} placeholder="All lines" options={LINES_OF_BUSINESS} />
        <FilterPills label="Chart" value={view} onChange={setView} options={[{ value: 'month', label: 'By month' }, { value: 'type', label: 'By type' }]} />
        <FilterPills label="Measure" value={measure} onChange={setMeasure} options={[{ value: 'count', label: 'Count' }, { value: 'premium', label: 'Premium' }]} />
      </>}
      kpis={[
        { label: 'Transactions', value: fmtNumber(rows.length) },
        { label: 'Net premium change', value: fmtMoney(sum(rows, (t) => t.premium_change)), tone: 'green' },
        { label: 'New business / renewals', value: `${fmtNumber(count('New Business'))} / ${fmtNumber(count('Renewal'))}` },
        { label: 'Cancellations', value: fmtNumber(count('Cancellation')), tone: 'red' },
      ]}
      chartTitle={view === 'month' ? `${measure === 'count' ? 'Transactions' : 'Premium change'} by month${type ? ` · ${type}` : ''}` : `${measure === 'count' ? 'Transactions' : 'Premium change'} by type`}
      chart={view === 'month'
        ? <BarChart ariaLabel="Transactions by month" labels={chartMonths.map((m) => m.label)} series={[{ name: measure === 'count' ? 'Transactions' : 'Premium change', data: chartMonths.map((m) => val(rows.filter((t) => monthKey(t.effective_date) === m.key))) }]} format={fmt} axisFormat={measure === 'count' ? undefined : fmtCompactMoney} />
        : <HBarChart ariaLabel="Transactions by type" data={byType} format={fmt} onRowClick={(r) => setType(type === r.label ? '' : r.label)} />}
      columns={columns} rows={rows} initialSort={{ key: 'date', dir: 'desc' }}
      csv={() => rows.map((t) => ({ effective_date: t.effective_date, type: t.type, policy_number: d.policiesById.get(t.policy_id)?.policy_number ?? '', account: accountName(d.accountsById.get(t.account_id)), line: lineOf(t), premium_change: t.premium_change, description: t.description ?? '' }))}
      note={view === 'month' ? 'The monthly chart covers the last 12 months; the table follows the selected period.' : 'Tip: click a bar to filter the register to that type.'}
    />
  );
}

// ── Agency Summary ──
type ProducerRow = { id: string; producer: string; accounts: number; clients: number; policies: number; premium: number; commission: number; openTasks: number; quotes: number; bound: number };
export function AgencySummary({ data: d }: { data: ReportData }) {
  const { staff, activeStaff } = useAppData();
  const t = today();
  const active = d.policies.filter((p) => p.status === 'Active');
  const premium = sum(active, (p) => p.premium);
  const openTasks = d.activities.filter((a) => a.status !== 'Completed');
  const overdue = openTasks.filter((a) => a.due_date && a.due_date < t);
  const openClaims = d.claims.filter((c) => c.status === 'Open' || c.status === 'Under Review');
  const rows = useMemo<ProducerRow[]>(() => {
    const names = uniq([...staff.filter((s) => s.role === 'Producer' || s.role === 'Agency Owner').map((s) => s.name), ...d.accounts.map((a) => a.producer), ...active.map((p) => producerOf(p, d.accountsById))]);
    const acctProducer = (id: string | null) => (id ? d.accountsById.get(id)?.producer || 'Unassigned' : 'Unassigned');
    const list = [...names, 'Unassigned'].map((name) => {
      const accts = d.accounts.filter((a) => (a.producer || 'Unassigned') === name);
      const pols = active.filter((p) => producerOf(p, d.accountsById) === name);
      const quotes = d.quotes.filter((q) => acctProducer(q.account_id) === name);
      return {
        id: name, producer: name, accounts: accts.length, clients: accts.filter((a) => a.status === 'Active').length, policies: pols.length,
        premium: sum(pols, (p) => p.premium), commission: sum(pols, commissionOf),
        openTasks: d.activities.filter((a) => a.status !== 'Completed' && a.assigned_to === name).length,
        quotes: quotes.length, bound: quotes.filter((q) => q.status === 'Bound').length,
      };
    });
    return list.filter((r) => r.accounts || r.policies || r.openTasks || r.quotes);
  }, [staff, d.accounts, d.accountsById, d.activities, d.quotes, active]);
  const columns: Column<ProducerRow>[] = [
    { key: 'producer', header: 'Producer', sortValue: (r) => r.producer, render: (r) => <span className="font-semibold">{r.producer}</span> },
    { key: 'accounts', header: 'Accounts', align: 'right', sortValue: (r) => r.accounts, render: (r) => numCol(r.accounts) },
    { key: 'clients', header: 'Active clients', align: 'right', sortValue: (r) => r.clients, render: (r) => numCol(r.clients) },
    { key: 'policies', header: 'Active policies', align: 'right', sortValue: (r) => r.policies, render: (r) => numCol(r.policies) },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (r) => r.premium, render: (r) => moneyCol(r.premium, true) },
    { key: 'share', header: 'Share', align: 'right', sortValue: (r) => r.premium, render: (r) => <span className="tabular-nums">{fmtPct(r.premium, premium)}</span> },
    { key: 'comm', header: 'Est. commission', align: 'right', sortValue: (r) => r.commission, render: (r) => moneyCol(r.commission) },
    { key: 'quotes', header: 'Quotes (bound)', align: 'right', sortValue: (r) => r.quotes, render: (r) => <span className="tabular-nums">{fmtNumber(r.quotes)} ({fmtNumber(r.bound)})</span> },
    { key: 'tasks', header: 'Open tasks', align: 'right', sortValue: (r) => r.openTasks, render: (r) => numCol(r.openTasks) },
  ];
  return (
    <ReportFrame
      reportKey="agency-summary" title="Agency Summary" description="Agency-wide snapshot across accounts, policies, premium, tasks, claims and staff — with a breakdown by producer."
      kpis={[
        { label: 'Accounts', value: fmtNumber(d.accounts.length), hint: `${fmtNumber(d.accounts.filter((a) => a.status === 'Prospect').length)} prospects` },
        { label: 'Active clients', value: fmtNumber(d.accounts.filter((a) => a.status === 'Active').length), tone: 'green' },
        { label: 'Active policies', value: fmtNumber(active.length), hint: `${fmtNumber(d.policies.length)} total on file` },
        { label: 'Written premium', value: fmtMoney(premium), hint: `${fmtMoney(sum(active, commissionOf))} est. commission`, tone: 'green' },
        { label: 'Open tasks', value: fmtNumber(openTasks.length), hint: `${fmtNumber(overdue.length)} overdue`, tone: overdue.length ? 'amber' : 'brand' },
        { label: 'Open claims', value: fmtNumber(openClaims.length), hint: `${fmtNumber(d.claims.length)} total`, tone: openClaims.length ? 'red' : 'brand' },
        { label: 'Quotes', value: fmtNumber(d.quotes.length), hint: `${fmtPct(d.quotes.filter((q) => q.status === 'Bound').length, d.quotes.length)} bound` },
        { label: 'Staff', value: fmtNumber(activeStaff.length), hint: `${fmtNumber(staff.length - activeStaff.length)} inactive` },
      ]}
      chartTitle="Active premium by producer"
      chart={<HBarChart ariaLabel="Active premium by producer" format={money} data={rows.filter((r) => r.premium > 0).map((r) => ({ label: r.producer, value: r.premium, hint: `${r.policies} policies` }))} />}
      tableTitle="Breakdown by producer" columns={columns} rows={rows} initialSort={{ key: 'premium', dir: 'desc' }}
      csv={() => rows.map((r) => ({ producer: r.producer, accounts: r.accounts, active_clients: r.clients, active_policies: r.policies, premium: r.premium.toFixed(2), est_commission: r.commission.toFixed(2), quotes: r.quotes, bound_quotes: r.bound, open_tasks: r.openTasks }))}
      note="Accounts and quotes are attributed to the account's producer; policies use the policy producer (falling back to the account's)."
    />
  );
}
