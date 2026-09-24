import { Landmark, Network, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, Panel, Pills, SearchInput, Select, Textarea, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtPhone } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import type { BillingCompany, Department } from '@/lib/types';
import { AdminHeader, EMAIL_RE } from './shared';

// ── Manage Billing Companies ──

export const BILLING_TYPES = ['Premium Finance', 'Carrier Direct Bill', 'MGA / Wholesaler', 'Agency Bill'];
const TYPE_TONE: Record<string, 'blue' | 'green' | 'purple' | 'amber'> = { 'Premium Finance': 'blue', 'Carrier Direct Bill': 'green', 'MGA / Wholesaler': 'purple', 'Agency Bill': 'amber' };

export function BillingCompaniesPage() {
  const { toast, confirm } = useFeedback();
  const rows = useTable('billing_companies', { order: { column: 'name' } });
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [editing, setEditing] = useState<BillingCompany | 'new' | null>(null);

  const filtered = rows.data.filter((b) => (type === 'all' || b.company_type === type)
    && (!q.trim() || [b.name, b.email, b.phone, b.address, b.notes].some((s) => (s ?? '').toLowerCase().includes(q.trim().toLowerCase()))));

  const remove = async (b: BillingCompany) => {
    const ok = await confirm({ title: `Delete ${b.name}?`, message: 'The billing company is removed from your agency’s list.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('billing_companies', b.id); toast(`${b.name} deleted`); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<BillingCompany>[] = [
    { key: 'name', header: 'Company', sortValue: (b) => b.name.toLowerCase(), render: (b) => <div><div className="font-semibold text-ink-900">{b.name}</div>{b.address && <div className="text-xs text-ink-400">{b.address}</div>}</div> },
    { key: 'type', header: 'Type', sortValue: (b) => b.company_type, render: (b) => <Badge tone={TYPE_TONE[b.company_type] ?? 'gray'}>{b.company_type}</Badge> },
    { key: 'contact', header: 'Contact', render: (b) => <div className="text-xs">{b.phone && <div>{fmtPhone(b.phone)}</div>}{b.email && <a href={`mailto:${b.email}`} onClick={(e) => e.stopPropagation()} className="text-brand-600">{b.email}</a>}{!b.phone && !b.email && '—'}</div> },
    { key: 'notes', header: 'Notes', className: 'max-w-[320px]', render: (b) => <span className="text-xs text-ink-500 line-clamp-2">{b.notes || '—'}</span> },
    { key: 'actions', header: '', align: 'right', render: (b) => <Menu items={[{ label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(b) }, 'divider', { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(b) }]} /> },
  ];

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Manage Billing Companies" subtitle="Premium finance companies, carrier billing centers and wholesalers your agency bills through" icon={<Landmark size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add billing company</Button>} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills value={type} onChange={setType} options={[{ value: 'all', label: 'All', count: rows.data.length }, ...BILLING_TYPES.map((t) => ({ value: t, label: t, count: rows.data.filter((b) => b.company_type === t).length }))]} />
          <SearchInput className="ml-auto w-full sm:w-64" value={q} onChange={setQ} placeholder="Search name, email, notes…" />
        </div>
        <ErrorBanner message={rows.error} />
        <DataTable columns={columns} rows={filtered} loading={rows.loading} onRowClick={(b) => setEditing(b)} initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<Landmark size={22} />} title={rows.data.length ? 'No billing companies match' : 'No billing companies yet'} action={!rows.data.length ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add billing company</Button> : undefined} />} />
      </Panel>
      {editing && <BillingModal company={editing === 'new' ? null : editing} all={rows.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BillingModal({ company, all, onClose }: { company: BillingCompany | null; all: BillingCompany[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, setV] = useState({ name: company?.name ?? '', company_type: company?.company_type ?? BILLING_TYPES[0], phone: company?.phone ?? '', email: company?.email ?? '', address: company?.address ?? '', notes: company?.notes ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (val: string) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    const name = v.name.trim();
    if (!name) e.name = 'Name is required';
    else if (all.some((b) => b.id !== company?.id && b.name.toLowerCase() === name.toLowerCase())) e.name = 'A billing company with this name already exists';
    if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email';
    if (v.phone.trim() && v.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit phone number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setErr(null);
    try {
      const values = { name, company_type: v.company_type, phone: v.phone.trim() ? fmtPhone(v.phone.trim()) : null, email: v.email.trim() || null, address: v.address.trim() || null, notes: v.notes.trim() || null };
      if (company) await db.update('billing_companies', company.id, values); else await db.insert('billing_companies', values);
      toast(company ? `${name} updated` : `${name} added`);
      onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };

  return (
    <Modal title={company ? `Edit ${company.name}` : 'Add billing company'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{company ? 'Save changes' : 'Add billing company'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name" required error={errors.name} className="sm:col-span-2"><Input autoFocus value={v.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <Field label="Type" required><Select value={v.company_type} onChange={(e) => set('company_type')(e.target.value)} options={BILLING_TYPES} /></Field>
          <Field label="Phone" error={errors.phone}><Input type="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
          <Field label="Email" error={errors.email} className="sm:col-span-2"><Input type="email" value={v.email} onChange={(e) => set('email')(e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-3"><Input value={v.address} onChange={(e) => set('address')(e.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-3"><Textarea rows={3} value={v.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Payment plans, down payment rules, cancellation notice process…" /></Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Manage Departments ──

export function DepartmentsPage() {
  const { toast, confirm } = useFeedback();
  const { staff, staffColor } = useAppData();
  const rows = useTable('departments', { order: { column: 'name' } });
  const [editing, setEditing] = useState<Department | 'new' | null>(null);

  const byStaff = useMemo(() => staff.map((s) => ({ ...s, departments: rows.data.filter((d) => d.members.includes(s.name)) })), [staff, rows.data]);

  const remove = async (d: Department) => {
    const ok = await confirm({ title: `Delete ${d.name}?`, message: `${d.members.length} member${d.members.length === 1 ? '' : 's'} will no longer belong to this department. Staff accounts are not affected.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('departments', d.id); toast(`${d.name} deleted`); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<Department>[] = [
    { key: 'name', header: 'Department', sortValue: (d) => d.name.toLowerCase(), render: (d) => <div><div className="font-semibold text-ink-900">{d.name}</div>{d.description && <div className="text-xs text-ink-400">{d.description}</div>}</div> },
    { key: 'members', header: 'Members', render: (d) => <div className="flex flex-wrap gap-1">{d.members.length ? d.members.map((m) => <Badge key={m}>{m}</Badge>) : <span className="text-ink-300">—</span>}</div> },
    { key: 'count', header: 'Count', align: 'right', sortValue: (d) => d.members.length, render: (d) => <span className="tabular-nums">{d.members.length}</span> },
    { key: 'actions', header: '', align: 'right', render: (d) => <Menu items={[{ label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(d) }, 'divider', { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(d) }]} /> },
  ];

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Manage Departments" subtitle="Group staff into departments such as Personal Lines, Commercial Lines and Sales" icon={<Network size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add department</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" bodyClassName="p-0">
          <ErrorBanner message={rows.error} />
          <DataTable columns={columns} rows={rows.data} loading={rows.loading} onRowClick={(d) => setEditing(d)} initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={<Network size={22} />} title="No departments yet" action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add department</Button>} />} />
        </Panel>
        <Panel title="By staff member">
          <ul className="space-y-2.5">
            {byStaff.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5">
                <Avatar name={s.name} color={staffColor(s.name)} size={28} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink-900">{s.name} {!s.active && <Badge>Inactive</Badge>}</div>
                  <div className="text-xs text-ink-400">{s.departments.map((d) => d.name).join(', ') || 'No department'}</div>
                </div>
              </li>
            ))}
            {!byStaff.length && <li className="text-[13px] text-ink-400">No staff yet.</li>}
          </ul>
        </Panel>
      </div>
      {editing && <DepartmentModal dept={editing === 'new' ? null : editing} all={rows.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DepartmentModal({ dept, all, onClose }: { dept: Department | null; all: Department[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const { staff } = useAppData();
  const [name, setName] = useState(dept?.name ?? '');
  const [description, setDescription] = useState(dept?.description ?? '');
  const [members, setMembers] = useState<string[]>(dept?.members ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Members no longer on staff (renamed/deleted) stay listed so they can be removed.
  const names = [...new Set([...staff.map((s) => s.name), ...members])];

  const save = async () => {
    if (busy) return;
    const n = name.trim();
    if (!n) return setErr('Name is required');
    if (all.some((d) => d.id !== dept?.id && d.name.toLowerCase() === n.toLowerCase())) return setErr('A department with this name already exists');
    setBusy(true);
    setErr(null);
    try {
      const values = { name: n, description: description.trim() || null, members };
      if (dept) await db.update('departments', dept.id, values); else await db.insert('departments', values);
      toast(dept ? `${n} updated` : `${n} added`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={dept ? `Edit ${dept.name}` : 'Add department'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{dept ? 'Save changes' : 'Add department'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <Field label="Name" required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 inline-flex items-center gap-1"><Users size={12} /> Members ({members.length})</span>
            <button type="button" className="text-xs text-brand-600 bg-transparent hover:underline" onClick={() => setMembers(members.length === names.length ? [] : names)}>{members.length === names.length ? 'Clear' : 'Select all'}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-ink-100 rounded p-3">
            {names.map((n) => {
              const s = staff.find((x) => x.name === n);
              return <Checkbox key={n} label={<span>{n} <span className="text-ink-400 text-xs">{s ? s.role : '(not on staff)'}</span></span>} checked={members.includes(n)} onChange={(on) => setMembers((m) => (on ? [...m, n] : m.filter((x) => x !== n)))} />;
            })}
            {!names.length && <span className="text-[13px] text-ink-400">No staff yet.</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
