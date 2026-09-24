import { CalendarClock, Download, DollarSign, FileCheck2, Plus, Percent, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Panel, PageHeader, Pills, SearchInput, Select, StatCard, StatusBadge, useFeedback, type Column } from '@/components/ui';
import { StaffSelect } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { commissionOf } from '@/lib/domain';
import { accountName, daysUntil, downloadCsv, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import { LINES_OF_BUSINESS, type Account, type Policy } from '@/lib/types';
import { PolicyFormModal } from './PolicyFormModal';
import { expirationTone, inRenewalWindow, relativeDays } from './shared';

type View = 'all' | 'active' | 'pending' | 'renewals' | 'cancelled';
const VIEWS: View[] = ['all', 'active', 'pending', 'renewals', 'cancelled'];

export function ExpirationCell({ policy, windowDays }: { policy: Policy; windowDays: number }) {
  const d = daysUntil(policy.expiration_date);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span>{fmtDate(policy.expiration_date)}</span>
      {d !== null && inRenewalWindow(policy, windowDays) && <Badge tone={expirationTone(d)}>{relativeDays(d)}</Badge>}
    </div>
  );
}

export function PoliciesPage() {
  const route = useRoute();
  const { settings, carriers } = useAppData();
  const { toast } = useFeedback();
  const windowDays = settings?.renewal_reminder_days ?? 60;
  const rawView = route.params.get('view') as View | null;
  const view: View = rawView && VIEWS.includes(rawView) ? rawView : 'all';

  const policies = useTable('policies', { order: { column: 'expiration_date' } });
  const accounts = useTable('accounts');
  const [q, setQ] = useState('');
  const [line, setLine] = useState('');
  const [carrier, setCarrier] = useState('');
  const [producer, setProducer] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const accountMap = useMemo(() => new Map<string, Account>(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const nameOf = (p: Policy) => accountName(accountMap.get(p.account_id));

  const counts = useMemo(() => {
    const all = policies.data;
    return {
      all: all.length,
      active: all.filter((p) => p.status === 'Active').length,
      pending: all.filter((p) => p.status === 'Pending').length,
      renewals: all.filter((p) => inRenewalWindow(p, windowDays)).length,
      cancelled: all.filter((p) => ['Cancelled', 'Expired', 'Non-Renewed'].includes(p.status)).length,
    };
  }, [policies.data, windowDays]);

  const stats = useMemo(() => {
    const active = policies.data.filter((p) => p.status === 'Active');
    return {
      premium: active.reduce((s, p) => s + Number(p.premium || 0), 0),
      commission: active.reduce((s, p) => s + commissionOf(p), 0),
    };
  }, [policies.data]);

  const carrierOptions = useMemo(() => {
    const names = new Set<string>(carriers.map((c) => c.name));
    policies.data.forEach((p) => p.carrier && names.add(p.carrier));
    return [...names].sort();
  }, [carriers, policies.data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return policies.data.filter((p) => {
      if (view === 'active' && p.status !== 'Active') return false;
      if (view === 'pending' && p.status !== 'Pending') return false;
      if (view === 'renewals' && !inRenewalWindow(p, windowDays)) return false;
      if (view === 'cancelled' && !['Cancelled', 'Expired', 'Non-Renewed'].includes(p.status)) return false;
      if (line && p.line_of_business !== line) return false;
      if (carrier && p.carrier !== carrier) return false;
      if (producer && p.producer !== producer) return false;
      if (term) {
        const hay = `${p.policy_number} ${p.carrier} ${accountName(accountMap.get(p.account_id))} ${p.line_of_business}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [policies.data, view, windowDays, line, carrier, producer, q, accountMap]);

  const filtersActive = !!(q || line || carrier || producer);
  const clearFilters = () => { setQ(''); setLine(''); setCarrier(''); setProducer(null); };

  const exportCsv = () => {
    if (!rows.length) { toast('No policies to export', 'info'); return; }
    downloadCsv(`policies-${view}-${today()}.csv`, rows.map((p) => ({
      'Policy #': p.policy_number, Insured: nameOf(p), 'Line of Business': p.line_of_business, Carrier: p.carrier, Status: p.status,
      Effective: p.effective_date, Expiration: p.expiration_date, 'Term (mo)': p.term_months, Premium: p.premium,
      'Commission %': p.commission_rate, 'Est. Commission': commissionOf(p).toFixed(2), Billing: p.billing_type,
      'Payment Plan': p.payment_plan ?? '', Producer: p.producer ?? '', Source: p.source,
    })));
    toast(`Exported ${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}`);
  };

  const columns: Column<Policy>[] = [
    { key: 'number', header: 'Policy #', sortValue: (p) => p.policy_number, render: (p) => <a href={href(`/policies/${p.id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline whitespace-nowrap">{p.policy_number}</a> },
    { key: 'insured', header: 'Insured', sortValue: (p) => nameOf(p), render: (p) => <a href={href(`/accounts/${p.account_id}`)} onClick={(e) => e.stopPropagation()} className="text-ink-900 hover:text-brand-600 hover:underline whitespace-nowrap">{nameOf(p)}</a> },
    { key: 'lob', header: 'Line', sortValue: (p) => p.line_of_business, render: (p) => <span className="whitespace-nowrap">{p.line_of_business}</span> },
    { key: 'carrier', header: 'Carrier', sortValue: (p) => p.carrier, render: (p) => <span className="whitespace-nowrap">{p.carrier}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'eff', header: 'Effective', sortValue: (p) => p.effective_date, render: (p) => <span className="whitespace-nowrap">{fmtDate(p.effective_date)}</span> },
    { key: 'exp', header: 'Expiration', sortValue: (p) => p.expiration_date, render: (p) => <ExpirationCell policy={p} windowDays={windowDays} /> },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (p) => Number(p.premium), render: (p) => <span className="tabular-nums">{fmtMoney(p.premium)}</span> },
    { key: 'source', header: 'Source', sortValue: (p) => p.source, render: (p) => <Badge tone={p.source === 'Download' ? 'blue' : p.source === 'Rater' ? 'purple' : 'gray'}>{p.source}</Badge> },
  ];

  const viewOptions = [
    { value: 'all' as View, label: 'All', count: counts.all },
    { value: 'active' as View, label: 'Active', count: counts.active },
    { value: 'pending' as View, label: 'Pending', count: counts.pending },
    { value: 'renewals' as View, label: 'Renewals', count: counts.renewals },
    { value: 'cancelled' as View, label: 'Cancelled / Expired', count: counts.cancelled },
  ];

  return (
    <div>
      <PageHeader
        title="Policies"
        subtitle="Book of business across all accounts"
        icon={<FileCheck2 size={20} />}
        actions={<>
          <Button icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>New Policy</Button>
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard label="Active policies" value={counts.active} icon={<FileCheck2 size={18} />} onClick={() => setParam('view', 'active')} />
        <StatCard label="Written premium" value={fmtMoney(stats.premium)} hint="Active policies" icon={<DollarSign size={18} />} tone="green" />
        <StatCard label="Est. commission" value={fmtMoney(stats.commission)} hint="Active policies" icon={<Percent size={18} />} tone="purple" />
        <StatCard label="Renewals due" value={counts.renewals} hint={`Next ${windowDays} days + last 30 expired`} icon={<CalendarClock size={18} />} tone="amber" onClick={() => setParam('view', 'renewals')} />
      </div>

      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100 space-y-3">
          <div className="overflow-x-auto"><Pills options={viewOptions} value={view} onChange={(v) => setParam('view', v === 'all' ? null : v)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto] gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search policy #, carrier, insured…" />
            <Select value={line} onChange={(e) => setLine(e.target.value)} placeholder="All lines" options={LINES_OF_BUSINESS} aria-label="Line of business" />
            <Select value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="All carriers" options={carrierOptions} aria-label="Carrier" />
            <StaffSelect value={producer} onChange={setProducer} placeholder="All producers" />
            <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!filtersActive} onClick={clearFilters}>Clear</Button>
          </div>
          {view === 'renewals' && (
            <div className="text-xs text-ink-500">Renewals queue: active policies expiring within {windowDays} days and policies that expired in the last 30 days without being renewed, soonest first.</div>
          )}
        </div>
        <div className="p-3">
          <ErrorBanner message={policies.error || accounts.error} />
          <DataTable
            key={view}
            columns={columns}
            rows={rows}
            loading={policies.loading}
            onRowClick={(p) => navigate(`/policies/${p.id}`)}
            initialSort={view === 'renewals' ? { key: 'exp', dir: 'asc' } : { key: 'eff', dir: 'desc' }}
            empty={
              <EmptyState
                icon={<FileCheck2 size={22} />}
                title={policies.data.length ? 'No policies match' : 'No policies yet'}
                message={policies.data.length ? 'Try a different view or clear the filters.' : 'Add your first policy to start building the book of business.'}
                action={policies.data.length ? (filtersActive ? <Button onClick={clearFilters}>Clear filters</Button> : undefined) : <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>New Policy</Button>}
              />
            }
          />
          {!policies.loading && rows.length > 0 && (
            <div className="text-xs text-ink-400 px-3 pt-2">{rows.length} polic{rows.length === 1 ? 'y' : 'ies'} · {fmtMoney(rows.reduce((s, p) => s + Number(p.premium || 0), 0))} premium</div>
          )}
        </div>
      </Panel>

      {adding && <PolicyFormModal accountId={null} onClose={() => setAdding(false)} onSaved={(p) => navigate(`/policies/${p.id}`)} />}
    </div>
  );
}
