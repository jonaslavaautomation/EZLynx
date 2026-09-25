import { Ban, CalendarClock, ChevronDown, ClipboardCheck, FileCheck2, FilePen, FileX2, Pencil, RefreshCw, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Badge, Button, DataTable, DescriptionList, EmptyState, ErrorBanner, LoadingBlock, Menu, PageHeader, Panel, StatCard, StatusBadge, Tabs, useFeedback, type Column } from '@/components/ui';
import { ActivityList } from '@/modules/activities';
import { DocumentList } from '@/modules/documents';
import { db } from '@/lib/db';
import { commissionOf } from '@/lib/domain';
import { accountName, daysUntil, fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import type { Claim, Policy, PolicyTransaction, TransactionType } from '@/lib/types';
import { CoverageEditor, CoverageTable } from './coverages';
import { PolicyFormModal } from './PolicyFormModal';
import { canDo, expirationTone, fromDrafts, relativeDays, signedMoney, toDrafts, type CoverageDraft, type PolicyAction } from './shared';
import { TransactionModal } from './transactions';

type Tab = 'overview' | 'coverages' | 'history' | 'activities' | 'documents' | 'claims';
const TABS: Tab[] = ['overview', 'coverages', 'history', 'activities', 'documents', 'claims'];

const TX_TONES: Record<TransactionType, 'green' | 'blue' | 'teal' | 'red' | 'purple' | 'amber'> = {
  'New Business': 'green', Endorsement: 'blue', Renewal: 'teal', Cancellation: 'red', Reinstatement: 'purple', Audit: 'amber', Rewrite: 'purple',
};

export function PolicyDetail({ id }: { id: string }) {
  const route = useRoute();
  const { toast, confirm } = useFeedback();
  const policy = useRow('policies', id);
  const p = policy.data;
  const account = useRow('accounts', p?.account_id ?? null);
  const txns = useTable('policy_transactions', { eq: { policy_id: id }, order: { column: 'created_at', ascending: false } });
  const claims = useTable('claims', { eq: { policy_id: id }, order: { column: 'date_of_loss', ascending: false } });
  const rawTab = route.params.get('tab') as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : 'overview';
  const [editing, setEditing] = useState(false);
  const [tx, setTx] = useState<PolicyAction | null>(null);

  if (policy.loading && !p) return <LoadingBlock label="Loading policy…" />;
  if (!p) {
    return (
      <Panel>
        {policy.error ? <ErrorBanner message={policy.error} /> : (
          <EmptyState icon={<FileX2 size={22} />} title="Policy not found" message="It may have been deleted." action={<Button onClick={() => navigate('/policies')}>Back to policies</Button>} />
        )}
      </Panel>
    );
  }

  const insured = accountName(account.data);
  const lastCancel = txns.data.find((t) => t.type === 'Cancellation' && !t.description?.startsWith('Non-renewal'));

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete policy?',
      message: <>This permanently deletes <b>{p.policy_number}</b> and its transaction history. Linked activities, claims, documents and invoices are kept but unlinked from the policy. This cannot be undone.</>,
      confirmLabel: 'Delete policy',
      danger: true,
    });
    if (!ok) return;
    try {
      await db.remove('policies', p.id);
      toast(`Policy ${p.policy_number} deleted`);
      navigate('/policies');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remarket = () => navigate(`/quotes/new?account=${p.account_id}&line=${encodeURIComponent(p.line_of_business)}`);

  const action = (kind: PolicyAction, label: string, icon: ReactElement, danger = false) => ({ label, icon, danger, disabled: !canDo(kind, p.status), onClick: () => setTx(kind) });

  const days = daysUntil(p.expiration_date);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Policies', href: href('/policies') }, { label: insured, href: href(`/accounts/${p.account_id}`) }]}
        icon={<FileCheck2 size={20} />}
        title={<span className="flex flex-wrap items-center gap-2">{p.policy_number} <StatusBadge status={p.status} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{p.line_of_business}</span><span>·</span><span>{p.carrier}</span><span>·</span>
          <a href={href(`/accounts/${p.account_id}`)} className="text-brand-600 hover:underline">{insured}</a>
          {p.status === 'Active' && days !== null && days <= 60 && <Badge tone={expirationTone(days)}>Expires {relativeDays(days)}</Badge>}
        </span>}
        actions={<>
          <Button icon={<Pencil size={14} />} onClick={() => setEditing(true)}>Edit</Button>
          <Button icon={<FilePen size={14} />} disabled={!canDo('endorse', p.status)} onClick={() => setTx('endorse')}>Endorse</Button>
          <Button variant="primary" icon={<RefreshCw size={14} />} disabled={!canDo('renew', p.status)} onClick={() => setTx('renew')}>Renew</Button>
          <Menu
            trigger={<Button icon={<ChevronDown size={14} />}>More actions</Button>}
            items={[
              { label: 'Edit policy', icon: <Pencil size={14} />, onClick: () => setEditing(true) },
              action('endorse', 'Endorse / change', <FilePen size={14} />),
              action('renew', 'Renew', <RefreshCw size={14} />),
              action('audit', 'Audit', <ClipboardCheck size={14} />),
              'divider',
              action('cancel', 'Cancel policy', <Ban size={14} />, true),
              action('reinstate', 'Reinstate', <Undo2 size={14} />),
              action('nonrenew', 'Non-renew', <CalendarClock size={14} />, true),
              'divider',
              { label: 'Remarket / requote', icon: <Search size={14} />, onClick: remarket },
              'divider',
              { label: 'Delete policy', icon: <Trash2 size={14} />, danger: true, onClick: remove },
            ]}
          />
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Term premium" value={fmtMoney(p.premium)} hint={`${p.term_months}-month term`} />
        <StatCard label="Est. commission" value={fmtMoney(commissionOf(p))} hint={`${p.commission_rate}%`} tone="purple" />
        <StatCard label="Effective" value={<span className="text-base">{fmtDate(p.effective_date)}</span>} tone="green" />
        <StatCard label="Expiration" value={<span className="text-base">{fmtDate(p.expiration_date)}</span>} hint={days !== null ? relativeDays(days) : undefined} tone="amber" />
      </div>

      <Panel bodyClassName="p-0">
        <Tabs
          className="px-2"
          value={tab}
          onChange={(t) => setParam('tab', t === 'overview' ? null : t)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'coverages', label: 'Coverages', count: p.coverages?.length ?? 0 },
            { value: 'history', label: 'History', count: txns.data.length },
            { value: 'activities', label: 'Activities' },
            { value: 'documents', label: 'Documents' },
            { value: 'claims', label: 'Claims', count: claims.data.length },
          ]}
        />
        <div className="p-4">
          {tab === 'overview' && <Overview policy={p} insured={insured} />}
          {tab === 'coverages' && <CoveragesTab policy={p} />}
          {tab === 'history' && <HistoryTab txns={txns.data} loading={txns.loading} error={txns.error} />}
          {tab === 'activities' && <ActivityList accountId={p.account_id} policyId={p.id} />}
          {tab === 'documents' && <DocumentList accountId={p.account_id} policyId={p.id} />}
          {tab === 'claims' && <ClaimsTab claims={claims.data} loading={claims.loading} error={claims.error} />}
        </div>
      </Panel>

      {editing && <PolicyFormModal accountId={p.account_id} policy={p} onClose={() => setEditing(false)} />}
      {tx && <TransactionModal kind={tx} policy={p} lastCancel={lastCancel} txns={txns.data} onClose={() => setTx(null)} />}
    </div>
  );
}

function Overview({ policy: p, insured }: { policy: Policy; insured: string }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-2">Policy information</h3>
        <DescriptionList columns={3} items={[
          { label: 'Policy number', value: p.policy_number },
          { label: 'Insured', value: <a href={href(`/accounts/${p.account_id}`)} className="text-brand-600 hover:underline">{insured}</a> },
          { label: 'Status', value: <StatusBadge status={p.status} /> },
          { label: 'Line of business', value: p.line_of_business },
          { label: 'Carrier', value: p.carrier },
          { label: 'Producer', value: p.producer },
          { label: 'Effective date', value: fmtDate(p.effective_date) },
          { label: 'Expiration date', value: fmtDate(p.expiration_date) },
          { label: 'Term', value: `${p.term_months} months` },
          { label: 'Source', value: p.source },
          { label: 'Added', value: fmtDateTime(p.created_at) },
        ]} />
      </section>
      <section className="border-t border-ink-100 pt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-2">Premium, commission & billing</h3>
        <DescriptionList columns={3} items={[
          { label: 'Term premium', value: fmtMoney(p.premium, true) },
          { label: 'Commission rate', value: `${p.commission_rate}%` },
          { label: 'Est. commission', value: fmtMoney(commissionOf(p), true) },
          { label: 'Billing type', value: p.billing_type },
          { label: 'Payment plan', value: p.payment_plan },
        ]} />
      </section>
      {p.notes && (
        <section className="border-t border-ink-100 pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-2">Notes</h3>
          <p className="text-[13px] text-ink-800 whitespace-pre-wrap">{p.notes}</p>
        </section>
      )}
      <section className="border-t border-ink-100 pt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-2">Coverages</h3>
        <CoverageTable coverages={p.coverages ?? []} />
      </section>
    </div>
  );
}

function CoveragesTab({ policy }: { policy: Policy }) {
  const { toast } = useFeedback();
  const [rows, setRows] = useState<CoverageDraft[]>(() => toDrafts(policy.coverages));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = JSON.stringify(policy.coverages ?? []);

  // Pick up external changes (e.g. edit modal) when there are no unsaved local edits. Keyed on the
  // stored value only: re-running when `dirty` flips false after a save would briefly restore the
  // pre-save coverages until the policy row re-fetches.
  useEffect(() => { if (!dirtyRef.current) setRows(toDrafts(JSON.parse(saved))); }, [saved]);

  const save = async () => {
    const { coverages, error: err } = fromDrafts(rows);
    if (err) { setError(err); return; }
    setBusy(true);
    setError(null);
    try {
      await db.update('policies', policy.id, { coverages });
      setRows(toDrafts(coverages));
      setDirty(false);
      toast('Coverages saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />
      <CoverageEditor rows={rows} onChange={(r) => { setRows(r); setDirty(true); }} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-3">
        <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!dirty || busy} onClick={() => { setDirty(false); setError(null); setRows(toDrafts(policy.coverages)); }}>Discard changes</Button>
        <Button variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save coverages</Button>
      </div>
    </div>
  );
}

/** Groups transactions into policy terms: each New Business / Renewal starts a term. Newest first. */
function groupByTerm(txns: PolicyTransaction[]) {
  const asc = [...txns].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups: { start: PolicyTransaction | null; items: PolicyTransaction[] }[] = [];
  for (const t of asc) {
    if (t.type === 'New Business' || t.type === 'Renewal' || !groups.length) groups.push({ start: t.type === 'New Business' || t.type === 'Renewal' ? t : null, items: [] });
    groups[groups.length - 1].items.push(t);
  }
  return groups.reverse().map((g) => ({ ...g, items: g.items.reverse() }));
}

function HistoryTab({ txns, loading, error }: { txns: PolicyTransaction[]; loading: boolean; error: string | null }) {
  const groups = useMemo(() => groupByTerm(txns), [txns]);
  if (loading && !txns.length) return <LoadingBlock />;
  if (error) return <ErrorBanner message={error} />;
  if (!txns.length) return <EmptyState title="No transactions" message="Endorsements, renewals, cancellations and audits will appear here." />;
  return (
    <div className="space-y-5">
      {groups.map((g, gi) => {
        const net = g.items.reduce((s, t) => s + Number(t.premium_change || 0), 0);
        return (
          <section key={g.start?.id ?? `g${gi}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {g.start ? `Term beginning ${fmtDate(g.start.effective_date)}` : 'Earlier transactions'}{gi === 0 && <Badge tone="teal" className="ml-2 normal-case">Current term</Badge>}
              </h3>
              <span className="text-xs text-ink-400">Net written: <span className="font-semibold text-ink-800 tabular-nums">{fmtMoney(net, true)}</span></span>
            </div>
            <ol className="border border-ink-100 rounded divide-y divide-ink-50">
              {g.items.map((t) => (
                <li key={t.id} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 px-3 py-2.5">
                  <div className="sm:w-36 shrink-0"><Badge tone={TX_TONES[t.type] ?? 'gray'}>{t.type}</Badge></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink-900 break-words">{t.description || '—'}</div>
                    <div className="text-xs text-ink-400 mt-0.5">Effective {fmtDate(t.effective_date)} · processed {fmtDateTime(t.created_at)}</div>
                  </div>
                  <div className={`text-[13px] font-semibold tabular-nums sm:text-right sm:w-28 ${Number(t.premium_change) < 0 ? 'text-red-600' : 'text-ink-900'}`}>{signedMoney(Number(t.premium_change || 0), fmtMoney)}</div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function ClaimsTab({ claims, loading, error }: { claims: Claim[]; loading: boolean; error: string | null }) {
  const columns: Column<Claim>[] = [
    { key: 'num', header: 'Claim #', sortValue: (c) => c.claim_number, render: (c) => <span className="font-semibold whitespace-nowrap">{c.claim_number || 'Not assigned'}</span> },
    { key: 'dol', header: 'Date of loss', sortValue: (c) => c.date_of_loss, render: (c) => <span className="whitespace-nowrap">{fmtDate(c.date_of_loss)}</span> },
    { key: 'type', header: 'Loss type', sortValue: (c) => c.loss_type, render: (c) => c.loss_type },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <StatusBadge status={c.status} /> },
    { key: 'reserved', header: 'Reserved', align: 'right', sortValue: (c) => c.amount_reserved, render: (c) => <span className="tabular-nums">{fmtMoney(c.amount_reserved)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', sortValue: (c) => c.amount_paid, render: (c) => <span className="tabular-nums">{fmtMoney(c.amount_paid)}</span> },
    { key: 'adj', header: 'Adjuster', render: (c) => <span className="whitespace-nowrap">{c.adjuster_name || '—'}</span> },
  ];
  return (
    <div className="space-y-2">
      <ErrorBanner message={error} />
      <DataTable columns={columns} rows={claims} loading={loading} dense initialSort={{ key: 'dol', dir: 'desc' }} empty={<EmptyState title="No claims" message="No claims have been reported against this policy." />} />
    </div>
  );
}
