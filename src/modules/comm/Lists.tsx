import { Copy, ListFilter, Mail, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StaffSelect } from '@/components/pickers';
import {
  Button, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, PageHeader, Panel, SearchInput, Select, useFeedback, type Column,
} from '@/components/ui';
import { db } from '@/lib/db';
import { accountName, fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import { COMMERCIAL_LINES, LINES_OF_BUSINESS, PERSONAL_LINES, type Account, type AccountStatus, type AccountType, type RecipientFilters, type RecipientList } from '@/lib/types';
import { COMM_CRUMB, ChipMulti, useSubmit } from './parts';
import { ACCOUNT_STATUSES, describeFilters, matchRecipients } from './shared';

/** Accounts + active policies, for live recipient counts. */
export function useRecipientData() {
  const accounts = useTable('accounts');
  const policies = useTable('policies', { eq: { status: 'Active' } });
  return { accounts: accounts.data, policies: policies.data, loading: accounts.loading || policies.loading, error: accounts.error || policies.error };
}

export function RecipientListsPage() {
  const { toast, confirm } = useFeedback();
  const lists = useTable('recipient_lists', { order: { column: 'name' } });
  const campaigns = useTable('email_campaigns');
  const data = useRecipientData();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<RecipientList | 'new' | null>(null);

  const counts = useMemo(() => new Map(lists.data.map((l) => [l.id, matchRecipients(l.filters ?? {}, data.accounts, data.policies).length])), [lists.data, data.accounts, data.policies]);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    campaigns.data.forEach((c) => { if (c.recipient_list_id) m.set(c.recipient_list_id, (m.get(c.recipient_list_id) ?? 0) + 1); });
    return m;
  }, [campaigns.data]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? lists.data.filter((l) => `${l.name} ${describeFilters(l.filters ?? {})}`.toLowerCase().includes(t)) : lists.data;
  }, [lists.data, q]);

  const duplicate = async (l: RecipientList) => {
    try {
      await db.insert('recipient_lists', { name: `${l.name} (copy)`, filters: l.filters ?? {} });
      toast('List duplicated');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const remove = async (l: RecipientList) => {
    const used = usage.get(l.id) ?? 0;
    const ok = await confirm({
      title: 'Delete recipient list?',
      message: <>“{l.name}” will be deleted.{used ? ` ${used} campaign${used === 1 ? '' : 's'} using it will have no list and must pick another before sending.` : ''}</>,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await db.remove('recipient_lists', l.id); toast('List deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<RecipientList>[] = [
    { key: 'name', header: 'List name', sortValue: (l) => l.name.toLowerCase(), render: (l) => <span className="font-semibold text-ink-900">{l.name}</span> },
    { key: 'filters', header: 'Filters', render: (l) => <span className="text-ink-500 text-xs">{describeFilters(l.filters ?? {})}</span> },
    { key: 'count', header: 'Recipients', align: 'right', sortValue: (l) => counts.get(l.id) ?? 0, render: (l) => <span className="tabular-nums font-semibold">{data.loading ? '…' : counts.get(l.id) ?? 0}</span> },
    { key: 'used', header: 'Campaigns', align: 'right', className: 'hidden sm:table-cell', sortValue: (l) => usage.get(l.id) ?? 0, render: (l) => usage.get(l.id) ?? 0 },
    { key: 'created', header: 'Created', className: 'hidden md:table-cell', sortValue: (l) => l.created_at, render: (l) => fmtDate(l.created_at) },
    {
      key: 'menu', header: '', align: 'right', render: (l) => (
        <Menu items={[
          { label: 'Edit filters', icon: <Pencil size={14} />, onClick: () => setEditing(l) },
          { label: 'New campaign with list', icon: <Send size={14} />, onClick: () => navigate(`/comm/campaigns/new?list=${l.id}`) },
          { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(l) },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(l) },
        ]} />
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Recipient Lists"
        icon={<ListFilter size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle="Filter your book of business into reusable audiences for email campaigns"
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New list</Button>}
      />
      <ErrorBanner message={lists.error || data.error} />
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100"><SearchInput value={q} onChange={setQ} placeholder="Search lists…" className="max-w-sm" /></div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={lists.loading}
          onRowClick={(l) => setEditing(l)}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<Users size={22} />} title={lists.data.length ? 'No matching lists' : 'No recipient lists yet'} message="Build a list by applying filters such as status, line of business, producer or state." action={!lists.data.length && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New list</Button>} />}
        />
      </Panel>
      {editing && <ListEditorModal list={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Create/edit a recipient list with a live match count and preview. */
export function ListEditorModal({ list, onClose, onSaved }: { list: RecipientList | null; onClose: () => void; onSaved?: (l: RecipientList) => void }) {
  const { toast } = useFeedback();
  const data = useRecipientData();
  const existing = useTable('recipient_lists');
  const [name, setName] = useState(list?.name ?? '');
  const [f, setF] = useState<RecipientFilters>({ has_email: true, ...(list?.filters ?? {}) });
  const [nameError, setNameError] = useState<string | null>(null);
  const { busy, error, submit } = useSubmit();
  const set = <K extends keyof RecipientFilters>(k: K, v: RecipientFilters[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const matches = useMemo(() => matchRecipients(f, data.accounts, data.policies), [f, data.accounts, data.policies]);
  const stateOptions = useMemo(() => {
    const s = new Set(data.accounts.map((a) => (a.state ?? '').toUpperCase()).filter(Boolean));
    (f.states ?? []).forEach((x) => s.add(x));
    return [...s].sort();
  }, [data.accounts, f.states]);
  const lineOptions = f.account_type === 'Personal' ? PERSONAL_LINES : f.account_type === 'Commercial' ? COMMERCIAL_LINES : LINES_OF_BUSINESS;

  const save = () => {
    const n = name.trim();
    if (!n) { setNameError('List name is required'); return; }
    if (existing.data.some((l) => l.id !== list?.id && l.name.trim().toLowerCase() === n.toLowerCase())) { setNameError('A list with this name already exists'); return; }
    const filters: RecipientFilters = {
      account_type: f.account_type || null, statuses: f.statuses ?? [], lines: (f.lines ?? []).filter((l) => (lineOptions as string[]).includes(l)),
      producer: f.producer || null, states: f.states ?? [], has_email: true,
    };
    void submit(async () => {
      const row = list ? await db.update('recipient_lists', list.id, { name: n, filters }) : await db.insert('recipient_lists', { name: n, filters });
      toast(list ? 'List updated' : 'List saved');
      onSaved?.(row);
      onClose();
    });
  };

  const previewCols: Column<Account>[] = [
    { key: 'name', header: 'Name', render: (a) => <a href={href(`/accounts/${a.id}`)} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>{accountName(a)}</a> },
    { key: 'email', header: 'Email', render: (a) => <span className="text-ink-500 break-all">{a.email}</span> },
    { key: 'status', header: 'Status', className: 'hidden sm:table-cell', render: (a) => a.status ?? '—' },
    { key: 'state', header: 'State', className: 'hidden sm:table-cell', render: (a) => a.state ?? '—' },
  ];

  return (
    <Modal title={list ? 'Edit recipient list' : 'New recipient list'} size="lg" onClose={onClose} footer={<>
      <span className="mr-auto self-center text-xs text-ink-500"><b className="text-ink-900 tabular-nums">{data.loading ? '…' : matches.length}</b> matching recipient{matches.length === 1 ? '' : 's'}</span>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>{list ? 'Save changes' : 'Save list'}</Button>
    </>}>
      <div className="space-y-4">
        <ErrorBanner message={error || data.error} />
        <Field label="List name" required error={nameError}>
          <Input value={name} autoFocus onChange={(e) => { setName(e.target.value); setNameError(null); }} placeholder="e.g. Auto clients in TX" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Account type">
            <Select value={f.account_type ?? ''} onChange={(e) => set('account_type', (e.target.value || null) as AccountType | null)} placeholder="Any type" options={['Personal', 'Commercial']} />
          </Field>
          <Field label="Producer">
            <StaffSelect value={f.producer ?? null} onChange={(v) => set('producer', v)} placeholder="Any producer" />
          </Field>
        </div>
        <Field label="Account status">
          <ChipMulti options={[...ACCOUNT_STATUSES]} value={f.statuses ?? []} onChange={(v) => set('statuses', v as AccountStatus[])} empty="Any status" />
        </Field>
        <Field label="Has an active policy in" hint="Leave on “Any line” to ignore policies.">
          <ChipMulti options={lineOptions} value={(f.lines ?? []).filter((l) => (lineOptions as string[]).includes(l))} onChange={(v) => set('lines', v)} empty="Any line" />
        </Field>
        <Field label="State">
          {stateOptions.length ? <ChipMulti options={stateOptions} value={f.states ?? []} onChange={(v) => set('states', v)} empty="Any state" /> : <span className="text-xs text-ink-400">No account states on file</span>}
        </Field>
        <div className="flex items-center gap-2 text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2">
          <Mail size={13} className="text-ink-400" /> Only accounts with a valid email address are included in email lists.
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Preview</div>
          <div className="border border-ink-100 rounded">
            <DataTable columns={previewCols} rows={matches} loading={data.loading} pageSize={8} dense empty={<EmptyState icon={<Users size={20} />} title="No accounts match these filters" message="Loosen a filter to include more recipients." />} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
