import { ArrowLeftRight, Ban, Download, FilePlus2, RotateCcw, Sigma } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, PageHeader, Panel, Pills, SearchInput, Select, StatCard, useFeedback, type Column } from '@/components/ui';
import { StaffSelect } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { downloadCsv, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, Policy, PolicyTransaction, TransactionType } from '@/lib/types';
import { TX_TONES, TX_TYPES, cents, insuredName, signedMoney } from './shared';

type Row = PolicyTransaction & { policy?: Policy; account?: Account; insured: string };

export function TransactionsPage() {
  const { toast } = useFeedback();
  const { carriers } = useAppData();
  const txs = useTable('policy_transactions', { order: { column: 'effective_date', ascending: false } });
  const policies = useTable('policies');
  const accounts = useTable('accounts');
  const [type, setType] = useState<'all' | TransactionType>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [carrier, setCarrier] = useState('');
  const [producer, setProducer] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const rows = useMemo<Row[]>(() => {
    const pm = new Map(policies.data.map((p) => [p.id, p]));
    const am = new Map(accounts.data.map((a) => [a.id, a]));
    return txs.data.map((t) => {
      const policy = pm.get(t.policy_id);
      const account = am.get(t.account_id);
      return { ...t, policy, account, insured: insuredName(account) };
    });
  }, [txs.data, policies.data, accounts.data]);

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && r.effective_date < from) return false;
      if (to && r.effective_date > to) return false;
      if (carrier && r.policy?.carrier !== carrier) return false;
      if (producer && (r.policy?.producer || r.account?.producer) !== producer) return false;
      if (term) {
        const hay = `${r.policy?.policy_number ?? ''} ${r.insured} ${r.policy?.carrier ?? ''} ${r.policy?.line_of_business ?? ''} ${r.description ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, from, to, carrier, producer, q]);

  const filtered = useMemo(() => (type === 'all' ? base : base.filter((r) => r.type === type)), [base, type]);

  const kpis = useMemo(() => ({
    count: filtered.length,
    net: cents(filtered.reduce((s, r) => s + Number(r.premium_change || 0), 0)),
    nb: cents(filtered.filter((r) => r.type === 'New Business').reduce((s, r) => s + Number(r.premium_change || 0), 0)),
    nbCount: filtered.filter((r) => r.type === 'New Business').length,
    cancels: filtered.filter((r) => r.type === 'Cancellation').length,
    cancelAmt: cents(filtered.filter((r) => r.type === 'Cancellation').reduce((s, r) => s + Number(r.premium_change || 0), 0)),
  }), [filtered]);

  const carrierOptions = useMemo(() => {
    const s = new Set(carriers.map((c) => c.name));
    policies.data.forEach((p) => p.carrier && s.add(p.carrier));
    return [...s].sort();
  }, [carriers, policies.data]);

  const typeOptions = [
    { value: 'all' as const, label: 'All', count: base.length },
    ...TX_TYPES.map((t) => ({ value: t, label: t, count: base.filter((r) => r.type === t).length })),
  ];

  const filtersActive = !!(from || to || carrier || producer || q || type !== 'all');
  const clear = () => { setFrom(''); setTo(''); setCarrier(''); setProducer(null); setQ(''); setType('all'); };

  const exportCsv = () => {
    if (!filtered.length) { toast('No transactions to export', 'info'); return; }
    downloadCsv(`policy-transactions-${today()}.csv`, filtered.map((r) => ({
      'Effective Date': r.effective_date, Type: r.type, 'Policy #': r.policy?.policy_number ?? '', Insured: r.insured, Carrier: r.policy?.carrier ?? '',
      'Line of Business': r.policy?.line_of_business ?? '', Producer: r.policy?.producer || r.account?.producer || '', 'Premium Change': r.premium_change,
      Description: r.description ?? '', Entered: r.created_at,
    })));
    toast(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`);
  };

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Effective', sortValue: (r) => r.effective_date, render: (r) => <span className="whitespace-nowrap">{fmtDate(r.effective_date)}</span> },
    { key: 'type', header: 'Type', sortValue: (r) => r.type, render: (r) => <Badge tone={TX_TONES[r.type] ?? 'gray'}>{r.type}</Badge> },
    { key: 'policy', header: 'Policy #', sortValue: (r) => r.policy?.policy_number, render: (r) => r.policy ? <a href={href(`/policies/${r.policy.id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline whitespace-nowrap">{r.policy.policy_number}</a> : <span className="text-ink-400">Deleted policy</span> },
    { key: 'insured', header: 'Insured', sortValue: (r) => r.insured, render: (r) => r.account ? <a href={href(`/accounts/${r.account.id}`)} onClick={(e) => e.stopPropagation()} className="hover:text-brand-600 hover:underline whitespace-nowrap">{r.insured}</a> : r.insured },
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.policy?.carrier, render: (r) => <span className="whitespace-nowrap">{r.policy?.carrier ?? '—'}</span> },
    { key: 'lob', header: 'Line', sortValue: (r) => r.policy?.line_of_business, render: (r) => <span className="whitespace-nowrap">{r.policy?.line_of_business ?? '—'}</span> },
    { key: 'amt', header: 'Premium Δ', align: 'right', sortValue: (r) => Number(r.premium_change), render: (r) => <span className={Number(r.premium_change) < 0 ? 'tabular-nums text-red-600' : 'tabular-nums'}>{signedMoney(Number(r.premium_change), fmtMoney)}</span> },
    { key: 'desc', header: 'Description', render: (r) => <span className="block max-w-[320px] truncate text-ink-500" title={r.description ?? ''}>{r.description || '—'}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Policy Transactions"
        subtitle="Every new business, endorsement, renewal, cancellation, reinstatement, audit and rewrite across the agency"
        icon={<ArrowLeftRight size={20} />}
        actions={<Button icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard label="Transactions" value={kpis.count} hint={filtersActive ? 'Matching filters' : 'All time'} icon={<Sigma size={18} />} />
        <StatCard label="Net premium change" value={signedMoney(kpis.net, fmtMoney)} icon={<ArrowLeftRight size={18} />} tone={kpis.net < 0 ? 'red' : 'green'} />
        <StatCard label="New business premium" value={fmtMoney(kpis.nb)} hint={`${kpis.nbCount} new polic${kpis.nbCount === 1 ? 'y' : 'ies'}`} icon={<FilePlus2 size={18} />} tone="blue" onClick={() => setType('New Business')} />
        <StatCard label="Cancellations" value={kpis.cancels} hint={`${signedMoney(kpis.cancelAmt, fmtMoney)} returned`} icon={<Ban size={18} />} tone="red" onClick={() => setType('Cancellation')} />
      </div>
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100 space-y-3">
          <div className="overflow-x-auto"><Pills options={typeOptions} value={type} onChange={setType} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,2fr)_150px_150px_1fr_1fr_auto] gap-2 items-end">
            <SearchInput value={q} onChange={setQ} placeholder="Search policy #, insured, description…" />
            <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
            <Select value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="All carriers" options={carrierOptions} aria-label="Carrier" />
            <StaffSelect value={producer} onChange={setProducer} placeholder="All producers" />
            <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!filtersActive} onClick={clear}>Clear</Button>
          </div>
        </div>
        <div className="p-3">
          <ErrorBanner message={txs.error || policies.error || accounts.error} />
          <DataTable
            columns={columns}
            rows={filtered}
            loading={txs.loading}
            dense
            initialSort={{ key: 'date', dir: 'desc' }}
            onRowClick={(r) => r.policy && navigate(`/policies/${r.policy.id}`)}
            empty={<EmptyState icon={<ArrowLeftRight size={22} />} title={txs.data.length ? 'No transactions match' : 'No policy transactions yet'} message={txs.data.length ? 'Adjust or clear the filters.' : 'Transactions are recorded when policies are written, changed, renewed or cancelled.'} action={filtersActive ? <Button onClick={clear}>Clear filters</Button> : undefined} />}
          />
        </div>
      </Panel>
    </div>
  );
}
