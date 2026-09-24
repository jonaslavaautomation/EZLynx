import { ArrowDownLeft, ArrowUpRight, Download, Mailbox, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import {
  Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, PageHeader, Panel, Pills, SearchInput, Select, Textarea, useFeedback, type Column, type Tone,
} from '@/components/ui';
import { db } from '@/lib/db';
import { accountName, downloadCsv, fmtDate, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Account, MailItem } from '@/lib/types';
import { COMM_CRUMB, useSubmit } from './parts';
import { MAIL_STATUSES, MAIL_TYPES } from './shared';

type Dir = 'All' | MailItem['direction'];
const STATUS_TONE: Record<string, Tone> = { Received: 'purple', Scanned: 'blue', Sent: 'teal', Returned: 'red', Filed: 'gray' };

export function MailboxPage() {
  const { toast, confirm } = useFeedback();
  const items = useTable('mail_items', { order: { column: 'mail_date', ascending: false } });
  const ids = useMemo(() => [...new Set(items.data.map((m) => m.account_id).filter((x): x is string => !!x))].sort(), [items.data]);
  const accounts = useTable('accounts', ids.length ? { in: { column: 'id', values: ids } } : null);
  const byId = useMemo(() => new Map<string, Account>(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const [dir, setDir] = useState<Dir>('All');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MailItem | 'new' | null>(null);

  const base = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.data.filter((m) => {
      if (status && m.status !== status) return false;
      if (type && m.mail_type !== type) return false;
      if (!t) return true;
      const a = m.account_id ? byId.get(m.account_id) : null;
      return [m.correspondent, m.description, m.mail_type, a ? accountName(a) : ''].join(' ').toLowerCase().includes(t);
    });
  }, [items.data, status, type, q, byId]);
  const rows = dir === 'All' ? base : base.filter((m) => m.direction === dir);

  const setItemStatus = async (m: MailItem, s: string) => {
    try { await db.update('mail_items', m.id, { status: s }); toast(`Marked ${s}`); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (m: MailItem) => {
    const ok = await confirm({ title: 'Delete mail item?', message: `The ${m.mail_type.toLowerCase()} from ${fmtDate(m.mail_date)} will be removed from the mailbox log.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('mail_items', m.id); toast('Mail item deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const exportCsv = () => {
    if (!rows.length) { toast('Nothing to export', 'info'); return; }
    downloadCsv('postal-mailbox.csv', rows.map((m) => ({
      date: m.mail_date, direction: m.direction, type: m.mail_type, correspondent: m.correspondent ?? '',
      applicant: m.account_id ? accountName(byId.get(m.account_id)) : '', description: m.description ?? '', status: m.status,
    })));
  };

  const columns: Column<MailItem>[] = [
    { key: 'date', header: 'Date', sortValue: (m) => m.mail_date, render: (m) => <span className="whitespace-nowrap">{fmtDate(m.mail_date)}</span> },
    {
      key: 'dir', header: 'Direction', sortValue: (m) => m.direction, render: (m) => m.direction === 'Inbound'
        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700"><ArrowDownLeft size={13} />In</span>
        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700"><ArrowUpRight size={13} />Out</span>,
    },
    { key: 'type', header: 'Type', sortValue: (m) => m.mail_type, render: (m) => m.mail_type },
    { key: 'corr', header: 'Correspondent', className: 'hidden sm:table-cell', sortValue: (m) => m.correspondent ?? '', render: (m) => m.correspondent || '—' },
    {
      key: 'app', header: 'Applicant', sortValue: (m) => (m.account_id ? accountName(byId.get(m.account_id)) : ''), render: (m) => {
        if (!m.account_id) return <span className="text-ink-300">—</span>;
        const a = byId.get(m.account_id);
        return <a href={href(`/accounts/${m.account_id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline whitespace-nowrap">{a ? accountName(a) : 'Open account'}</a>;
      },
    },
    { key: 'desc', header: 'Description', className: 'hidden lg:table-cell', render: (m) => <span className="text-ink-500 text-xs truncate block max-w-[280px]">{m.description || '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <Badge tone={STATUS_TONE[m.status] ?? 'gray'}>{m.status}</Badge> },
    {
      key: 'menu', header: '', align: 'right', render: (m) => (
        <Menu items={[
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(m) },
          'divider',
          ...MAIL_STATUSES.filter((s) => s !== m.status).map((s) => ({ label: `Mark ${s}`, onClick: () => void setItemStatus(m, s) })),
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(m) },
        ]} />
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Postal Mailbox"
        icon={<Mailbox size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle="Log paper mail the agency receives and sends — carrier notices, checks, returned mail"
        actions={<>
          <Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Log mail</Button>
        </>}
      />
      <ErrorBanner message={items.error} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills<Dir> value={dir} onChange={setDir} options={[
            { value: 'All', label: 'All', count: base.length },
            { value: 'Inbound', label: 'Inbound', count: base.filter((m) => m.direction === 'Inbound').length },
            { value: 'Outbound', label: 'Outbound', count: base.filter((m) => m.direction === 'Outbound').length },
          ]} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={MAIL_STATUSES} className="w-full sm:w-40" />
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={MAIL_TYPES} className="w-full sm:w-44" />
          <SearchInput value={q} onChange={setQ} placeholder="Search correspondent, applicant…" className="w-full sm:w-64 sm:ml-auto" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={items.loading}
          onRowClick={(m) => setEditing(m)}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={<Mailbox size={22} />} title={items.data.length ? 'No matching mail' : 'No mail logged yet'} message="Log each piece of postal mail so the team knows what arrived and where it went." action={!items.data.length && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Log mail</Button>} />}
        />
      </Panel>
      {editing && <MailModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MailModal({ item, onClose }: { item: MailItem | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, setV] = useState({
    mail_date: item?.mail_date ?? today(),
    direction: item?.direction ?? 'Inbound' as MailItem['direction'],
    mail_type: item?.mail_type ?? 'Letter',
    correspondent: item?.correspondent ?? '',
    account_id: item?.account_id ?? null as string | null,
    description: item?.description ?? '',
    status: item?.status ?? 'Received',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => { setV((cur) => ({ ...cur, [k]: val })); setErrors({}); };

  const save = () => {
    const e: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.mail_date)) e.mail_date = 'Date is required';
    else if (v.mail_date > today()) e.mail_date = 'Date cannot be in the future';
    if (!v.correspondent.trim() && !v.account_id) e.correspondent = 'Enter a correspondent or choose an applicant';
    setErrors(e);
    if (Object.keys(e).length) return;
    const values = { ...v, correspondent: v.correspondent.trim() || null, description: v.description.trim() || null };
    void submit(async () => {
      if (item) await db.update('mail_items', item.id, values);
      else await db.insert('mail_items', values);
      toast(item ? 'Mail item updated' : 'Mail logged');
      onClose();
    });
  };

  const statusOptions = v.direction === 'Inbound' ? ['Received', 'Scanned', 'Filed', 'Returned'] : ['Sent', 'Returned', 'Filed'];
  const opts = statusOptions.includes(v.status) ? statusOptions : [v.status, ...statusOptions];

  return (
    <Modal title={item ? 'Edit mail item' : 'Log postal mail'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>{item ? 'Save changes' : 'Log mail'}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date" required error={errors.mail_date}><Input type="date" max={today()} value={v.mail_date} onChange={(e) => set('mail_date')(e.target.value)} /></Field>
          <Field label="Direction">
            <Select value={v.direction} onChange={(e) => { const d = e.target.value as MailItem['direction']; setV((cur) => ({ ...cur, direction: d, status: d === 'Inbound' ? 'Received' : 'Sent' })); }} options={['Inbound', 'Outbound']} />
          </Field>
          <Field label="Type"><Select value={v.mail_type} onChange={(e) => set('mail_type')(e.target.value)} options={MAIL_TYPES.includes(v.mail_type) ? MAIL_TYPES : [v.mail_type, ...MAIL_TYPES]} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={v.direction === 'Inbound' ? 'From (correspondent)' : 'To (correspondent)'} error={errors.correspondent} hint="e.g. carrier, lienholder, client">
            <Input value={v.correspondent} onChange={(e) => set('correspondent')(e.target.value)} placeholder="e.g. Progressive" />
          </Field>
          <Field label="Status"><Select value={v.status} onChange={(e) => set('status')(e.target.value)} options={opts} /></Field>
        </div>
        <Field label="Applicant" hint="Optional — link the mail to a client account.">
          <AccountPicker value={v.account_id} onChange={(id) => set('account_id')(id)} />
        </Field>
        <Field label="Description"><Textarea value={v.description} onChange={(e) => set('description')(e.target.value)} rows={3} placeholder="What is it, and what was done with it?" /></Field>
      </div>
    </Modal>
  );
}
