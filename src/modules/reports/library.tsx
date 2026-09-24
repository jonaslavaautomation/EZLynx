import { useMemo, useState } from 'react';
import { StatusBadge, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { commissionOf } from '@/lib/domain';
import { accountName, addDays, daysUntil, fmtDate, fmtMoney, fmtNumber, parseDate, today } from '@/lib/format';
import { href } from '@/lib/router';
import { COMMERCIAL_LINES, LINES_OF_BUSINESS, type AccountStatus, type Policy } from '@/lib/types';
import { BarChart, DonutChart, HBarChart } from './charts';
import { colorAt, fmtCompactMoney } from './chart-utils';
import { fmtPct, groupBy, lastMonths, monthKey, pct, producerOf, sum, type ReportData } from './data';
import { FilterPills, FilterSelect, ReportFrame } from './frame';


const money = (n: number) => fmtMoney(n);
const moneyCol = (v: number, strong = false) => <span className={'tabular-nums' + (strong ? ' font-semibold' : '')}>{fmtMoney(v)}</span>;
const numCol = (v: number) => <span className="tabular-nums">{fmtNumber(v)}</span>;
const acctLink = (d: ReportData, id: string) => <a href={href(`/accounts/${id}`)} className="hover:underline">{accountName(d.accountsById.get(id))}</a>;
/** Compare timestamps by instant: Supabase returns '+00:00' offsets and local rows use 'Z', so string compares are unreliable. */
const onOrAfter = (ts: string | null | undefined, fromMs: number) => { const t = parseDate(ts); return !!t && t.getTime() >= fromMs; };
const polLink = (p: Policy) => <a href={href(`/policies/${p.id}`)} className="font-semibold hover:underline">{p.policy_number}</a>;

function useFilterOptions(d: ReportData) {
  const { carriers, staff } = useAppData();
  return useMemo(() => ({
    carriers: [...new Set([...carriers.map((c) => c.name), ...d.policies.map((p) => p.carrier)])].filter(Boolean).sort(),
    producers: [...new Set([...staff.map((s) => s.name), ...d.policies.map((p) => producerOf(p, d.accountsById))])].filter(Boolean).sort(),
    staff: staff.map((s) => s.name),
  }), [carriers, staff, d.policies, d.accountsById]);
}

type Agg = { id: string; label: string; count: number; premium: number; commission: number };
function aggregate(policies: Policy[], key: (p: Policy) => string): Agg[] {
  return [...groupBy(policies, key).entries()].map(([label, list]) => ({
    id: label, label, count: list.length, premium: sum(list, (p) => p.premium), commission: sum(list, commissionOf),
  })).sort((a, b) => b.premium - a.premium);
}

// 1. Book of Business
export function BookOfBusiness({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [by, setBy] = useState<'line' | 'carrier' | 'both'>('line');
  const [carrier, setCarrier] = useState('');
  const [line, setLine] = useState('');
  const [producer, setProducer] = useState('');
  const active = d.policies.filter((p) => p.status === 'Active' && (!carrier || p.carrier === carrier) && (!line || p.line_of_business === line) && (!producer || producerOf(p, d.accountsById) === producer));
  const rows = aggregate(active, (p) => (by === 'line' ? p.line_of_business : by === 'carrier' ? p.carrier : `${p.line_of_business} · ${p.carrier}`));
  const chartRows = aggregate(active, (p) => (by === 'carrier' ? p.carrier : p.line_of_business));
  const premium = sum(active, (p) => p.premium);
  const clients = new Set(active.map((p) => p.account_id)).size;
  const columns: Column<Agg>[] = [
    { key: 'label', header: by === 'line' ? 'Line of business' : by === 'carrier' ? 'Carrier' : 'Line · Carrier', sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'count', header: 'Policies', align: 'right', sortValue: (r) => r.count, render: (r) => numCol(r.count) },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (r) => r.premium, render: (r) => moneyCol(r.premium, true) },
    { key: 'share', header: 'Share', align: 'right', sortValue: (r) => r.premium, render: (r) => <span className="tabular-nums">{fmtPct(r.premium, premium)}</span> },
    { key: 'avg', header: 'Avg premium', align: 'right', sortValue: (r) => r.premium / r.count, render: (r) => moneyCol(r.premium / r.count) },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (r) => r.commission, render: (r) => moneyCol(r.commission) },
  ];
  return (
    <ReportFrame
      reportKey="book-of-business" title="Book of Business" description="Active policies in force, grouped by line of business and carrier."
      filters={<>
        <FilterPills label="Group by" value={by} onChange={setBy} options={[{ value: 'line', label: 'Line' }, { value: 'carrier', label: 'Carrier' }, { value: 'both', label: 'Line & carrier' }]} />
        <FilterSelect label="Carrier" value={carrier} onChange={setCarrier} placeholder="All carriers" options={opts.carriers} />
        <FilterSelect label="Line of business" value={line} onChange={setLine} placeholder="All lines" options={LINES_OF_BUSINESS} />
        <FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={opts.producers} />
      </>}
      kpis={[
        { label: 'Active policies', value: fmtNumber(active.length) },
        { label: 'Written premium', value: fmtMoney(premium), tone: 'green' },
        { label: 'Avg premium', value: fmtMoney(active.length ? premium / active.length : 0) },
        { label: 'Clients', value: fmtNumber(clients), hint: active.length && clients ? `${(active.length / clients).toFixed(2)} policies per client` : undefined },
      ]}
      chartTitle={`Premium by ${by === 'carrier' ? 'carrier' : 'line of business'}`}
      chart={<HBarChart ariaLabel="Premium by group" format={money} data={chartRows.map((r) => ({ label: r.label, value: r.premium, hint: `${r.count} policies` }))} />}
      columns={columns} rows={rows} initialSort={{ key: 'premium', dir: 'desc' }}
      csv={() => rows.map((r) => ({ group: r.label, policies: r.count, premium: r.premium.toFixed(2), share_pct: pct(r.premium, premium).toFixed(1), commission: r.commission.toFixed(2) }))}
    />
  );
}

// 2. Renewals Due
export function RenewalsDue({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [days, setDays] = useState<'30' | '60' | '90'>('60');
  const [producer, setProducer] = useState('');
  const [carrier, setCarrier] = useState('');
  const n = Number(days);
  const rows = d.policies.filter((p) => {
    const left = daysUntil(p.expiration_date);
    return p.status === 'Active' && left !== null && left >= 0 && left <= n && (!producer || producerOf(p, d.accountsById) === producer) && (!carrier || p.carrier === carrier);
  });
  const premium = sum(rows, (p) => p.premium);
  const weeks = Array.from({ length: Math.ceil(n / 7) + 1 }, (_, i) => i).filter((i) => i * 7 <= n);
  const weekData = weeks.map((i) => rows.filter((p) => Math.floor((daysUntil(p.expiration_date) ?? 0) / 7) === i));
  const columns: Column<Policy>[] = [
    { key: 'exp', header: 'Expires', sortValue: (p) => p.expiration_date, render: (p) => fmtDate(p.expiration_date) },
    { key: 'left', header: 'Days left', align: 'right', sortValue: (p) => daysUntil(p.expiration_date), render: (p) => { const l = daysUntil(p.expiration_date) ?? 0; return <span className={'tabular-nums font-semibold ' + (l <= 14 ? 'text-red-600' : l <= 30 ? 'text-amber-700' : '')}>{l}</span>; } },
    { key: 'num', header: 'Policy #', sortValue: (p) => p.policy_number, render: polLink },
    { key: 'acct', header: 'Account', sortValue: (p) => accountName(d.accountsById.get(p.account_id)), render: (p) => acctLink(d, p.account_id) },
    { key: 'line', header: 'Line', sortValue: (p) => p.line_of_business, render: (p) => p.line_of_business },
    { key: 'carrier', header: 'Carrier', sortValue: (p) => p.carrier, render: (p) => p.carrier },
    { key: 'prod', header: 'Producer', sortValue: (p) => producerOf(p, d.accountsById), render: (p) => producerOf(p, d.accountsById) },
    { key: 'prem', header: 'Premium', align: 'right', sortValue: (p) => Number(p.premium), render: (p) => moneyCol(p.premium, true) },
  ];
  return (
    <ReportFrame
      reportKey="renewals-due" title="Renewals Due" description="Active policies expiring in the selected window — review, remarket or confirm renewal."
      filters={<>
        <FilterPills label="Expiring within" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }]} />
        <FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={opts.producers} />
        <FilterSelect label="Carrier" value={carrier} onChange={setCarrier} placeholder="All carriers" options={opts.carriers} />
      </>}
      kpis={[
        { label: 'Policies renewing', value: fmtNumber(rows.length) },
        { label: 'Premium up for renewal', value: fmtMoney(premium), tone: 'green' },
        { label: 'Within 14 days', value: fmtNumber(rows.filter((p) => (daysUntil(p.expiration_date) ?? 99) <= 14).length), tone: 'red' },
        { label: 'Accounts', value: fmtNumber(new Set(rows.map((p) => p.account_id)).size) },
      ]}
      chartTitle="Renewing premium by week"
      chart={<BarChart ariaLabel="Renewing premium by week" labels={weeks.map((i) => `Wk ${i + 1}`)} series={[{ name: 'Premium', data: weekData.map((l) => sum(l, (p) => p.premium)) }]} format={money} axisFormat={fmtCompactMoney} />}
      columns={columns} rows={rows} initialSort={{ key: 'exp', dir: 'asc' }}
      csv={() => rows.map((p) => ({ expiration_date: p.expiration_date, days_left: daysUntil(p.expiration_date), policy_number: p.policy_number, account: accountName(d.accountsById.get(p.account_id)), line: p.line_of_business, carrier: p.carrier, producer: producerOf(p, d.accountsById), premium: p.premium }))}
    />
  );
}

// 3. Production (new business by month)
type MonthRow = { id: string; label: string; count: number; premium: number; commission: number };
export function Production({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [producer, setProducer] = useState('');
  const [measure, setMeasure] = useState<'premium' | 'count'>('premium');
  const months = lastMonths(12);
  const nb = d.transactions.filter((t) => {
    if (t.type !== 'New Business' || t.effective_date < months[0].start || t.effective_date > months[11].end) return false;
    const p = d.policiesById.get(t.policy_id);
    return !producer || (p ? producerOf(p, d.accountsById) : d.accountsById.get(t.account_id)?.producer) === producer;
  });
  const rows: MonthRow[] = months.map((m) => {
    const list = nb.filter((t) => monthKey(t.effective_date) === m.key);
    return {
      id: m.key, label: m.label, count: list.length, premium: sum(list, (t) => t.premium_change),
      commission: sum(list, (t) => { const p = d.policiesById.get(t.policy_id); return p ? (Number(t.premium_change) * Number(p.commission_rate)) / 100 : 0; }),
    };
  });
  const total = sum(rows, (r) => r.premium);
  const best = [...rows].sort((a, b) => b.premium - a.premium)[0];
  const columns: Column<MonthRow>[] = [
    { key: 'month', header: 'Month', sortValue: (r) => r.id, render: (r) => r.label },
    { key: 'count', header: 'New policies', align: 'right', sortValue: (r) => r.count, render: (r) => numCol(r.count) },
    { key: 'premium', header: 'New premium', align: 'right', sortValue: (r) => r.premium, render: (r) => moneyCol(r.premium, true) },
    { key: 'avg', header: 'Avg premium', align: 'right', sortValue: (r) => (r.count ? r.premium / r.count : 0), render: (r) => (r.count ? moneyCol(r.premium / r.count) : '—') },
    { key: 'comm', header: 'Est. commission', align: 'right', sortValue: (r) => r.commission, render: (r) => moneyCol(r.commission) },
  ];
  return (
    <ReportFrame
      reportKey="production" title="Production" description="New business written by month over the last 12 months (New Business transactions)."
      filters={<>
        <FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={opts.producers} />
        <FilterPills label="Measure" value={measure} onChange={setMeasure} options={[{ value: 'premium', label: 'Premium' }, { value: 'count', label: 'Policy count' }]} />
      </>}
      kpis={[
        { label: 'New policies', value: fmtNumber(nb.length) },
        { label: 'New premium', value: fmtMoney(total), tone: 'green' },
        { label: 'Avg premium', value: fmtMoney(nb.length ? total / nb.length : 0) },
        { label: 'Best month', value: best && best.premium > 0 ? best.label : '—', hint: best && best.premium > 0 ? fmtMoney(best.premium) : undefined },
      ]}
      chartTitle={measure === 'premium' ? 'New business premium by month' : 'New policies by month'}
      chart={<BarChart ariaLabel="New business by month" labels={rows.map((r) => r.label)} series={[{ name: measure === 'premium' ? 'New premium' : 'New policies', data: rows.map((r) => (measure === 'premium' ? r.premium : r.count)) }]} format={measure === 'premium' ? money : fmtNumber} axisFormat={measure === 'premium' ? fmtCompactMoney : undefined} />}
      columns={columns} rows={rows} initialSort={{ key: 'month', dir: 'desc' }}
      csv={() => rows.map((r) => ({ month: r.id, new_policies: r.count, new_premium: r.premium.toFixed(2), est_commission: r.commission.toFixed(2) }))}
    />
  );
}

// 4 & 5. Carrier / Line mix
function MixReport({ data: d, dim }: { data: ReportData; dim: 'carrier' | 'line' }) {
  const opts = useFilterOptions(d);
  const [scope, setScope] = useState<'active' | 'inforce'>('active');
  const [segment, setSegment] = useState<'all' | 'personal' | 'commercial'>('all');
  const [filter, setFilter] = useState('');
  const list = d.policies.filter((p) => (scope === 'active' ? p.status === 'Active' : p.status === 'Active' || p.status === 'Pending')
    && (segment === 'all' || (segment === 'commercial') === COMMERCIAL_LINES.includes(p.line_of_business))
    && (!filter || (dim === 'carrier' ? p.line_of_business === filter : p.carrier === filter)));
  const rows = aggregate(list, (p) => (dim === 'carrier' ? p.carrier : p.line_of_business));
  const premium = sum(list, (p) => p.premium);
  const top = rows[0];
  const name = dim === 'carrier' ? 'Carrier' : 'Line of business';
  const columns: Column<Agg>[] = [
    { key: 'label', header: name, sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'count', header: 'Policies', align: 'right', sortValue: (r) => r.count, render: (r) => numCol(r.count) },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (r) => r.premium, render: (r) => moneyCol(r.premium, true) },
    { key: 'share', header: 'Premium share', align: 'right', sortValue: (r) => r.premium, render: (r) => <span className="tabular-nums">{fmtPct(r.premium, premium)}</span> },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (r) => r.commission, render: (r) => moneyCol(r.commission) },
    { key: 'rate', header: 'Eff. rate', align: 'right', sortValue: (r) => pct(r.commission, r.premium), render: (r) => <span className="tabular-nums">{fmtPct(r.commission, r.premium)}</span> },
  ];
  return (
    <ReportFrame
      reportKey={dim === 'carrier' ? 'carrier-mix' : 'line-mix'} title={dim === 'carrier' ? 'Carrier Mix' : 'Lines of Business Mix'}
      description={dim === 'carrier' ? 'Share of written premium placed with each carrier.' : 'Share of written premium by line of business.'}
      filters={<>
        <FilterPills label="Policies" value={scope} onChange={setScope} options={[{ value: 'active', label: 'Active' }, { value: 'inforce', label: 'Active + Pending' }]} />
        <FilterPills label="Segment" value={segment} onChange={setSegment} options={[{ value: 'all', label: 'All' }, { value: 'personal', label: 'Personal' }, { value: 'commercial', label: 'Commercial' }]} />
        {dim === 'carrier'
          ? <FilterSelect label="Line of business" value={filter} onChange={setFilter} placeholder="All lines" options={LINES_OF_BUSINESS} />
          : <FilterSelect label="Carrier" value={filter} onChange={setFilter} placeholder="All carriers" options={opts.carriers} />}
      </>}
      kpis={[
        { label: dim === 'carrier' ? 'Carriers written' : 'Lines written', value: fmtNumber(rows.length) },
        { label: 'Written premium', value: fmtMoney(premium), tone: 'green' },
        { label: `Top ${dim === 'carrier' ? 'carrier' : 'line'}`, value: top ? <span className="text-base">{top.label}</span> : '—', hint: top ? `${fmtPct(top.premium, premium)} of premium` : undefined },
        { label: 'Policies', value: fmtNumber(list.length) },
      ]}
      chartTitle={`Premium share by ${dim === 'carrier' ? 'carrier' : 'line'}`}
      chart={<DonutChart ariaLabel={`Premium share by ${dim}`} data={rows.map((r) => ({ label: r.label, value: r.premium }))} format={money} centerLabel="Premium" />}
      columns={columns} rows={rows} initialSort={{ key: 'premium', dir: 'desc' }}
      csv={() => rows.map((r) => ({ [dim]: r.label, policies: r.count, premium: r.premium.toFixed(2), share_pct: pct(r.premium, premium).toFixed(1), commission: r.commission.toFixed(2) }))}
    />
  );
}

// 6. Commission Summary
export function CommissionSummary({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [by, setBy] = useState<'carrier' | 'producer' | 'line'>('carrier');
  const [period, setPeriod] = useState<'12m' | 'ytd' | 'all'>('12m');
  const [carrier, setCarrier] = useState('');
  const from = period === '12m' ? addDays(today(), -365) : period === 'ytd' ? `${new Date().getFullYear()}-01-01` : '';
  const list = d.policies.filter((p) => p.status !== 'Pending' && (!from || (p.effective_date >= from && p.effective_date <= today())) && (!carrier || p.carrier === carrier));
  const rows = aggregate(list, (p) => (by === 'carrier' ? p.carrier : by === 'producer' ? producerOf(p, d.accountsById) : p.line_of_business)).sort((a, b) => b.commission - a.commission);
  const premium = sum(list, (p) => p.premium), commission = sum(list, commissionOf);
  const label = by === 'carrier' ? 'Carrier' : by === 'producer' ? 'Producer' : 'Line';
  const columns: Column<Agg>[] = [
    { key: 'label', header: label, sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'count', header: 'Policies', align: 'right', sortValue: (r) => r.count, render: (r) => numCol(r.count) },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (r) => r.premium, render: (r) => moneyCol(r.premium) },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (r) => r.commission, render: (r) => moneyCol(r.commission, true) },
    { key: 'rate', header: 'Eff. rate', align: 'right', sortValue: (r) => pct(r.commission, r.premium), render: (r) => <span className="tabular-nums">{fmtPct(r.commission, r.premium)}</span> },
    { key: 'share', header: 'Share', align: 'right', sortValue: (r) => r.commission, render: (r) => <span className="tabular-nums">{fmtPct(r.commission, commission)}</span> },
  ];
  return (
    <ReportFrame
      reportKey="commission-summary" title="Commission Summary" description="Commission earned (premium × commission rate) on policies effective in the period. Excludes pending policies."
      filters={<>
        <FilterPills label="Group by" value={by} onChange={setBy} options={[{ value: 'carrier', label: 'Carrier' }, { value: 'producer', label: 'Producer' }, { value: 'line', label: 'Line' }]} />
        <FilterPills label="Effective" value={period} onChange={setPeriod} options={[{ value: '12m', label: 'Last 12 months' }, { value: 'ytd', label: 'Year to date' }, { value: 'all', label: 'All' }]} />
        <FilterSelect label="Carrier" value={carrier} onChange={setCarrier} placeholder="All carriers" options={opts.carriers} />
      </>}
      kpis={[
        { label: 'Commission', value: fmtMoney(commission), tone: 'green' },
        { label: 'Premium', value: fmtMoney(premium) },
        { label: 'Effective rate', value: fmtPct(commission, premium) },
        { label: 'Policies', value: fmtNumber(list.length) },
      ]}
      chartTitle={`Commission by ${label.toLowerCase()}`}
      chart={<HBarChart ariaLabel={`Commission by ${label}`} format={money} data={rows.map((r) => ({ label: r.label, value: r.commission, hint: `${fmtPct(r.commission, r.premium)} of ${fmtMoney(r.premium)}` }))} />}
      columns={columns} rows={rows} initialSort={{ key: 'comm', dir: 'desc' }}
      csv={() => rows.map((r) => ({ [by]: r.label, policies: r.count, premium: r.premium.toFixed(2), commission: r.commission.toFixed(2), effective_rate_pct: pct(r.commission, r.premium).toFixed(2) }))}
    />
  );
}

// 7. Cancellations & Non-renewals
type LostRow = { id: string; policy: Policy; kind: 'Cancellation' | 'Non-Renewal'; date: string; reason: string };
function lostPolicies(d: ReportData): LostRow[] {
  const cancelTx = groupBy(d.transactions.filter((t) => t.type === 'Cancellation'), (t) => t.policy_id);
  return d.policies.filter((p) => p.status === 'Cancelled' || p.status === 'Non-Renewed').map((p) => {
    const tx = cancelTx.get(p.id)?.sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    return {
      id: p.id, policy: p, kind: p.status === 'Cancelled' ? 'Cancellation' as const : 'Non-Renewal' as const,
      date: tx?.effective_date ?? p.expiration_date, reason: tx?.description ?? (p.status === 'Non-Renewed' ? 'Non-renewed at expiration' : '—'),
    };
  });
}
export function Cancellations({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [days, setDays] = useState<'30' | '90' | '180' | '365'>('90');
  const [producer, setProducer] = useState('');
  const from = addDays(today(), -Number(days));
  const rows = lostPolicies(d).filter((r) => r.date >= from && r.date <= today() && (!producer || producerOf(r.policy, d.accountsById) === producer));
  const cancels = rows.filter((r) => r.kind === 'Cancellation'), nonRen = rows.filter((r) => r.kind === 'Non-Renewal');
  // Every calendar month the window touches (e.g. 90 days back from Sep 24 starts in June → Jun–Sep),
  // so rows near the start of the window aren't dropped from the chart. 30 days charts by reason instead.
  const fromD = parseDate(from)!, nowD = parseDate(today())!;
  const months = days === '30' ? [] : lastMonths((nowD.getFullYear() - fromD.getFullYear()) * 12 + nowD.getMonth() - fromD.getMonth() + 1);
  const reasons = [...groupBy(rows, (r) => r.reason).entries()].map(([label, l]) => ({ label, value: l.length, hint: fmtMoney(sum(l, (r) => r.policy.premium)) })).sort((a, b) => b.value - a.value);
  const columns: Column<LostRow>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => fmtDate(r.date) },
    { key: 'kind', header: 'Type', sortValue: (r) => r.kind, render: (r) => <StatusBadge status={r.policy.status} /> },
    { key: 'num', header: 'Policy #', sortValue: (r) => r.policy.policy_number, render: (r) => polLink(r.policy) },
    { key: 'acct', header: 'Account', sortValue: (r) => accountName(d.accountsById.get(r.policy.account_id)), render: (r) => acctLink(d, r.policy.account_id) },
    { key: 'line', header: 'Line', sortValue: (r) => r.policy.line_of_business, render: (r) => r.policy.line_of_business },
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.policy.carrier, render: (r) => r.policy.carrier },
    { key: 'reason', header: 'Reason', sortValue: (r) => r.reason, render: (r) => r.reason },
    { key: 'prem', header: 'Premium lost', align: 'right', sortValue: (r) => Number(r.policy.premium), render: (r) => moneyCol(r.policy.premium, true) },
  ];
  return (
    <ReportFrame
      reportKey="cancellations" title="Cancellations & Non-renewals" description="Policies lost to cancellation or non-renewal in the selected period."
      filters={<>
        <FilterPills label="Last" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '180 days' }, { value: '365', label: '12 months' }]} />
        <FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={opts.producers} />
      </>}
      kpis={[
        { label: 'Policies lost', value: fmtNumber(rows.length), tone: 'red' },
        { label: 'Premium lost', value: fmtMoney(sum(rows, (r) => r.policy.premium)), tone: 'red' },
        { label: 'Cancellations', value: fmtNumber(cancels.length) },
        { label: 'Non-renewals', value: fmtNumber(nonRen.length) },
      ]}
      chartTitle={months.length > 1 ? 'Policies lost by month' : 'Policies lost by reason'}
      chart={months.length > 1
        ? <BarChart ariaLabel="Policies lost by month" labels={months.map((m) => m.label)} format={fmtNumber}
            series={[{ name: 'Cancellations', data: months.map((m) => cancels.filter((r) => monthKey(r.date) === m.key).length) }, { name: 'Non-renewals', data: months.map((m) => nonRen.filter((r) => monthKey(r.date) === m.key).length) }]} />
        : <HBarChart ariaLabel="Policies lost by reason" format={fmtNumber} data={reasons} />}
      columns={columns} rows={rows} initialSort={{ key: 'date', dir: 'desc' }}
      csv={() => rows.map((r) => ({ date: r.date, type: r.kind, policy_number: r.policy.policy_number, account: accountName(d.accountsById.get(r.policy.account_id)), line: r.policy.line_of_business, carrier: r.policy.carrier, reason: r.reason, premium: r.policy.premium }))}
    />
  );
}

// 8. Retention
type RetRow = { id: string; label: string; renewed: number; lost: number; renewedPremium: number; lostPremium: number };
export function Retention({ data: d }: { data: ReportData }) {
  const opts = useFilterOptions(d);
  const [producer, setProducer] = useState('');
  const months = lastMonths(12);
  const byProducer = (policyId: string, accountId: string) => {
    if (!producer) return true;
    const p = d.policiesById.get(policyId);
    return (p ? producerOf(p, d.accountsById) : d.accountsById.get(accountId)?.producer) === producer;
  };
  const renewals = d.transactions.filter((t) => t.type === 'Renewal' && t.effective_date <= today() && byProducer(t.policy_id, t.account_id));
  const lost = lostPolicies(d).filter((r) => byProducer(r.policy.id, r.policy.account_id));
  const expired = d.policies.filter((p) => p.status === 'Expired' && byProducer(p.id, p.account_id)).map((p) => ({ date: p.expiration_date, premium: Number(p.premium) }));
  const lostAll = [...lost.map((r) => ({ date: r.date, premium: Number(r.policy.premium) })), ...expired];
  const rows: RetRow[] = months.map((m) => {
    const rn = renewals.filter((t) => monthKey(t.effective_date) === m.key);
    const ls = lostAll.filter((x) => monthKey(x.date) === m.key && x.date <= today());
    return { id: m.key, label: m.label, renewed: rn.length, lost: ls.length, renewedPremium: sum(rn, (t) => t.premium_change), lostPremium: sum(ls, (x) => x.premium) };
  });
  const R = sum(rows, (r) => r.renewed), L = sum(rows, (r) => r.lost);
  const columns: Column<RetRow>[] = [
    { key: 'month', header: 'Month', sortValue: (r) => r.id, render: (r) => r.label },
    { key: 'ren', header: 'Renewed', align: 'right', sortValue: (r) => r.renewed, render: (r) => numCol(r.renewed) },
    { key: 'lost', header: 'Lost', align: 'right', sortValue: (r) => r.lost, render: (r) => numCol(r.lost) },
    { key: 'rate', header: 'Retention', align: 'right', sortValue: (r) => pct(r.renewed, r.renewed + r.lost), render: (r) => <span className="tabular-nums font-semibold">{fmtPct(r.renewed, r.renewed + r.lost)}</span> },
    { key: 'rp', header: 'Premium retained', align: 'right', sortValue: (r) => r.renewedPremium, render: (r) => moneyCol(r.renewedPremium) },
    { key: 'lp', header: 'Premium lost', align: 'right', sortValue: (r) => r.lostPremium, render: (r) => moneyCol(r.lostPremium) },
  ];
  return (
    <ReportFrame
      reportKey="retention" title="Retention Rate" description="Policies renewed vs. lost (cancelled, non-renewed or expired) by month, last 12 months."
      filters={<FilterSelect label="Producer" value={producer} onChange={setProducer} placeholder="All producers" options={opts.producers} />}
      kpis={[
        { label: 'Retention rate', value: fmtPct(R, R + L), tone: 'green' },
        { label: 'Renewed', value: fmtNumber(R) },
        { label: 'Lost', value: fmtNumber(L), tone: 'red' },
        { label: 'Premium retention', value: fmtPct(sum(rows, (r) => r.renewedPremium), sum(rows, (r) => r.renewedPremium + r.lostPremium)) },
      ]}
      chartTitle="Renewed vs. lost policies by month"
      chart={<BarChart ariaLabel="Renewed vs lost by month" labels={rows.map((r) => r.label)} format={fmtNumber}
        series={[{ name: 'Renewed', data: rows.map((r) => r.renewed), color: colorAt(0) }, { name: 'Lost', data: rows.map((r) => r.lost), color: colorAt(1) }]} />}
      columns={columns} rows={rows} initialSort={{ key: 'month', dir: 'desc' }}
      note="Renewed = Renewal transactions effective in the month. Lost = cancellation/non-renewal date, or expiration date of expired policies."
      csv={() => rows.map((r) => ({ month: r.id, renewed: r.renewed, lost: r.lost, retention_pct: pct(r.renewed, r.renewed + r.lost).toFixed(1), premium_retained: r.renewedPremium.toFixed(2), premium_lost: r.lostPremium.toFixed(2) }))}
    />
  );
}

// 9. Activity Productivity
type StaffRow = { id: string; name: string; completed: number; open: number; overdue: number; dueToday: number };
export function ActivityProductivity({ data: d }: { data: ReportData }) {
  const { staff } = useAppData();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const from = Date.now() - Number(days) * 86400000;
  const t = today();
  const names = [...new Set([...staff.filter((s) => s.active).map((s) => s.name), ...d.activities.map((a) => a.assigned_to ?? 'Unassigned')])];
  const rows: StaffRow[] = names.map((name) => {
    const mine = d.activities.filter((a) => (a.assigned_to ?? 'Unassigned') === name);
    const open = mine.filter((a) => a.status !== 'Completed');
    return {
      id: name, name, completed: mine.filter((a) => a.status === 'Completed' && onOrAfter(a.completed_at, from)).length,
      open: open.length, overdue: open.filter((a) => a.due_date && a.due_date < t).length, dueToday: open.filter((a) => a.due_date === t).length,
    };
  }).filter((r) => r.completed + r.open > 0 || staff.some((s) => s.name === r.name)).sort((a, b) => b.completed - a.completed);
  const C = sum(rows, (r) => r.completed), O = sum(rows, (r) => r.open), OD = sum(rows, (r) => r.overdue);
  const columns: Column<StaffRow>[] = [
    { key: 'name', header: 'Staff member', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'comp', header: `Completed (${days}d)`, align: 'right', sortValue: (r) => r.completed, render: (r) => <span className="tabular-nums font-semibold">{r.completed}</span> },
    { key: 'open', header: 'Open', align: 'right', sortValue: (r) => r.open, render: (r) => numCol(r.open) },
    { key: 'today', header: 'Due today', align: 'right', sortValue: (r) => r.dueToday, render: (r) => numCol(r.dueToday) },
    { key: 'od', header: 'Overdue', align: 'right', sortValue: (r) => r.overdue, render: (r) => <span className={'tabular-nums ' + (r.overdue ? 'text-red-600 font-semibold' : '')}>{r.overdue}</span> },
    { key: 'pct', header: 'On-time open', align: 'right', sortValue: (r) => pct(r.open - r.overdue, r.open), render: (r) => <span className="tabular-nums">{r.open ? fmtPct(r.open - r.overdue, r.open) : '—'}</span> },
  ];
  return (
    <ReportFrame
      reportKey="activity-productivity" title="Activity Productivity" description="Activities completed per staff member, with current open and overdue workload."
      filters={<FilterPills label="Completed in last" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
      kpis={[
        { label: `Completed (${days} days)`, value: fmtNumber(C), tone: 'green' },
        { label: 'Open activities', value: fmtNumber(O) },
        { label: 'Overdue', value: fmtNumber(OD), tone: 'red' },
        { label: 'On-time rate', value: fmtPct(O - OD, O), hint: 'Open items not yet past due' },
      ]}
      chartTitle="Open workload by staff member"
      chart={<BarChart ariaLabel="Open workload by staff" labels={rows.map((r) => r.name.split(' ')[0])} format={fmtNumber}
        series={[{ name: 'On time', data: rows.map((r) => r.open - r.overdue), color: colorAt(0) }, { name: 'Overdue', data: rows.map((r) => r.overdue), color: colorAt(1) }]} />}
      columns={columns} rows={rows} initialSort={{ key: 'comp', dir: 'desc' }}
      csv={() => rows.map((r) => ({ staff: r.name, [`completed_${days}d`]: r.completed, open: r.open, due_today: r.dueToday, overdue: r.overdue }))}
    />
  );
}

// 10. Claims Summary
type ClaimAgg = { id: string; label: string; count: number; open: number; reserved: number; paid: number };
export function ClaimsSummary({ data: d }: { data: ReportData }) {
  const [by, setBy] = useState<'loss' | 'status'>('loss');
  const [period, setPeriod] = useState<'90' | '365' | 'all'>('365');
  const from = period === 'all' ? '' : addDays(today(), -Number(period));
  const list = d.claims.filter((c) => !from || c.date_of_loss >= from);
  const isOpen = (s: string) => s === 'Open' || s === 'Under Review';
  const rows: ClaimAgg[] = [...groupBy(list, (c) => (by === 'loss' ? c.loss_type || 'Other' : c.status)).entries()].map(([label, l]) => ({
    id: label, label, count: l.length, open: l.filter((c) => isOpen(c.status)).length, reserved: sum(l, (c) => c.amount_reserved ?? 0), paid: sum(l, (c) => c.amount_paid ?? 0),
  })).sort((a, b) => b.count - a.count);
  const reserved = sum(list, (c) => c.amount_reserved ?? 0), paid = sum(list, (c) => c.amount_paid ?? 0);
  const columns: Column<ClaimAgg>[] = [
    { key: 'label', header: by === 'loss' ? 'Loss type' : 'Status', sortValue: (r) => r.label, render: (r) => (by === 'status' ? <StatusBadge status={r.label} /> : r.label) },
    { key: 'count', header: 'Claims', align: 'right', sortValue: (r) => r.count, render: (r) => numCol(r.count) },
    { key: 'open', header: 'Open', align: 'right', sortValue: (r) => r.open, render: (r) => numCol(r.open) },
    { key: 'res', header: 'Reserved', align: 'right', sortValue: (r) => r.reserved, render: (r) => moneyCol(r.reserved) },
    { key: 'paid', header: 'Paid', align: 'right', sortValue: (r) => r.paid, render: (r) => moneyCol(r.paid, true) },
    { key: 'ratio', header: 'Paid / reserved', align: 'right', sortValue: (r) => pct(r.paid, r.reserved), render: (r) => <span className="tabular-nums">{fmtPct(r.paid, r.reserved)}</span> },
  ];
  return (
    <ReportFrame
      reportKey="claims-summary" title="Claims Summary" description="Claims by loss type or status with reserved and paid amounts."
      filters={<>
        <FilterPills label="Group by" value={by} onChange={setBy} options={[{ value: 'loss', label: 'Loss type' }, { value: 'status', label: 'Status' }]} />
        <FilterPills label="Date of loss" value={period} onChange={setPeriod} options={[{ value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }, { value: 'all', label: 'All' }]} />
      </>}
      kpis={[
        { label: 'Claims', value: fmtNumber(list.length) },
        { label: 'Open claims', value: fmtNumber(list.filter((c) => isOpen(c.status)).length), tone: 'amber' },
        { label: 'Reserved', value: fmtMoney(reserved) },
        { label: 'Paid', value: fmtMoney(paid), hint: reserved ? `${fmtPct(paid, reserved)} of reserves` : undefined, tone: 'green' },
      ]}
      chartTitle={`Claim count by ${by === 'loss' ? 'loss type' : 'status'}`}
      chart={<BarChart ariaLabel="Claims by group" labels={rows.map((r) => r.label)} format={fmtNumber}
        series={[{ name: 'Open', data: rows.map((r) => r.open), color: colorAt(0) }, { name: 'Closed / resolved', data: rows.map((r) => r.count - r.open), color: colorAt(2) }]} />}
      columns={columns} rows={rows} initialSort={{ key: 'count', dir: 'desc' }}
      csv={() => rows.map((r) => ({ [by === 'loss' ? 'loss_type' : 'status']: r.label, claims: r.count, open: r.open, reserved: r.reserved.toFixed(2), paid: r.paid.toFixed(2) }))}
    />
  );
}

// 11. Quote Close Ratio
type QuoteAgg = { id: string; label: string; total: number; bound: number; lost: number; open: number; boundPremium: number };
export function QuoteCloseRatio({ data: d }: { data: ReportData }) {
  const [by, setBy] = useState<'producer' | 'line'>('producer');
  const [period, setPeriod] = useState<'90' | '365' | 'all'>('365');
  const from = period === 'all' ? null : Date.now() - Number(period) * 86400000;
  const list = d.quotes.filter((q) => from === null || onOrAfter(q.created_at, from));
  const rows: QuoteAgg[] = [...groupBy(list, (q) => (by === 'line' ? q.line_of_business : d.accountsById.get(q.account_id)?.producer || 'Unassigned')).entries()].map(([label, l]) => ({
    id: label, label, total: l.length, bound: l.filter((q) => q.status === 'Bound').length, lost: l.filter((q) => q.status === 'Lost').length,
    open: l.filter((q) => q.status === 'Draft' || q.status === 'Rated').length, boundPremium: sum(l.filter((q) => q.status === 'Bound'), (q) => q.selected_premium ?? 0),
  })).sort((a, b) => b.total - a.total);
  const T = sum(rows, (r) => r.total), B = sum(rows, (r) => r.bound), Lo = sum(rows, (r) => r.lost);
  const columns: Column<QuoteAgg>[] = [
    { key: 'label', header: by === 'line' ? 'Line of business' : 'Producer', sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'total', header: 'Quotes', align: 'right', sortValue: (r) => r.total, render: (r) => numCol(r.total) },
    { key: 'bound', header: 'Bound', align: 'right', sortValue: (r) => r.bound, render: (r) => numCol(r.bound) },
    { key: 'lost', header: 'Lost', align: 'right', sortValue: (r) => r.lost, render: (r) => numCol(r.lost) },
    { key: 'open', header: 'Open', align: 'right', sortValue: (r) => r.open, render: (r) => numCol(r.open) },
    { key: 'ratio', header: 'Close ratio', align: 'right', sortValue: (r) => pct(r.bound, r.total), render: (r) => <span className="tabular-nums font-semibold">{fmtPct(r.bound, r.total)}</span> },
    { key: 'prem', header: 'Bound premium', align: 'right', sortValue: (r) => r.boundPremium, render: (r) => moneyCol(r.boundPremium) },
  ];
  return (
    <ReportFrame
      reportKey="quote-close-ratio" title="Quote Close Ratio" description="Quotes bound vs. total quotes created, by producer or line of business."
      filters={<>
        <FilterPills label="Group by" value={by} onChange={setBy} options={[{ value: 'producer', label: 'Producer' }, { value: 'line', label: 'Line' }]} />
        <FilterPills label="Quoted" value={period} onChange={setPeriod} options={[{ value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }, { value: 'all', label: 'All' }]} />
      </>}
      kpis={[
        { label: 'Quotes', value: fmtNumber(T) },
        { label: 'Bound', value: fmtNumber(B), tone: 'green' },
        { label: 'Close ratio', value: fmtPct(B, T), hint: T - B - Lo > 0 ? `${T - B - Lo} still open` : undefined },
        { label: 'Bound premium', value: fmtMoney(sum(rows, (r) => r.boundPremium)) },
      ]}
      chartTitle={`Quote outcomes by ${by}`}
      chart={<BarChart ariaLabel="Quote outcomes" labels={rows.map((r) => (by === 'producer' ? r.label.split(' ')[0] : r.label))} format={fmtNumber}
        series={[{ name: 'Bound', data: rows.map((r) => r.bound), color: colorAt(0) }, { name: 'Open', data: rows.map((r) => r.open), color: colorAt(2) }, { name: 'Lost', data: rows.map((r) => r.lost), color: colorAt(1) }]} />}
      columns={columns} rows={rows} initialSort={{ key: 'total', dir: 'desc' }}
      csv={() => rows.map((r) => ({ [by]: r.label, quotes: r.total, bound: r.bound, lost: r.lost, open: r.open, close_ratio_pct: pct(r.bound, r.total).toFixed(1), bound_premium: r.boundPremium.toFixed(2) }))}
    />
  );
}

// 12. Accounts by Lead Source
const STATUSES: AccountStatus[] = ['Prospect', 'Pending', 'Active', 'Inactive'];
type SourceRow = { id: string; label: string; total: number } & Record<AccountStatus, number>;
export function LeadSources({ data: d }: { data: ReportData }) {
  const [type, setType] = useState<'all' | 'Personal' | 'Commercial'>('all');
  const [period, setPeriod] = useState<'90' | '365' | 'all'>('all');
  const from = period === 'all' ? null : Date.now() - Number(period) * 86400000;
  const list = d.accounts.filter((a) => (type === 'all' || (a.account_type ?? 'Personal') === type) && (from === null || onOrAfter(a.created_at, from)));
  const rows: SourceRow[] = [...groupBy(list, (a) => a.lead_source || 'Unknown').entries()].map(([label, l]) => {
    const r = { id: label, label, total: l.length } as SourceRow;
    STATUSES.forEach((s) => { r[s] = l.filter((a) => (a.status ?? 'Prospect') === s).length; });
    return r;
  }).sort((a, b) => b.total - a.total);
  const clients = (r: Pick<SourceRow, 'Active' | 'Inactive'>) => r.Active + r.Inactive;
  const totals = STATUSES.reduce((o, s) => ({ ...o, [s]: sum(rows, (r) => r[s]) }), {} as Record<AccountStatus, number>);
  const best = [...rows].filter((r) => r.total >= 2).sort((a, b) => pct(clients(b), b.total) - pct(clients(a), a.total))[0];
  const columns: Column<SourceRow>[] = [
    { key: 'label', header: 'Lead source', sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'total', header: 'Accounts', align: 'right', sortValue: (r) => r.total, render: (r) => <span className="tabular-nums font-semibold">{r.total}</span> },
    ...STATUSES.map((s): Column<SourceRow> => ({ key: s, header: s, align: 'right', sortValue: (r) => r[s], render: (r) => numCol(r[s]) })),
    { key: 'conv', header: 'Conversion', align: 'right', sortValue: (r) => pct(clients(r), r.total), render: (r) => <span className="tabular-nums font-semibold">{fmtPct(clients(r), r.total)}</span> },
  ];
  return (
    <ReportFrame
      reportKey="lead-sources" title="Accounts by Lead Source" description="Where accounts come from and how many convert from prospect to client."
      filters={<>
        <FilterPills label="Account type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'Personal', label: 'Personal' }, { value: 'Commercial', label: 'Commercial' }]} />
        <FilterPills label="Created" value={period} onChange={setPeriod} options={[{ value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }, { value: 'all', label: 'All' }]} />
      </>}
      kpis={[
        { label: 'Accounts', value: fmtNumber(list.length) },
        { label: 'Prospects', value: fmtNumber(totals.Prospect ?? 0), tone: 'purple' },
        { label: 'Conversion rate', value: fmtPct((totals.Active ?? 0) + (totals.Inactive ?? 0), list.length), tone: 'green', hint: 'Active + former clients' },
        { label: 'Best converting source', value: best ? <span className="text-base">{best.label}</span> : '—', hint: best ? fmtPct(clients(best), best.total) : undefined },
      ]}
      chartTitle="Accounts by lead source and status"
      chart={<BarChart ariaLabel="Accounts by lead source and status" labels={rows.map((r) => r.label)} format={fmtNumber}
        series={STATUSES.map((s, i) => ({ name: s, data: rows.map((r) => r[s]), color: colorAt(i) }))} />}
      columns={columns} rows={rows} initialSort={{ key: 'total', dir: 'desc' }}
      note="Conversion = accounts that became clients (Active, or Inactive former clients) ÷ all accounts from the source."
      csv={() => rows.map((r) => ({ lead_source: r.label, accounts: r.total, prospect: r.Prospect, pending: r.Pending, active: r.Active, inactive: r.Inactive, conversion_pct: pct(clients(r), r.total).toFixed(1) }))}
    />
  );
}

export function CarrierMix(props: { data: ReportData }) { return <MixReport {...props} dim="carrier" />; }
export function LineMix(props: { data: ReportData }) { return <MixReport {...props} dim="line" />; }
