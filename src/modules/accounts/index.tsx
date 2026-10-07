import {
  Building2, Calculator, Calendar, Car, ChevronDown, CircleUser, ClipboardList, DollarSign, Download, FileBadge, FileText, FolderOpen, Home, IdCard, Mail, MapPin, MessageSquare, Pencil, Phone, Plus,
  Receipt, Send, ShieldAlert, Sparkles, Trash2, Upload, User, UserSearch, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Avatar, Button, DataTable, DescriptionList, EmptyState, ErrorBanner, LoadingBlock, Menu, PageHeader, Panel, Pills, SearchInput, Select,
  StatusBadge, useFeedback, type Column,
} from '@/components/ui';
import { StaffSelect } from '@/components/pickers';
import { ClaimList } from '@/modules/claims';
import { DocumentLibrary } from '@/modules/documents/library';
import { SubmissionsTab } from './submissions';
import { AccountActivityTab, CertificateMastersTab, LeadInfoTab, PoliciesTab, QuotesTab } from './record-tabs';
import { InvoiceList } from '@/modules/accounting';
import { MessageThread } from '@/modules/messages';
import { AccountFormModal } from '@/modules/accounts/AccountFormModal';
import { DriversPanel, PropertiesPanel, VehiclesPanel } from '@/modules/accounts/HouseholdPanels';
import { ImportModal } from '@/modules/accounts/ImportModal';
import { isAssociation } from '@/modules/accounts/association';
import { AddressesPanel, AssociationPanel, ClassificationPanel, ContactsPanel } from '@/modules/accounts/DetailsPanels';
import { LabelFilterSelect } from '@/modules/admin/integration';
import { ApplicantDrawer, RECORD_TABS, RecordTabs, useQuoteThemeDialogs, type RecordTab } from '@/modules/autoquote/shell';
import { AccountOverviewBody, CatchMeUpModal } from '@/modules/accounts/overview';
import { trackRecentAccount } from '@/lib/recent';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, age, downloadCsv, fmtDate, fmtMoney, fmtPhone, parseDate, toISODate } from '@/lib/format';
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
  const label = params.get('label');
  const accounts = useTable('accounts', { order: { column: 'created_at', ascending: false } });
  const policies = useTable('policies', { eq: { status: 'Active' } });
  const newParam = params.get('new');
  const setCreating = (t: AccountType) => navigate(`/accounts/new?type=${t}`);
  // Legacy links (?new=Personal|Commercial) open the full Create Applicant page.
  useEffect(() => { if (newParam) navigate(`/accounts/new?type=${newParam === 'Commercial' ? 'Commercial' : 'Personal'}`, { replace: true }); }, [newParam]);
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
      if (label && !(a.labels ?? []).includes(label)) return false;
      if (!t) return true;
      return [accountName(a), a.first_name + ' ' + a.last_name, a.email, a.phone, a.mobile_phone, a.city, a.zip, a.address].some((f) => f?.toLowerCase().includes(t));
    });
  }, [accounts.data, q, type, status, producer, label]);

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
    active_policies: policyStats.get(a.id)?.count ?? 0, premium: policyStats.get(a.id)?.premium ?? 0, created: toISODate(parseDate(a.created_at)!),
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
          <LabelFilterSelect className="w-44" value={label} onChange={(v) => setParam('label', v)} />
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
    </div>
  );
}

// ── Detail ──

const TAB_HEAD: Record<RecordTab, { title: string; icon: typeof User }> = {
  overview: { title: 'Account Overview', icon: CircleUser }, policies: { title: 'Policies', icon: FolderOpen }, details: { title: 'Details', icon: IdCard },
  quotes: { title: 'Quotes', icon: DollarSign }, lead: { title: 'Lead Info', icon: UserSearch }, documents: { title: 'Document Library', icon: FileText }, submissions: { title: 'Submissions', icon: Send },
  certificates: { title: 'Certificates', icon: FileBadge }, activities: { title: 'Account Activity', icon: ClipboardList }, billing: { title: 'Invoices', icon: Receipt },
  claims: { title: 'Claims', icon: ShieldAlert }, messages: { title: 'Messages', icon: MessageSquare },
};

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
  const [editing, setEditing] = useState(false);
  const [catchUp, setCatchUp] = useState(false);
  const [headSlot, setHeadSlot] = useState<HTMLDivElement | null>(null);
  // The header's AI button opens "Catch me up" on the open account.
  const catchParam = params.get('catchup') === '1';
  useEffect(() => { if (catchParam) { setCatchUp(true); setParam('catchup', null); } }, [catchParam]);
  useQuoteThemeDialogs();
  const raw = params.get('tab');
  const tab: RecordTab = raw === 'household' ? 'details' : (RECORD_TABS.find((t) => t.key === raw)?.key ?? 'overview');

  if (account.loading) return <LoadingBlock label="Loading account…" />;
  const a = account.data;
  if (!a) return <EmptyState icon={<User size={22} />} title="Account not found" message="It may have been deleted." action={<Button onClick={() => navigate('/accounts')}>Back to accounts</Button>} />;

  const commercial = a.account_type === 'Commercial';
  const setTab = (t: RecordTab) => setParam('tab', t === 'overview' ? null : t);

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

  const activeLines = policies.data.filter((p) => p.status === 'Active').map((p) => p.line_of_business);
  const primaryLine = commercial ? (isAssociation(a) ? 'Commercial Package' : 'General Liability') : activeLines.includes('Personal Auto') ? 'Homeowners' : 'Personal Auto';
  const head = TAB_HEAD[tab];

  return (
    <div className="theme-quote -mx-5 -mt-4 flex min-h-[calc(var(--vh100)-104px)] bg-[#f2f4f7]">
      <ApplicantDrawer account={a} />
      <div className="flex-1 min-w-0">
        <RecordTabs accountId={a.id} active={tab} />
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[#f2f4f7] border-b border-[#e2e8f0]">
          <head.icon size={30} className="text-ink-500" strokeWidth={1.6} />
          <h1 className="text-[20px] text-ink-900">{head.title}</h1>
          <div className="flex-1" />
          <div ref={setHeadSlot} className="flex flex-wrap items-center gap-2 empty:hidden" />
          {tab === 'overview' && <>
            <Menu trigger={<Button variant="primary" className="h-9 px-4 tracking-wide">Actions <ChevronDown size={15} /></Button>} items={[
              ...(commercial
                ? [{ label: 'New quote', icon: <Calculator size={14} />, onClick: () => navigate(`/quotes/new?account=${a.id}&line=${encodeURIComponent(primaryLine)}`) }]
                : [
                  { label: 'Quote auto', icon: <Car size={14} />, onClick: () => navigate(`/accounts/${a.id}/auto-quote`) },
                  { label: 'Quote home', icon: <Home size={14} />, onClick: () => navigate(`/accounts/${a.id}/home-quote`) },
                  { label: 'Quote other lines', icon: <Calculator size={14} />, onClick: () => navigate(`/quotes/new?account=${a.id}&line=Renters`) },
                ]),
              'divider',
              { label: 'Edit applicant', icon: <Pencil size={14} />, onClick: () => navigate(`/accounts/${a.id}/edit`) },
              { label: 'Edit contact info', icon: <Pencil size={14} />, onClick: () => setEditing(true) },
              { label: 'Send text message', icon: <MessageSquare size={14} />, onClick: () => setTab('messages') },
              { label: 'Send email', icon: <Mail size={14} />, onClick: () => { window.location.href = `mailto:${a.email}`; } },
              { label: 'Log activity / task', icon: <Calendar size={14} />, onClick: () => setTab('activities') },
              { label: 'Add policy', icon: <FolderOpen size={14} />, onClick: () => setTab('policies') },
              { label: 'Report claim', icon: <ShieldAlert size={14} />, onClick: () => setTab('claims') },
              { label: 'Upload document', icon: <FileText size={14} />, onClick: () => setTab('documents') },
              { label: 'Issue certificate', icon: <FileBadge size={14} />, onClick: () => setTab('certificates') },
              'divider',
              ...(['Prospect', 'Active', 'Pending', 'Inactive'] as AccountStatus[]).filter((s) => s !== a.status).map((s) => ({ label: `Mark as ${s}`, onClick: () => setStatus(s) })),
              'divider',
              { label: 'Delete account', icon: <Trash2 size={14} />, danger: true, onClick: remove },
            ]} />
            <Button className="h-9 px-4 tracking-wide !bg-[#7048e8] !border-[#7048e8] !text-white hover:!bg-[#5f3dc4]" icon={<Sparkles size={15} />} onClick={() => setCatchUp(true)}>Catch me up</Button>
          </>}
        </div>

        <div className="p-4">
          {tab === 'overview' && <AccountOverviewBody account={a} policies={policies.data} quotes={quotes.data} activities={activities.data} />}

          {tab === 'details' && (
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
                    { label: 'Customer since', value: fmtDate(a.customer_since ?? a.created_at) },
                  ]} />
                  {a.notes && <div className="mt-4 text-[13px] text-ink-600 bg-amber-50/60 border border-amber-100 rounded p-3 whitespace-pre-wrap">{a.notes}</div>}
                </Panel>
                {commercial && <ClassificationPanel account={a} />}
                {commercial && <AssociationPanel account={a} />}
                {commercial ? <PropertiesPanel account={a} /> : <><DriversPanel account={a} /><VehiclesPanel account={a} /><PropertiesPanel account={a} /></>}
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
                <ContactsPanel account={a} />
                <AddressesPanel account={a} />
              </div>
            </div>
          )}

          {tab === 'lead' && <LeadInfoTab account={a} />}

          {tab === 'certificates' && <div className="-m-4"><CertificateMastersTab account={a} /></div>}
          {tab === 'policies' && <PoliciesTab account={a} slot={headSlot} />}
          {tab === 'quotes' && <QuotesTab account={a} slot={headSlot} />}
          {tab === 'activities' && <AccountActivityTab account={a} />}
          {tab === 'claims' && <ClaimList accountId={a.id} />}
          {tab === 'documents' && <DocumentLibrary account={a} />}
          {tab === 'submissions' && <SubmissionsTab account={a} />}
          {tab === 'messages' && <Panel bodyClassName="p-0"><MessageThread accountId={a.id} /></Panel>}
          {tab === 'billing' && <InvoiceList accountId={a.id} />}
        </div>
      </div>

      {editing && <AccountFormModal account={a} onClose={() => setEditing(false)} />}
      {catchUp && <CatchMeUpModal account={a} policies={policies.data} quotes={quotes.data} activities={activities.data} onClose={() => setCatchUp(false)} />}
    </div>
  );
}

