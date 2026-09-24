import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, Field, Input, Panel, Pills, Select, StatCard, StatusBadge, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { commissionOf } from '@/lib/domain';
import { accountName, addDays, downloadCsv, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Policy, PolicyStatus } from '@/lib/types';
import { HBarChart } from '@/modules/reports/charts';

type Preset = '12m' | 'ytd' | 'all' | 'custom';

export function CommissionsTab() {
  const { toast } = useFeedback();
  const { carriers, staff } = useAppData();
  const policies = useTable('policies', { order: { column: 'effective_date', ascending: false } });
  const accounts = useTable('accounts');
  const accountsById = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);

  const [preset, setPreset] = useState<Preset>('12m');
  const [from, setFrom] = useState(addDays(today(), -365));
  const [to, setTo] = useState(today());
  const [carrier, setCarrier] = useState('');
  const [producer, setProducer] = useState('');
  const [status, setStatus] = useState<'' | PolicyStatus | 'inforce'>('');

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === '12m') { setFrom(addDays(today(), -365)); setTo(today()); }
    if (p === 'ytd') { setFrom(`${new Date().getFullYear()}-01-01`); setTo(today()); }
    if (p === 'all') { setFrom(''); setTo(''); }
  };

  const rows = useMemo(() => policies.data.filter((p) =>
    (!from || p.effective_date >= from) && (!to || p.effective_date <= to)
    && (!carrier || p.carrier === carrier) && (!producer || (producer === '__none' ? !p.producer : p.producer === producer))
    && (!status || (status === 'inforce' ? p.status === 'Active' || p.status === 'Pending' : p.status === status)),
  ), [policies.data, from, to, carrier, producer, status]);

  const totalPremium = rows.reduce((s, p) => s + Number(p.premium), 0);
  const totalComm = rows.reduce((s, p) => s + commissionOf(p), 0);
  const group = (key: (p: Policy) => string) => {
    const m = new Map<string, { premium: number; commission: number; count: number }>();
    rows.forEach((p) => {
      const k = key(p);
      const g = m.get(k) ?? { premium: 0, commission: 0, count: 0 };
      g.premium += Number(p.premium); g.commission += commissionOf(p); g.count++;
      m.set(k, g);
    });
    return [...m.entries()].map(([label, g]) => ({ label, ...g })).sort((a, b) => b.commission - a.commission);
  };
  const byCarrier = group((p) => p.carrier || 'Unknown');
  const byProducer = group((p) => p.producer || 'Unassigned');

  const carrierOptions = [...new Set([...carriers.map((c) => c.name), ...policies.data.map((p) => p.carrier)])].filter(Boolean).sort();
  const producerOptions = [...new Set([...staff.map((s) => s.name), ...policies.data.map((p) => p.producer ?? '')])].filter(Boolean).sort();

  const exportCsv = () => {
    if (!rows.length) { toast('Nothing to export for these filters', 'info'); return; }
    downloadCsv(`commissions-${today()}.csv`, rows.map((p) => ({
      policy_number: p.policy_number, account: accountName(accountsById.get(p.account_id)), carrier: p.carrier, line_of_business: p.line_of_business,
      producer: p.producer ?? '', status: p.status, effective_date: p.effective_date, premium: Number(p.premium).toFixed(2),
      commission_rate: p.commission_rate, commission: commissionOf(p).toFixed(2),
    })));
    toast(`Exported ${rows.length} policies`);
  };

  const columns: Column<Policy>[] = [
    { key: 'num', header: 'Policy #', sortValue: (p) => p.policy_number, render: (p) => <a href={href(`/policies/${p.id}`)} className="font-semibold hover:underline">{p.policy_number}</a> },
    { key: 'acct', header: 'Account', sortValue: (p) => accountName(accountsById.get(p.account_id)), render: (p) => <a href={href(`/accounts/${p.account_id}`)} className="hover:underline">{accountName(accountsById.get(p.account_id))}</a> },
    { key: 'carrier', header: 'Carrier', sortValue: (p) => p.carrier, render: (p) => p.carrier },
    { key: 'lob', header: 'Line', sortValue: (p) => p.line_of_business, render: (p) => p.line_of_business },
    { key: 'producer', header: 'Producer', sortValue: (p) => p.producer ?? '', render: (p) => p.producer ?? <span className="text-ink-300">—</span> },
    { key: 'eff', header: 'Effective', sortValue: (p) => p.effective_date, render: (p) => fmtDate(p.effective_date) },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (p) => Number(p.premium), render: (p) => <span className="tabular-nums">{fmtMoney(p.premium)}</span> },
    { key: 'rate', header: 'Rate', align: 'right', sortValue: (p) => Number(p.commission_rate), render: (p) => <span className="tabular-nums">{Number(p.commission_rate)}%</span> },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (p) => commissionOf(p), render: (p) => <span className="tabular-nums font-semibold">{fmtMoney(commissionOf(p), true)}</span> },
  ];

  const summary = (title: string, data: typeof byCarrier) => (
    <Panel title={title} bodyClassName="p-3">
      <HBarChart ariaLabel={`${title}: commission`} format={(n) => fmtMoney(n)} max={8} data={data.map((g) => ({ label: g.label, value: Math.round(g.commission), hint: `${g.count} policies · ${fmtMoney(g.premium)} premium` }))} />
      {data.length > 0 && (
        <table className="w-full text-xs mt-3 border-t border-ink-100">
          <thead><tr className="text-[11px] uppercase tracking-wide text-ink-400"><th className="text-left py-1.5 font-semibold">Name</th><th className="text-right font-semibold">Policies</th><th className="text-right font-semibold">Premium</th><th className="text-right font-semibold">Commission</th></tr></thead>
          <tbody>{data.map((g) => (
            <tr key={g.label} className="border-t border-ink-50"><td className="py-1.5 truncate max-w-[140px]">{g.label}</td><td className="text-right tabular-nums">{g.count}</td><td className="text-right tabular-nums">{fmtMoney(g.premium)}</td><td className="text-right tabular-nums font-semibold">{fmtMoney(g.commission)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Panel>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#e3e3e3] rounded shadow-card p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Pills value={preset} onChange={applyPreset} options={[{ value: '12m', label: 'Last 12 months' }, { value: 'ytd', label: 'Year to date' }, { value: 'all', label: 'All dates' }, { value: 'custom', label: 'Custom' }]} />
          <Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Effective from"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} /></Field>
          <Field label="Effective to"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} /></Field>
          <Field label="Carrier"><Select value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="All carriers" options={carrierOptions} /></Field>
          <Field label="Producer"><Select value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="All producers" options={[...producerOptions, { value: '__none', label: 'Unassigned' }]} /></Field>
          <Field label="Policy status"><Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} placeholder="All statuses" options={[{ value: 'inforce', label: 'In force (Active + Pending)' }, 'Active', 'Pending', 'Cancelled', 'Expired', 'Non-Renewed']} /></Field>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Policies" value={rows.length} />
        <StatCard label="Written premium" value={fmtMoney(totalPremium)} />
        <StatCard label="Commission" value={fmtMoney(totalComm)} tone="green" />
        <StatCard label="Avg. commission rate" value={totalPremium ? `${((totalComm / totalPremium) * 100).toFixed(1)}%` : '—'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summary('By carrier', byCarrier)}
        {summary('By producer', byProducer)}
      </div>
      <Panel title="Policy commissions" bodyClassName="p-0">
        <DataTable columns={columns} rows={rows} loading={policies.loading} initialSort={{ key: 'eff', dir: 'desc' }}
          empty={<EmptyState title="No policies match" message="Adjust the date range or filters to see commissions." />} />
      </Panel>
    </div>
  );
}
