import { Clock, DollarSign, Download, FileWarning, Plus, ShieldAlert, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, EmptyState, ErrorBanner, PageHeader, Panel, Pills, SearchInput, Select, StatCard, useFeedback } from '@/components/ui';
import { accountName, downloadCsv, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { Account, Claim, ClaimStatus, Policy } from '@/lib/types';
import { ClaimFormModal } from './ClaimFormModal';
import { ClaimsTable } from './ClaimsTable';
import { CLAIM_STATUSES, LOSS_TYPES, daysOpen, isOpenClaim } from './constants';

type StatusFilter = 'All' | ClaimStatus;

export function ClaimsPage() {
  const { toast } = useFeedback();
  const claims = useTable('claims', { order: { column: 'date_of_loss', ascending: false } });
  const accounts = useTable('accounts');
  const policies = useTable('policies');
  const [status, setStatus] = useState<StatusFilter>('All');
  const [lossType, setLossType] = useState('');
  const [search, setSearch] = useState('');
  const [reporting, setReporting] = useState(false);

  const lookup = useMemo(() => ({
    accounts: new Map<string, Account>(accounts.data.map((a) => [a.id, a])),
    policies: new Map<string, Policy>(policies.data.map((p) => [p.id, p])),
  }), [accounts.data, policies.data]);

  // Everything except the status filter (so pill counts reflect the other filters).
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return claims.data.filter((c) => {
      if (lossType && c.loss_type !== lossType) return false;
      if (q) {
        const hay = [c.claim_number, accountName(lookup.accounts.get(c.account_id)), c.policy_id ? lookup.policies.get(c.policy_id)?.policy_number : '', c.adjuster_name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [claims.data, lossType, search, lookup]);

  const rows = useMemo(() => (status === 'All' ? base : base.filter((c) => c.status === status)), [base, status]);

  const stats = useMemo(() => {
    const open = base.filter(isOpenClaim);
    const days = open.map((c) => daysOpen(c) ?? 0);
    return {
      open: open.length,
      reserved: open.reduce((s, c) => s + Number(c.amount_reserved ?? 0), 0),
      paid: base.reduce((s, c) => s + Number(c.amount_paid ?? 0), 0),
      avgDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : 0,
    };
  }, [base]);

  const pills = (['All', ...CLAIM_STATUSES] as StatusFilter[]).map((s) => ({ value: s, label: s, count: s === 'All' ? base.length : base.filter((c) => c.status === s).length }));
  const lossTypes = Array.from(new Set([...LOSS_TYPES, ...claims.data.map((c) => c.loss_type).filter(Boolean)]));
  const filtersActive = !!(lossType || search || status !== 'All');

  const exportCsv = () => {
    if (!rows.length) { toast('No claims to export', 'info'); return; }
    downloadCsv(`claims-${today()}.csv`, rows.map((c) => {
      const p = c.policy_id ? lookup.policies.get(c.policy_id) : undefined;
      return {
        'Claim #': c.claim_number ?? '',
        Insured: accountName(lookup.accounts.get(c.account_id)),
        'Policy #': p?.policy_number ?? '',
        Line: p?.line_of_business ?? '',
        Carrier: p?.carrier ?? '',
        'Date of Loss': c.date_of_loss,
        'Reported Date': c.reported_date ?? '',
        'Loss Type': c.loss_type,
        Status: c.status,
        Reserved: c.amount_reserved ?? '',
        Paid: c.amount_paid ?? '',
        Adjuster: c.adjuster_name ?? '',
        'Adjuster Phone': c.adjuster_phone ?? '',
        'Days Open': daysOpen(c) ?? '',
        Description: c.description ?? '',
      };
    }));
    toast(`Exported ${rows.length} claim${rows.length === 1 ? '' : 's'}`);
  };

  return (
    <div>
      <PageHeader
        title="Claims"
        subtitle="Track losses from first notice through settlement"
        icon={<ShieldAlert size={20} />}
        actions={<>
          <Button icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setReporting(true)}>Report Claim</Button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Open Claims" value={stats.open} icon={<FileWarning size={18} />} tone="amber" hint="Open + Under Review" onClick={() => setStatus('Open')} />
        <StatCard label="Total Reserved" value={fmtMoney(stats.reserved)} icon={<Wallet size={18} />} tone="blue" hint="On open claims" />
        <StatCard label="Total Paid" value={fmtMoney(stats.paid)} icon={<DollarSign size={18} />} tone="green" />
        <StatCard label="Avg Days Open" value={stats.avgDays} icon={<Clock size={18} />} tone="purple" hint="Since reported" />
      </div>

      <ErrorBanner message={claims.error} />

      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 p-3 border-b border-ink-100">
          <Pills options={pills} value={status} onChange={setStatus} />
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(200px,1fr)_200px_auto] gap-2 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search insured, claim #, policy # or adjuster…" />
            <Select value={lossType} onChange={(e) => setLossType(e.target.value)} placeholder="All loss types" options={lossTypes} aria-label="Loss type filter" />
            {filtersActive ? <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => { setStatus('All'); setLossType(''); setSearch(''); }}>Clear</Button> : <span />}
          </div>
        </div>
        <ClaimsTable
          rows={rows}
          lookup={lookup}
          loading={claims.loading && !claims.data.length}
          empty={<EmptyState icon={<ShieldAlert size={22} />} title={filtersActive ? 'No matching claims' : 'No claims yet'} message={filtersActive ? 'Try adjusting your filters.' : 'Report a first notice of loss to start tracking a claim.'} action={<Button icon={<Plus size={14} />} onClick={() => setReporting(true)}>Report Claim</Button>} />}
        />
      </Panel>

      {reporting && <ClaimFormModal onClose={() => setReporting(false)} onSaved={(c: Claim) => navigate(`/claims/${c.id}`)} />}
    </div>
  );
}
