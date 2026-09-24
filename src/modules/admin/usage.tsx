import { BarChart3, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, ErrorBanner, LoadingBlock, Panel, Pills, StatCard } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { downloadCsv, fmtNumber, parseDate, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { BarChart } from '@/modules/reports/charts';
import { AdminHeader } from './shared';

type Range = '7' | '30' | '90';
type Metrics = { created: number; completed: number; notes: number; quotes: number; bound: number; policies: number; messages: number; documents: number };
const METRICS: { key: keyof Metrics; label: string }[] = [
  { key: 'created', label: 'Activities created' }, { key: 'completed', label: 'Activities completed' }, { key: 'notes', label: 'Notes logged' },
  { key: 'quotes', label: 'Quotes created' }, { key: 'bound', label: 'Quotes bound' }, { key: 'policies', label: 'Policies written' },
  { key: 'messages', label: 'Messages sent' }, { key: 'documents', label: 'Documents added' },
];
const empty = (): Metrics => ({ created: 0, completed: 0, notes: 0, quotes: 0, bound: 0, policies: 0, messages: 0, documents: 0 });
const UNASSIGNED = 'Unassigned';

export function UsagePage() {
  const { staff } = useAppData();
  const [range, setRange] = useState<Range>('30');
  const activities = useTable('activities');
  const quotes = useTable('quotes');
  const policies = useTable('policies');
  const messages = useTable('messages', { eq: { direction: 'Outbound' } });
  const documents = useTable('documents');
  const accounts = useTable('accounts');
  const loading = [activities, quotes, policies, messages, documents, accounts].some((t) => t.loading);
  const error = [activities, quotes, policies, messages, documents, accounts].map((t) => t.error).find(Boolean) ?? null;

  const rows = useMemo(() => {
    const from = parseDate(today())!.getTime() - (Number(range) - 1) * 86_400_000;
    const inRange = (s: string | null | undefined) => (parseDate(s)?.getTime() ?? 0) >= from;
    const am = new Map(accounts.data.map((a) => [a.id, a]));
    const service = (accountId: string | null) => { const a = accountId ? am.get(accountId) : undefined; return a?.csr ?? a?.producer ?? null; };
    const seller = (accountId: string | null) => { const a = accountId ? am.get(accountId) : undefined; return a?.producer ?? null; };
    const m = new Map<string, Metrics>();
    staff.forEach((s) => m.set(s.name, empty()));
    const add = (who: string | null | undefined, k: keyof Metrics) => { const name = who || UNASSIGNED; const r = m.get(name) ?? empty(); r[k]++; m.set(name, r); };

    activities.data.forEach((a) => {
      if (a.type === 'Note') { if (inRange(a.created_at)) add(a.assigned_to, 'notes'); return; }
      if (inRange(a.created_at)) add(a.assigned_to, 'created');
      if (a.status === 'Completed' && inRange(a.completed_at)) add(a.assigned_to, 'completed');
    });
    const policyMap = new Map(policies.data.map((p) => [p.id, p]));
    quotes.data.forEach((q) => {
      if (inRange(q.created_at)) add(seller(q.account_id), 'quotes');
      const bound = q.policy_id ? policyMap.get(q.policy_id) : undefined;
      if (q.status === 'Bound' && inRange(bound?.created_at ?? (typeof q.input?.bound_at === 'string' ? q.input.bound_at : q.created_at))) add(bound?.producer ?? seller(q.account_id), 'bound');
    });
    policies.data.forEach((p) => { if (inRange(p.created_at)) add(p.producer ?? seller(p.account_id), 'policies'); });
    messages.data.forEach((x) => { if (inRange(x.created_at)) add(service(x.account_id), 'messages'); });
    documents.data.forEach((d) => { if (inRange(d.created_at)) add(service(d.account_id), 'documents'); });

    return [...m.entries()].map(([name, v]) => ({ name, ...v, total: METRICS.reduce((s, k) => s + v[k.key], 0) }))
      .filter((r) => r.name !== UNASSIGNED || r.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [range, staff, activities.data, quotes.data, policies.data, messages.data, documents.data, accounts.data]);

  const totals = useMemo(() => METRICS.reduce((acc, k) => ({ ...acc, [k.key]: rows.reduce((s, r) => s + r[k.key], 0) }), empty()), [rows]);

  const exportCsv = () => downloadCsv(`product-usage-${range}d-${today()}.csv`, [
    ...rows.map((r) => ({ staff: r.name, ...Object.fromEntries(METRICS.map((k) => [k.label, r[k.key]])), total: r.total })),
    { staff: 'Total', ...Object.fromEntries(METRICS.map((k) => [k.label, totals[k.key]])), total: rows.reduce((s, r) => s + r.total, 0) },
  ]);

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Product Usage Report" subtitle="How each staff member is using the system over the selected period" icon={<BarChart3 size={20} />}
        actions={<>
          <Pills value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
          <Button icon={<Download size={15} />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
        </>} />
      <ErrorBanner message={error} />
      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Activities created" value={fmtNumber(totals.created)} hint={`${fmtNumber(totals.completed)} completed`} />
            <StatCard label="Quotes created" value={fmtNumber(totals.quotes)} hint={`${fmtNumber(totals.bound)} bound`} tone="blue" />
            <StatCard label="Policies written" value={fmtNumber(totals.policies)} tone="green" />
            <StatCard label="Messages sent" value={fmtNumber(totals.messages)} hint={`${fmtNumber(totals.documents)} documents added`} tone="purple" />
          </div>
          <Panel title="Actions by staff member" className="mb-4">
            <BarChart ariaLabel="Actions by staff member" labels={rows.map((r) => r.name.split(' ')[0])} series={[
              { name: 'Activities & notes', data: rows.map((r) => r.created + r.notes) },
              { name: 'Quotes', data: rows.map((r) => r.quotes) },
              { name: 'Policies', data: rows.map((r) => r.policies) },
              { name: 'Messages & documents', data: rows.map((r) => r.messages + r.documents) },
            ]} />
          </Panel>
          <Panel bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-ink-100 bg-ink-50/60">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">Staff</th>
                  {METRICS.map((k) => <th key={k.key} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-400 whitespace-nowrap">{k.label}</th>)}
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-400">Total</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-b border-ink-50">
                      <td className="px-3 py-2 font-semibold text-ink-900 whitespace-nowrap">{r.name}</td>
                      {METRICS.map((k) => <td key={k.key} className="px-3 py-2 text-right tabular-nums">{r[k.key] || <span className="text-ink-300">0</span>}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total}</td>
                    </tr>
                  ))}
                  <tr className="bg-ink-50/60 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    {METRICS.map((k) => <td key={k.key} className="px-3 py-2 text-right tabular-nums">{totals[k.key]}</td>)}
                    <td className="px-3 py-2 text-right tabular-nums">{rows.reduce((s, r) => s + r.total, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="text-[11px] text-ink-400 mt-2">Activities and notes count for their assignee. Quotes and policies count for the policy (or account) producer. Messages and documents don’t record a sender, so they count for the account’s CSR (or producer).</p>
        </>
      )}
    </div>
  );
}
