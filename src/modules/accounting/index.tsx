import { AlertTriangle, CheckCircle2, DollarSign, Download, FileText, Landmark, Plus, Receipt, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, ErrorBanner, PageHeader, Panel, Pills, SearchInput, StatCard, Tabs, useFeedback, type Column } from '@/components/ui';
import { accountName, daysUntil, downloadCsv, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, setParam, useRoute } from '@/lib/router';
import type { Invoice } from '@/lib/types';
import { CommissionsTab } from './commissions';
import { InvoicesTable } from './invoices-table';
import { InvoiceFormModal, PaymentModal } from './modals';
import { AGING, PAYMENT_METHODS, agingOf, balanceOf, isOpen, isOverdue, type AgingKey } from './shared';

export { InvoiceFormModal, PaymentModal } from './modals';
export { InvoicesTable } from './invoices-table';

type Tab = 'receivables' | 'payments' | 'commissions';
type Filter = 'all' | 'Unpaid' | 'Partial' | 'Paid' | 'Void' | 'overdue';

function useLookups() {
  const accounts = useTable('accounts');
  const policies = useTable('policies');
  const accountsById = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const policiesById = useMemo(() => new Map(policies.data.map((p) => [p.id, p])), [policies.data]);
  return { accountsById, policiesById };
}

export function AccountingPage() {
  const { params } = useRoute();
  const raw = params.get('tab');
  const tab: Tab = raw === 'payments' || raw === 'commissions' ? raw : 'receivables';
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <PageHeader
        title="Accounting"
        subtitle="Agency-billed receivables, payments received and commission earned"
        icon={<Landmark size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>New Invoice</Button>}
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(t) => setParam('tab', t === 'receivables' ? null : t)}
        tabs={[{ value: 'receivables', label: 'Receivables' }, { value: 'payments', label: 'Payments' }, { value: 'commissions', label: 'Commissions' }]}
      />
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'commissions' && <CommissionsTab />}
      {creating && <InvoiceFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function ReceivablesTab() {
  const invoices = useTable('invoices', { order: { column: 'due_date', ascending: false } });
  const { accountsById, policiesById } = useLookups();
  const [filter, setFilter] = useState<Filter>('all');
  const [aging, setAging] = useState<AgingKey | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const all = invoices.data;
  const open = all.filter(isOpen);
  const agingTotals = AGING.map((a) => {
    const list = open.filter((i) => agingOf(i) === a.key);
    return { ...a, count: list.length, amount: list.reduce((s, i) => s + balanceOf(i), 0) };
  });

  const counts: Record<Filter, number> = {
    all: all.length, Unpaid: all.filter((i) => i.status === 'Unpaid').length, Partial: all.filter((i) => i.status === 'Partial').length,
    Paid: all.filter((i) => i.status === 'Paid').length, Void: all.filter((i) => i.status === 'Void').length, overdue: all.filter(isOverdue).length,
  };

  const term = q.trim().toLowerCase();
  const rows = all.filter((i) =>
    (filter === 'all' || (filter === 'overdue' ? isOverdue(i) : i.status === filter))
    && (!aging || (isOpen(i) && agingOf(i) === aging))
    && (!term || [i.invoice_number, i.description, accountName(accountsById.get(i.account_id)), i.policy_id ? policiesById.get(i.policy_id)?.policy_number : '']
      .some((s) => String(s ?? '').toLowerCase().includes(term))),
  );
  const outstanding = open.reduce((s, i) => s + balanceOf(i), 0);
  const tones = ['green', 'amber', 'amber', 'red', 'red'] as const;

  return (
    <div className="space-y-4">
      <ErrorBanner message={invoices.error} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total outstanding" value={fmtMoney(outstanding, true)} hint={`${open.length} open invoices`} icon={<Receipt size={18} />} onClick={() => { setAging(null); setFilter('all'); }} />
        {agingTotals.map((a, i) => (
          <StatCard
            key={a.key}
            label={a.key === 'current' ? 'Current' : `${a.label} past due`}
            value={fmtMoney(a.amount, true)}
            hint={<span className={aging === a.key ? 'text-brand-600 font-semibold' : ''}>{a.count} invoice{a.count === 1 ? '' : 's'}{aging === a.key ? ' · filtered' : ''}</span>}
            tone={tones[i]}
            onClick={() => { setAging(aging === a.key ? null : a.key); setFilter('all'); }}
          />
        ))}
      </div>
      <Panel
        title="Invoices"
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills value={filter} onChange={(f) => { setFilter(f); setAging(null); }} options={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'Unpaid', label: 'Unpaid', count: counts.Unpaid },
            { value: 'Partial', label: 'Partial', count: counts.Partial }, { value: 'Paid', label: 'Paid', count: counts.Paid },
            { value: 'Void', label: 'Void', count: counts.Void }, { value: 'overdue', label: 'Overdue', count: counts.overdue },
          ]} />
          {aging && (
            <button onClick={() => setAging(null)} className="inline-flex items-center gap-1 h-7 px-2 rounded bg-brand-50 text-brand-700 text-xs font-semibold">
              Aging: {AGING.find((a) => a.key === aging)!.label} <X size={12} />
            </button>
          )}
          <SearchInput className="ml-auto w-full sm:w-64" value={q} onChange={setQ} placeholder="Search invoice #, account, policy…" />
        </div>
        <InvoicesTable
          rows={rows} accountsById={accountsById} policiesById={policiesById} loading={invoices.loading}
          empty={<EmptyState icon={<FileText size={22} />} title={all.length ? 'No invoices match' : 'No invoices yet'} message={all.length ? 'Try a different filter or search.' : 'Agency-bill policies create invoices automatically, or add one manually.'} action={!all.length ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New Invoice</Button> : undefined} />}
        />
      </Panel>
      {creating && <InvoiceFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

type Period = 'all' | '30' | '90' | 'ytd';

function PaymentsTab() {
  const { toast } = useFeedback();
  const invoices = useTable('invoices', { order: { column: 'paid_date', ascending: false } });
  const { accountsById, policiesById } = useLookups();
  const [period, setPeriod] = useState<Period>('all');
  const [method, setMethod] = useState<string>('all');

  const inPeriod = (d: string | null) => {
    if (period === 'all') return true;
    if (!d) return false;
    if (period === 'ytd') return d >= `${new Date().getFullYear()}-01-01` && d <= today();
    const n = daysUntil(d);
    return n !== null && n <= 0 && n >= -Number(period);
  };
  const paid = invoices.data.filter((i) => Number(i.amount_paid) > 0 && inPeriod(i.paid_date));
  const rows = paid.filter((i) => method === 'all' || (i.payment_method ?? 'Other') === method);
  const methods = [...PAYMENT_METHODS, ...new Set(paid.map((i) => i.payment_method ?? 'Other').filter((m) => !(PAYMENT_METHODS as readonly string[]).includes(m)))];
  const byMethod = methods.map((m) => {
    const list = paid.filter((i) => (i.payment_method ?? 'Other') === m);
    return { method: m, count: list.length, amount: list.reduce((s, i) => s + Number(i.amount_paid), 0) };
  });
  const total = rows.reduce((s, i) => s + Number(i.amount_paid), 0);

  const columns: Column<Invoice>[] = [
    { key: 'date', header: 'Paid date', sortValue: (r) => r.paid_date, render: (r) => fmtDate(r.paid_date) },
    { key: 'num', header: 'Invoice #', sortValue: (r) => r.invoice_number, render: (r) => <span className="font-semibold text-ink-900">{r.invoice_number}</span> },
    { key: 'account', header: 'Account', sortValue: (r) => accountName(accountsById.get(r.account_id)), render: (r) => <a href={href(`/accounts/${r.account_id}`)} className="hover:underline">{accountName(accountsById.get(r.account_id))}</a> },
    { key: 'policy', header: 'Policy', render: (r) => { const p = r.policy_id ? policiesById.get(r.policy_id) : null; return p ? <a href={href(`/policies/${p.id}`)} className="hover:underline">{p.policy_number}</a> : <span className="text-ink-300">—</span>; } },
    { key: 'method', header: 'Method', sortValue: (r) => r.payment_method, render: (r) => r.payment_method ?? '—' },
    { key: 'status', header: 'Invoice status', sortValue: (r) => r.status, render: (r) => <span className={r.status === 'Paid' ? 'text-emerald-700' : 'text-amber-700'}>{r.status === 'Paid' ? 'Paid in full' : r.status === 'Void' ? 'Voided' : `Balance ${fmtMoney(balanceOf(r), true)}`}</span> },
    { key: 'amount', header: 'Amount received', align: 'right', sortValue: (r) => Number(r.amount_paid), render: (r) => <span className="tabular-nums font-semibold">{fmtMoney(r.amount_paid, true)}</span> },
  ];

  const exportCsv = () => {
    if (!rows.length) { toast('Nothing to export', 'info'); return; }
    downloadCsv(`payments-${today()}.csv`, rows.map((r) => ({
      paid_date: r.paid_date ?? '', invoice_number: r.invoice_number, account: accountName(accountsById.get(r.account_id)),
      policy: r.policy_id ? policiesById.get(r.policy_id)?.policy_number ?? '' : '', method: r.payment_method ?? '', amount_paid: Number(r.amount_paid).toFixed(2), invoice_status: r.status,
    })));
    toast(`Exported ${rows.length} payments`);
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={invoices.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Pills value={period} onChange={setPeriod} options={[{ value: 'all', label: 'All time' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'ytd', label: 'Year to date' }]} />
        <Button className="ml-auto" icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total received" value={fmtMoney(paid.reduce((s, i) => s + Number(i.amount_paid), 0), true)} hint={`${paid.length} payments`} icon={<DollarSign size={18} />} tone="green" onClick={() => setMethod('all')} />
        {byMethod.map((m) => (
          <StatCard key={m.method} label={m.method} value={fmtMoney(m.amount, true)}
            hint={<span className={method === m.method ? 'text-brand-600 font-semibold' : ''}>{m.count} payment{m.count === 1 ? '' : 's'}{method === m.method ? ' · filtered' : ''}</span>}
            onClick={() => setMethod(method === m.method ? 'all' : m.method)} />
        ))}
      </div>
      <Panel title={method === 'all' ? 'Payments received' : `Payments received · ${method}`} actions={<span className="text-[13px] text-ink-500 tabular-nums">Total {fmtMoney(total, true)}</span>} bodyClassName="p-0">
        <DataTable columns={columns} rows={rows} loading={invoices.loading} initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={<DollarSign size={22} />} title="No payments recorded" message="Payments recorded against invoices appear here." />} />
      </Panel>
    </div>
  );
}

/** Account → Billing tab. */
export function InvoiceList({ accountId }: { accountId: string }) {
  const invoices = useTable('invoices', { eq: { account_id: accountId }, order: { column: 'due_date', ascending: false } });
  const { accountsById, policiesById } = useLookups();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);

  const all = invoices.data;
  const open = all.filter(isOpen);
  const balance = open.reduce((s, i) => s + balanceOf(i), 0);
  const overdue = open.filter(isOverdue);
  const overdueAmt = overdue.reduce((s, i) => s + balanceOf(i), 0);
  const billed = all.filter((i) => i.status !== 'Void').reduce((s, i) => s + Number(i.amount), 0);
  const received = all.reduce((s, i) => s + Number(i.amount_paid), 0);
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  return (
    <div className="space-y-4">
      <ErrorBanner message={invoices.error} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Balance due" value={fmtMoney(balance, true)} hint={nextDue ? `Next due ${fmtDate(nextDue.due_date)}` : 'Nothing due'} icon={<Receipt size={18} />} tone={balance > 0 ? 'amber' : 'green'} />
        <StatCard label="Past due" value={fmtMoney(overdueAmt, true)} hint={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} icon={<AlertTriangle size={18} />} tone={overdueAmt > 0 ? 'red' : 'green'} />
        <StatCard label="Total billed" value={fmtMoney(billed, true)} hint={`${all.length} invoices`} icon={<FileText size={18} />} />
        <StatCard label="Payments received" value={fmtMoney(received, true)} icon={<CheckCircle2 size={18} />} tone="green" />
      </div>
      <Panel
        title="Invoices"
        bodyClassName="p-0"
        actions={<>
          <Button size="sm" icon={<DollarSign size={14} />} disabled={!open.length} title={open.length ? undefined : 'No open invoices'} onClick={() => setPaying(true)}>Record Payment</Button>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New Invoice</Button>
        </>}
      >
        <InvoicesTable
          rows={all} accountsById={accountsById} policiesById={policiesById} showAccount={false} loading={invoices.loading}
          empty={<EmptyState icon={<FileText size={22} />} title="No invoices for this account" message="Agency-bill policies create invoices automatically. You can also bill fees or premium manually." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New Invoice</Button>} />}
        />
      </Panel>
      {creating && <InvoiceFormModal accountId={accountId} onClose={() => setCreating(false)} />}
      {paying && <PaymentModal invoices={[...open].sort((a, b) => a.due_date.localeCompare(b.due_date))} onClose={() => setPaying(false)} />}
    </div>
  );
}
