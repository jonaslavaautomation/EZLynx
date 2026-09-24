import { Calculator, CheckCircle2, Eye, FilePlus2, Pencil, Percent, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button, DataTable, EmptyState, ErrorBanner, Menu, PageHeader, Panel, Pills, SearchInput, Select, StatCard, StatusBadge, useFeedback, type Column,
} from '@/components/ui';
import { db } from '@/lib/db';
import { accountName, fmtDate, fmtMoney, fmtRelative, parseDate } from '@/lib/format';
import { useDebounced, useRow, useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import { COMMERCIAL_LINES, type Account, type LineOfBusiness, type Quote, type QuoteStatus } from '@/lib/types';
import { QUOTE_LINES, readInput } from './inputs';
import { bestRate } from './rating';

type StatusFilter = 'All' | QuoteStatus;

/** Premium shown for a quote: the bound premium, else the lowest quoted. */
const headline = (q: Quote) => (q.status === 'Bound' ? q.selected_premium : bestRate(q.results)?.premium ?? null);
const headlineCarrier = (q: Quote) => (q.status === 'Bound' ? q.selected_carrier : bestRate(q.results)?.carrier ?? null);
const quotedCount = (q: Quote) => (q.results ?? []).filter((r) => r.status === 'Quoted').length;

function useQuoteActions() {
  const { toast, confirm } = useFeedback();
  return {
    remove: async (q: Quote, label: string) => {
      const ok = await confirm({ title: 'Delete this quote?', message: `The ${q.line_of_business} quote for ${label} will be permanently deleted.`, confirmLabel: 'Delete quote', danger: true });
      if (!ok) return;
      try {
        await db.remove('quotes', q.id);
        toast('Quote deleted');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
  };
}

function rowMenu(q: Quote, label: string, remove: (q: Quote, label: string) => void) {
  return (
    <Menu items={[
      { label: 'Open', icon: <Eye size={14} />, onClick: () => navigate(`/quotes/${q.id}`) },
      { label: 'Edit & re-rate', icon: <Pencil size={14} />, disabled: q.status === 'Bound', onClick: () => navigate(`/quotes/new?quote=${q.id}`) },
      'divider',
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => remove(q, label) },
    ]} />
  );
}

export function QuotesPage() {
  const quotes = useTable('quotes', { order: { column: 'created_at', ascending: false } });
  const accounts = useTable('accounts', {});
  const { params } = useRoute();
  // Filters live in the URL so the navigation menu can link straight to a view.
  const rawStatus = params.get('status') as StatusFilter | null;
  const status: StatusFilter = rawStatus && ['Draft', 'Rated', 'Bound', 'Lost'].includes(rawStatus) ? rawStatus : 'All';
  const setStatus = (v: StatusFilter) => setParam('status', v === 'All' ? null : v);
  const submissions = params.get('group') === 'commercial';
  const [line, setLine] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 150).trim().toLowerCase();
  const { remove } = useQuoteActions();

  const byId = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const nameOf = (id: string) => { const a = byId.get(id); return a ? accountName(a) : '—'; };

  const stats = useMemo(() => {
    const all = quotes.data;
    const now = new Date();
    const boundAt = (q: Quote) => parseDate(readInput(q).bound_at ?? q.created_at);
    const bound = all.filter((q) => q.status === 'Bound');
    const boundMonth = bound.filter((q) => { const d = boundAt(q); return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const decided = all.filter((q) => q.status === 'Bound' || q.status === 'Lost' || q.status === 'Rated');
    const prem = all.map(headline).filter((p): p is number => typeof p === 'number');
    return {
      open: all.filter((q) => q.status === 'Draft' || q.status === 'Rated').length,
      drafts: all.filter((q) => q.status === 'Draft').length,
      boundMonth: boundMonth.length,
      boundMonthPremium: boundMonth.reduce((s, q) => s + (q.selected_premium ?? 0), 0),
      closeRatio: decided.length ? Math.round((bound.length / decided.length) * 100) : null,
      bound: bound.length, decided: decided.length,
      avg: prem.length ? prem.reduce((s, p) => s + p, 0) / prem.length : null,
    };
  }, [quotes.data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: quotes.data.length };
    quotes.data.forEach((q) => { c[q.status] = (c[q.status] ?? 0) + 1; });
    return c;
  }, [quotes.data]);

  const rows = useMemo(() => quotes.data.filter((q) => {
    if (submissions && !COMMERCIAL_LINES.includes(q.line_of_business as LineOfBusiness)) return false;
    if (status !== 'All' && q.status !== status) return false;
    if (line && q.line_of_business !== line) return false;
    if (term) {
      const a = byId.get(q.account_id);
      const hay = [a ? accountName(a) : '', a?.email, q.line_of_business, headlineCarrier(q), ...(q.results ?? []).map((r) => r.carrier)].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  }), [quotes.data, status, line, term, byId, submissions]);

  const columns: Column<Quote>[] = [
    {
      key: 'account', header: 'Account', sortValue: (q) => nameOf(q.account_id),
      render: (q) => <a href={href(`/accounts/${q.account_id}?tab=quotes`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline">{nameOf(q.account_id)}</a>,
    },
    { key: 'line', header: 'Line', sortValue: (q) => q.line_of_business, render: (q) => q.line_of_business },
    { key: 'effective', header: 'Effective', sortValue: (q) => q.effective_date, render: (q) => fmtDate(q.effective_date), className: 'hidden md:table-cell' },
    { key: 'carriers', header: 'Quoted', sortValue: quotedCount, render: (q) => (q.results?.length ? `${quotedCount(q)} of ${q.results.length}` : '—'), className: 'hidden sm:table-cell' },
    {
      key: 'premium', header: 'Premium', align: 'right', sortValue: headline,
      render: (q) => {
        const p = headline(q);
        return p === null ? <span className="text-ink-300">—</span> : (
          <div><div className="font-semibold tabular-nums">{fmtMoney(p)}</div><div className="text-[11px] text-ink-400 truncate max-w-[160px] ml-auto">{headlineCarrier(q)}</div></div>
        );
      },
    },
    { key: 'status', header: 'Status', sortValue: (q) => q.status, render: (q) => <StatusBadge status={q.status} /> },
    { key: 'created', header: 'Created', sortValue: (q) => q.created_at, render: (q) => <span className="text-ink-500">{fmtRelative(q.created_at)}</span>, className: 'hidden lg:table-cell' },
    { key: 'menu', header: '', align: 'right', render: (q) => rowMenu(q, nameOf(q.account_id), remove) },
  ];

  return (
    <div>
      <PageHeader
        title={submissions ? 'Submission Center' : 'Quotes'}
        subtitle={submissions ? 'Commercial lines submissions — track each risk from draft to bound.' : 'Comparative rater — enter the risk once, rate every appointed carrier, compare and bind.'}
        icon={<Calculator size={20} />}
        actions={<Button variant="primary" icon={<FilePlus2 size={15} />} onClick={() => navigate(submissions ? `/quotes/new?line=${encodeURIComponent('General Liability')}` : '/quotes/new')}>{submissions ? 'New Submission' : 'New Quote'}</Button>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Open quotes" value={stats.open} hint={`${stats.drafts} draft${stats.drafts === 1 ? '' : 's'}`} icon={<Calculator size={18} />} onClick={() => setStatus('Rated')} />
        <StatCard label="Bound this month" value={stats.boundMonth} hint={fmtMoney(stats.boundMonthPremium) + ' premium'} icon={<CheckCircle2 size={18} />} tone="green" onClick={() => setStatus('Bound')} />
        <StatCard label="Close ratio" value={stats.closeRatio === null ? '—' : `${stats.closeRatio}%`} hint={`${stats.bound} bound of ${stats.decided} rated`} icon={<Percent size={18} />} tone="purple" />
        <StatCard label="Avg premium" value={fmtMoney(stats.avg)} hint="Bound or lowest quoted" icon={<TrendingUp size={18} />} tone="blue" />
      </div>
      <Panel bodyClassName="p-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-ink-100">
          <Pills<StatusFilter> value={status} onChange={setStatus} options={(['All', 'Draft', 'Rated', 'Bound', 'Lost'] as StatusFilter[]).map((s) => ({ value: s, label: s, count: counts[s] ?? 0 }))} />
          <div className="flex flex-col sm:flex-row gap-2 lg:ml-auto">
            <Select className="sm:w-48" value={line} onChange={(e) => setLine(e.target.value)} placeholder="All lines" options={QUOTE_LINES} />
            <SearchInput className="sm:w-64" value={search} onChange={setSearch} placeholder="Search account or carrier…" />
          </div>
        </div>
        <div className="p-1">
          <ErrorBanner message={quotes.error} />
          <DataTable
            columns={columns}
            rows={rows}
            loading={quotes.loading && !quotes.data.length}
            onRowClick={(q) => navigate(`/quotes/${q.id}`)}
            initialSort={{ key: 'created', dir: 'desc' }}
            empty={quotes.data.length ? (
              <EmptyState title="No quotes match your filters" action={<Button onClick={() => { setStatus('All'); setLine(''); setSearch(''); }}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<Calculator size={22} />} title="No quotes yet" message="Start a comparative quote to rate multiple carriers at once." action={<Button variant="primary" icon={<FilePlus2 size={15} />} onClick={() => navigate('/quotes/new')}>New Quote</Button>} />
            )}
          />
        </div>
      </Panel>
    </div>
  );
}

export function QuoteList({ accountId }: { accountId: string }) {
  const quotes = useTable('quotes', { eq: { account_id: accountId }, order: { column: 'created_at', ascending: false } });
  const accountRow = useRow('accounts', accountId);
  const account: Account | null = accountRow.data;
  const { remove } = useQuoteActions();
  const label = account ? accountName(account) : 'this account';
  const newQuote = () => navigate(`/quotes/new?account=${accountId}${account?.account_type === 'Commercial' ? `&line=${encodeURIComponent('General Liability')}` : ''}`);

  const columns: Column<Quote>[] = [
    { key: 'line', header: 'Line', sortValue: (q) => q.line_of_business, render: (q) => <span className="font-semibold text-ink-900">{q.line_of_business}</span> },
    { key: 'effective', header: 'Effective', sortValue: (q) => q.effective_date, render: (q) => fmtDate(q.effective_date), className: 'hidden sm:table-cell' },
    { key: 'carriers', header: 'Quoted', sortValue: quotedCount, render: (q) => (q.results?.length ? `${quotedCount(q)} of ${q.results.length}` : '—'), className: 'hidden md:table-cell' },
    {
      key: 'premium', header: 'Premium', align: 'right', sortValue: headline,
      render: (q) => { const p = headline(q); return p === null ? <span className="text-ink-300">—</span> : <div><div className="font-semibold tabular-nums">{fmtMoney(p)}</div><div className="text-[11px] text-ink-400">{headlineCarrier(q)}</div></div>; },
    },
    { key: 'status', header: 'Status', sortValue: (q) => q.status, render: (q) => <StatusBadge status={q.status} /> },
    { key: 'created', header: 'Created', sortValue: (q) => q.created_at, render: (q) => <span className="text-ink-500">{fmtRelative(q.created_at)}</span>, className: 'hidden md:table-cell' },
    { key: 'menu', header: '', align: 'right', render: (q) => rowMenu(q, label, remove) },
  ];

  return (
    <Panel title="Quotes" actions={<Button size="sm" variant="primary" icon={<FilePlus2 size={13} />} onClick={newQuote}>New Quote</Button>} bodyClassName="p-0">
      <ErrorBanner message={quotes.error} />
      <DataTable
        dense
        columns={columns}
        rows={quotes.data}
        loading={quotes.loading && !quotes.data.length}
        onRowClick={(q) => navigate(`/quotes/${q.id}`)}
        initialSort={{ key: 'created', dir: 'desc' }}
        empty={<EmptyState icon={<Calculator size={22} />} title="No quotes for this account" message="Rate multiple carriers at once with the comparative rater." action={<Button variant="primary" icon={<FilePlus2 size={15} />} onClick={newQuote}>New Quote</Button>} />}
      />
    </Panel>
  );
}
