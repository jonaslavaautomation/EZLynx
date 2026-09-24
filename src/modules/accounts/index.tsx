import {
  Building2, Calculator, Calendar, Download, FileText, FolderOpen, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, ShieldAlert, Trash2, Upload, User, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Avatar, Badge, Button, DataTable, DescriptionList, EmptyState, ErrorBanner, LoadingBlock, Menu, PageHeader, Panel, Pills, SearchInput, Select,
  StatCard, StatusBadge, Tabs, useFeedback, type Column,
} from '@/components/ui';
import { StaffSelect } from '@/components/pickers';
import { ActivityList } from '@/modules/activities';
import { ClaimList } from '@/modules/claims';
import { DocumentList } from '@/modules/documents';
import { InvoiceList } from '@/modules/accounting';
import { MessageThread } from '@/modules/messages';
import { PolicyList } from '@/modules/policies';
import { QuoteList } from '@/modules/quotes';
import { AccountFormModal } from '@/modules/accounts/AccountFormModal';
import { DriversPanel, PropertiesPanel, VehiclesPanel } from '@/modules/accounts/HouseholdPanels';
import { ImportModal } from '@/modules/accounts/ImportModal';
import { trackRecentAccount } from '@/lib/recent';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { commissionOf } from '@/lib/domain';
import { accountName, age, daysUntil, downloadCsv, fmtDate, fmtMoney, fmtPhone } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import type { Account, AccountStatus, AccountType } from '@/lib/types';

export { AccountFormModal } from '@/modules/accounts/AccountFormModal';

// ── List ──

type TypeFilter = 'all' | AccountType;

export function AccountsPage() {
  const { params } = useRoute();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  // Global search's "View all accounts" navigates here with ?q= — apply it even when this page is already open.
  useEffect(() => { setQ(urlQ); }, [urlQ]);
  const rawType = params.get('type');
  const type: TypeFilter = rawType === 'Personal' || rawType === 'Commercial' ? rawType : 'all';
  const status = params.get('status') ?? '';
  const producer = params.get('producer');
  const accounts = useTable('accounts', { order: { column: 'created_at', ascending: false } });
  const policies = useTable('policies', { eq: { status: 'Active' } });
  const newParam = params.get('new');
  const [creating, setCreating] = useState<AccountType | null>(null);
  useEffect(() => { if (newParam) setCreating(newParam === 'Commercial' ? 'Commercial' : 'Personal'); }, [newParam]);
  const importing = params.get('import') === '1';
  // "Search Applicants" in the navigation lands here with ?focus=search.
  const focusSearch = params.get('focus') === 'search';
  useEffect(() => {
    if (!focusSearch) return;
    document.querySelector<HTMLInputElement>('[data-applicant-search] input')?.focus();
    setParam('focus', null);
  }, [focusSearch]);

  const policyStats = useMemo(() => {
    const m = new Map<string, { count: number; premium: number }>();
    policies.data.forEach((p) => {
      const s = m.get(p.account_id) ?? { count: 0, premium: 0 };
      s.count++; s.premium += Number(p.premium);
      m.set(p.account_id, s);
    });
    return m;
  }, [policies.data]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return accounts.data.filter((a) => {
      if (type !== 'all' && (a.account_type ?? 'Personal') !== type) return false;
      if (status && a.status !== status) return false;
      if (producer && a.producer !== producer) return false;
      if (!t) return true;
      return [accountName(a), a.first_name + ' ' + a.last_name, a.email, a.phone, a.mobile_phone, a.city, a.zip, a.address].some((f) => f?.toLowerCase().includes(t));
    });
  }, [accounts.data, q, type, status, producer]);

  const counts = useMemo(() => ({
    all: accounts.data.length,
    Personal: accounts.data.filter((a) => (a.account_type ?? 'Personal') === 'Personal').length,
    Commercial: accounts.data.filter((a) => a.account_type === 'Commercial').length,
  }), [accounts.data]);

  const cols: Column<Account>[] = [
    {
      key: 'name', header: 'Name', sortValue: (a) => accountName(a).toLowerCase(),
      render: (a) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-xs font-bold shrink-0">{a.account_type === 'Commercial' ? <Building2 size={14} /> : `${a.first_name[0] ?? ''}${a.last_name[0] ?? ''}`}</span>
          <div className="min-w-0">
            <a href={href(`/accounts/${a.id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink-900 hover:text-brand-600 block truncate">{accountName(a)}</a>
            <span className="text-xs text-ink-400">{a.account_type === 'Commercial' ? `${a.first_name} ${a.last_name}` : a.account_type ?? 'Personal'}</span>
          </div>
        </div>
      ),
    },
    { key: 'contact', header: 'Contact', render: (a) => <div className="text-xs"><div className="text-brand-600">{a.email}</div><div className="text-ink-400">{fmtPhone(a.phone ?? a.mobile_phone)}</div></div> },
    { key: 'loc', header: 'Location', sortValue: (a) => a.city ?? '', render: (a) => (a.city ? `${a.city}, ${a.state ?? ''}` : '—') },
    { key: 'status', header: 'Status', sortValue: (a) => a.status ?? '', render: (a) => <StatusBadge status={a.status} /> },
    { key: 'pol', header: 'Active policies', align: 'right', sortValue: (a) => policyStats.get(a.id)?.count ?? 0, render: (a) => policyStats.get(a.id)?.count ?? 0 },
    { key: 'prem', header: 'Premium', align: 'right', sortValue: (a) => policyStats.get(a.id)?.premium ?? 0, render: (a) => fmtMoney(policyStats.get(a.id)?.premium ?? 0) },
    { key: 'producer', header: 'Producer', sortValue: (a) => a.producer ?? '', render: (a) => a.producer ?? '—' },
    { key: 'created', header: 'Added', sortValue: (a) => a.created_at, render: (a) => fmtDate(a.created_at) },
  ];

  const exportCsv = () => downloadCsv('accounts.csv', filtered.map((a) => ({
    name: accountName(a), type: a.account_type, first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone, mobile: a.mobile_phone,
    address: a.address, city: a.city, state: a.state, zip: a.zip, status: a.status, producer: a.producer, csr: a.csr, lead_source: a.lead_source,
    active_policies: policyStats.get(a.id)?.count ?? 0, premium: policyStats.get(a.id)?.premium ?? 0, created: a.created_at.slice(0, 10),
  })));

  return (
    <div>
      <PageHeader
        title="Applicants"
        subtitle="Personal and commercial clients, prospects and former clients"
        icon={<Users size={20} />}
        actions={<>
          <Button icon={<Download size={15} />} onClick={exportCsv} disabled={!filtered.length}>Export</Button>
          <Button icon={<Upload size={15} />} onClick={() => setParam('import', '1')}>Import</Button>
          <Button icon={<Building2 size={15} />} onClick={() => setCreating('Commercial')}>New commercial</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating('Personal')}>New personal</Button>
        </>}
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills value={type} onChange={(v) => setParam('type', v === 'all' ? null : v)} options={[{ value: 'all', label: 'All', count: counts.all }, { value: 'Personal', label: 'Personal', count: counts.Personal }, { value: 'Commercial', label: 'Commercial', count: counts.Commercial }]} />
          <div data-applicant-search className="w-full sm:w-72"><SearchInput value={q} onChange={setQ} placeholder="Name, email, phone, city, ZIP…" /></div>
          <Select className="w-36" value={status} onChange={(e) => setParam('status', e.target.value || null)} placeholder="Any status" options={['Prospect', 'Active', 'Pending', 'Inactive']} />
          <StaffSelect className="w-48" value={producer} onChange={(v) => setParam('producer', v)} placeholder="Any producer" />
          <span className="ml-auto text-xs text-ink-400">{filtered.length} account{filtered.length === 1 ? '' : 's'}</span>
        </div>
        <ErrorBanner message={accounts.error} />
        <DataTable
          columns={cols}
          rows={filtered}
          loading={accounts.loading}
          onRowClick={(a) => navigate(`/accounts/${a.id}`)}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<Users size={22} />} title={accounts.data.length ? 'No accounts match your filters' : 'No accounts yet'} message={accounts.data.length ? 'Try a different search or clear filters.' : 'Create your first account or load sample data from Settings.'} action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating('Personal')}>New account</Button>} />}
        />
      </Panel>
      {importing && <ImportModal onClose={() => setParam('import', null)} />}
      {creating && <AccountFormModal defaultType={creating} onClose={() => { setCreating(null); if (params.get('new')) setParam('new', null); }} onSaved={(a) => navigate(`/accounts/${a.id}`)} />}
    </div>
  );
}

// ── Detail ──

type TabKey = 'overview' | 'household' | 'policies' | 'quotes' | 'activities' | 'claims' | 'documents' | 'messages' | 'billing';

export function AccountDetail({ id }: { id: string }) {
  const { params } = useRoute();
  const { staffColor } = useAppData();
  const { confirm, toast } = useFeedback();
  const account = useRow('accounts', id);
  const found = !!account.data;
  useEffect(() => { if (found) trackRecentAccount(id); }, [found, id]);
  const policies = useTable('policies', { eq: { account_id: id } });
  const quotes = useTable('quotes', { eq: { account_id: id } });
  const activities = useTable('activities', { eq: { account_id: id } });
  const claims = useTable('claims', { eq: { account_id: id } });
  const docs = useTable('documents', { eq: { account_id: id } });
  const msgs = useTable('messages', { eq: { account_id: id } });
  const invoices = useTable('invoices', { eq: { account_id: id } });
  const [editing, setEditing] = useState(false);
  const tab = (params.get('tab') as TabKey) || 'overview';
  const setTab = (t: TabKey) => setParam('tab', t === 'overview' ? null : t);

  if (account.loading) return <LoadingBlock label="Loading account…" />;
  const a = account.data;
  if (!a) return <EmptyState icon={<User size={22} />} title="Account not found" message="It may have been deleted." action={<Button onClick={() => navigate('/accounts')}>Back to accounts</Button>} />;

  const commercial = a.account_type === 'Commercial';
  const active = policies.data.filter((p) => p.status === 'Active');
  const premium = active.reduce((s, p) => s + Number(p.premium), 0);
  const openTasks = activities.data.filter((x) => x.status !== 'Completed');
  const openClaims = claims.data.filter((c) => c.status === 'Open' || c.status === 'Under Review');
  const balance = invoices.data.filter((i) => i.status !== 'Void').reduce((s, i) => s + Number(i.amount) - Number(i.amount_paid), 0);
  const nextRenewal = active.map((p) => p.expiration_date).sort()[0];

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete account?',
      message: <>This permanently deletes <b>{accountName(a)}</b> and all of their policies, quotes, activities, claims, documents, messages and invoices.</>,
      confirmLabel: 'Delete account', danger: true,
    });
    if (!ok) return;
    try {
      // Read the documents now (the tab's list may not have loaded) — the rows cascade away with the account.
      const files = await db.list('documents', { eq: { account_id: a.id } });
      await db.remove('accounts', a.id);
      // Rows first, then files: a failed file cleanup leaves only an orphaned object, never a broken document row.
      try { await db.removeFiles(files); } catch { toast('Account deleted, but some stored files could not be removed.', 'info'); navigate('/accounts'); return; }
      toast('Account deleted');
      navigate('/accounts');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const setStatus = async (status: AccountStatus) => {
    try { await db.update('accounts', a.id, { status }); toast(`Marked ${status}`); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'household', label: commercial ? 'Locations' : 'Drivers, Vehicles & Property' },
    { value: 'policies', label: 'Policies', count: policies.data.length },
    { value: 'quotes', label: 'Quotes', count: quotes.data.length },
    { value: 'activities', label: 'Activities', count: openTasks.length },
    { value: 'claims', label: 'Claims', count: claims.data.length },
    { value: 'documents', label: 'Documents', count: docs.data.length },
    { value: 'messages', label: 'Messages', count: msgs.data.length },
    { value: 'billing', label: 'Billing', count: invoices.data.filter((i) => i.status === 'Unpaid' || i.status === 'Partial').length },
  ];

  const primaryLine = commercial ? 'General Liability' : active.some((p) => p.line_of_business === 'Personal Auto') ? 'Homeowners' : 'Personal Auto';

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Applicants', href: href('/accounts') }]}
        title={<span className="flex items-center gap-2">{accountName(a)} <StatusBadge status={a.status} /></span>}
        subtitle={commercial ? `Commercial · Contact: ${a.first_name} ${a.last_name}` : `Personal lines${a.dob ? ` · Age ${age(a.dob)}` : ''}${a.occupation ? ` · ${a.occupation}` : ''}`}
        icon={commercial ? <Building2 size={20} /> : <User size={20} />}
        actions={<>
          <Button variant="primary" icon={<Calculator size={15} />} onClick={() => navigate(`/quotes/new?account=${a.id}&line=${encodeURIComponent(primaryLine)}`)}>New quote</Button>
          <Button icon={<MessageSquare size={15} />} onClick={() => setTab('messages')}>Text</Button>
          <Button icon={<Mail size={15} />} onClick={() => { window.location.href = `mailto:${a.email}`; }}>Email</Button>
          <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>Edit</Button>
          <Menu items={[
            { label: 'Log activity / task', icon: <Calendar size={14} />, onClick: () => setTab('activities') },
            { label: 'Add policy', icon: <FolderOpen size={14} />, onClick: () => setTab('policies') },
            { label: 'Report claim', icon: <ShieldAlert size={14} />, onClick: () => setTab('claims') },
            { label: 'Upload document', icon: <FileText size={14} />, onClick: () => setTab('documents') },
            'divider',
            ...(['Prospect', 'Active', 'Pending', 'Inactive'] as AccountStatus[]).filter((s) => s !== a.status).map((s) => ({ label: `Mark as ${s}`, onClick: () => setStatus(s) })),
            'divider',
            { label: 'Delete account', icon: <Trash2 size={14} />, danger: true, onClick: remove },
          ]} />
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Active policies" value={active.length} icon={<FolderOpen size={17} />} onClick={() => setTab('policies')} />
        <StatCard label="Annual premium" value={fmtMoney(premium)} hint={`${fmtMoney(active.reduce((s, p) => s + commissionOf(p), 0))} commission`} icon={<Calculator size={17} />} tone="green" />
        <StatCard label="Next renewal" value={nextRenewal ? fmtDate(nextRenewal) : '—'} hint={nextRenewal ? renewalHint(daysUntil(nextRenewal) ?? 0) : undefined} icon={<Calendar size={17} />} tone="blue" />
        <StatCard label="Open tasks" value={openTasks.length} hint={openClaims.length ? `${openClaims.length} open claim${openClaims.length > 1 ? 's' : ''}` : undefined} icon={<ShieldAlert size={17} />} tone="amber" onClick={() => setTab('activities')} />
        <StatCard label="Balance due" value={fmtMoney(balance, true)} icon={<FileText size={17} />} tone={balance > 0 ? 'red' : 'purple'} onClick={() => setTab('billing')} />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <Panel title="Contact information" actions={<Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit</Button>}>
              <DescriptionList columns={3} items={[
                ...(commercial ? [{ label: 'Business name', value: a.business_name }, { label: 'Primary contact', value: `${a.first_name} ${a.last_name}` }] : [{ label: 'Name', value: `${a.first_name} ${a.last_name}` }, { label: 'Date of birth', value: a.dob ? `${fmtDate(a.dob)} (${age(a.dob)})` : null }, { label: 'Marital status', value: a.marital_status }]),
                { label: 'Email', value: <a href={`mailto:${a.email}`}>{a.email}</a> },
                { label: 'Phone', value: a.phone ? <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1"><Phone size={12} />{fmtPhone(a.phone)}</a> : null },
                { label: 'Mobile', value: a.mobile_phone ? fmtPhone(a.mobile_phone) : null },
                { label: 'Mailing address', value: a.address ? <span className="inline-flex items-start gap-1"><MapPin size={12} className="mt-0.5 shrink-0" />{a.address}, {a.city}, {a.state} {a.zip}</span> : null },
                ...(!commercial ? [{ label: 'Occupation', value: a.occupation }] : []),
                { label: 'Lead source', value: a.lead_source },
                { label: 'Client since', value: fmtDate(a.created_at) },
              ]} />
              {a.notes && <div className="mt-4 text-[13px] text-ink-600 bg-amber-50/60 border border-amber-100 rounded p-3 whitespace-pre-wrap">{a.notes}</div>}
            </Panel>
            <Panel title="Policies" actions={<Button size="sm" onClick={() => setTab('policies')}>View all</Button>} bodyClassName="p-0">
              {active.length === 0 ? <EmptyState icon={<FolderOpen size={22} />} title="No active policies" message="Quote and bind, or add an existing policy." action={<Button variant="primary" size="sm" onClick={() => navigate(`/quotes/new?account=${a.id}`)}>Start a quote</Button>} /> : (
                <div className="divide-y divide-ink-50">
                  {active.map((p) => (
                    <a key={p.id} href={href(`/policies/${p.id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/50">
                      <span className="w-8 h-8 rounded bg-sky-50 text-sky-700 grid place-items-center shrink-0"><FolderOpen size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink-900">{p.line_of_business} · {p.carrier}</span>
                        <span className="block text-xs text-ink-400">{p.policy_number} · {fmtDate(p.effective_date)} – {fmtDate(p.expiration_date)}</span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-ink-900">{fmtMoney(p.premium)}</span>
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Service team">
              <div className="space-y-3">
                {[['Producer', a.producer], ['CSR / Account manager', a.csr]].map(([label, name]) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <Avatar name={name ?? '?'} color={staffColor(name)} size={30} />
                    <div><div className="text-[11px] uppercase tracking-wide font-semibold text-ink-400">{label}</div><div className="text-[13px] text-ink-900">{name ?? 'Unassigned'}</div></div>
                  </div>
                ))}
              </div>
            </Panel>
            {!commercial && <HouseholdSummary accountId={a.id} onOpen={() => setTab('household')} />}
            <Panel title="Recent activity" actions={<Button size="sm" onClick={() => setTab('activities')}>All</Button>}>
              {activities.data.length === 0 ? <div className="text-[13px] text-ink-400">No activity yet.</div> : (
                <ul className="space-y-2.5">
                  {[...activities.data].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 5).map((x) => (
                    <li key={x.id} className="text-[13px]">
                      <div className="flex items-center gap-2"><Badge tone={x.status === 'Completed' ? 'gray' : 'blue'}>{x.type}</Badge><span className="text-ink-900 truncate">{x.subject}</span></div>
                      <div className="text-xs text-ink-400 mt-0.5">{x.assigned_to ?? '—'} · {fmtDate(x.due_date ?? x.created_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'household' && (
        commercial ? (
          <PropertiesPanel account={a} />
        ) : (
          <div className="space-y-4"><DriversPanel account={a} /><VehiclesPanel account={a} /><PropertiesPanel account={a} /></div>
        )
      )}
      {tab === 'policies' && <PolicyList accountId={a.id} />}
      {tab === 'quotes' && <QuoteList accountId={a.id} />}
      {tab === 'activities' && <ActivityList accountId={a.id} />}
      {tab === 'claims' && <ClaimList accountId={a.id} />}
      {tab === 'documents' && <DocumentList accountId={a.id} />}
      {tab === 'messages' && <Panel bodyClassName="p-0"><MessageThread accountId={a.id} /></Panel>}
      {tab === 'billing' && <InvoiceList accountId={a.id} />}

      {editing && <AccountFormModal account={a} onClose={() => setEditing(false)} />}
    </div>
  );
}

const renewalHint = (d: number) => (d < 0 ? <span className="text-red-600">Lapsed {-d} day{d === -1 ? '' : 's'} ago</span> : d === 0 ? 'Today' : `in ${d} day${d === 1 ? '' : 's'}`);

function HouseholdSummary({ accountId, onOpen }: { accountId: string; onOpen: () => void }) {
  const drivers = useTable('drivers', { eq: { account_id: accountId } });
  const vehicles = useTable('vehicles', { eq: { account_id: accountId } });
  const props = useTable('properties', { eq: { account_id: accountId } });
  return (
    <Panel title="Household" actions={<Button size="sm" onClick={onOpen}>Manage</Button>}>
      <div className="space-y-2 text-[13px]">
        <div><span className="text-ink-400">Drivers:</span> {drivers.data.map((d) => `${d.first_name} ${d.last_name}`).join(', ') || '—'}</div>
        <div><span className="text-ink-400">Vehicles:</span> {vehicles.data.map((v) => `${v.year} ${v.make} ${v.model}`).join(', ') || '—'}</div>
        <div><span className="text-ink-400">Property:</span> {props.data.map((p) => p.address).join(', ') || '—'}</div>
      </div>
    </Panel>
  );
}
