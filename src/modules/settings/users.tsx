import { Check, Pencil, Plus, Power, Trash2, UserCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, Panel, Select, useFeedback, useForm, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import type { Staff, StaffRole } from '@/lib/types';
import { renameSessionUser } from '@/modules/usersettings/session';
import { renameWhere } from './rename';

const ROLES: StaffRole[] = ['Agency Owner', 'Admin', 'Producer', 'CSR', 'Account Manager'];
const PALETTE = ['#684ec2', '#0f8a7e', '#d9622b', '#2f6fbd', '#b23a6e', '#dc2626', '#991b1b', '#c0392b', '#3d7d3a', '#b7791f', '#7a1b20', '#1f5f99'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** When a staff member is renamed, carry the new name to every record that references staff by name. */
async function renameStaffReferences(oldName: string, newName: string) {
  await renameWhere('accounts', 'producer', oldName, newName);
  await renameWhere('accounts', 'csr', oldName, newName);
  await renameWhere('policies', 'producer', oldName, newName);
  await renameWhere('activities', 'assigned_to', oldName, newName);
  await renameWhere('agency_settings', 'current_user_name', oldName, newName);
  // Name-keyed personal data: sign-in (password / 2FA), history, commission splits, training, reports, apps.
  await renameWhere('user_settings', 'staff_name', oldName, newName);
  await renameWhere('login_events', 'staff_name', oldName, newName);
  await renameWhere('commission_rules', 'staff_name', oldName, newName);
  await renameWhere('training_progress', 'staff_name', oldName, newName);
  await renameWhere('training_registrations', 'staff_name', oldName, newName);
  await renameWhere('saved_reports', 'owner', oldName, newName);
  await renameWhere('integrations', 'activated_by', oldName, newName);
  await renameWhere('support_tickets', 'requester', oldName, newName);
  for (const d of await db.list('departments')) {
    if (d.members.includes(oldName)) await db.update('departments', d.id, { members: d.members.map((m) => (m === oldName ? newName : m)) });
  }
  renameSessionUser(oldName, newName);
}

export function UsersTab() {
  const { toast, confirm } = useFeedback();
  const { me } = useAppData();
  const staff = useTable('staff', { order: { column: 'name' } });
  const accounts = useTable('accounts');
  const activities = useTable('activities');
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { accounts: number; open: number }>();
    const get = (n: string) => { let s = m.get(n); if (!s) { s = { accounts: 0, open: 0 }; m.set(n, s); } return s; };
    accounts.data.forEach((a) => {
      const names = new Set([a.producer, a.csr].filter(Boolean) as string[]);
      names.forEach((n) => get(n).accounts++);
    });
    activities.data.forEach((t) => { if (t.assigned_to && t.status !== 'Completed') get(t.assigned_to).open++; });
    return m;
  }, [accounts.data, activities.data]);

  const toggleActive = async (s: Staff) => {
    if (s.active && s.id === me?.id) { toast('You can’t deactivate the current user. Switch "Acting as" first.', 'error'); return; }
    try {
      await db.update('staff', s.id, { active: !s.active });
      toast(`${s.name} ${s.active ? 'deactivated' : 'reactivated'}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const remove = async (s: Staff) => {
    if (s.id === me?.id) { toast('You can’t delete the current user.', 'error'); return; }
    const st = stats.get(s.name);
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      message: <>This removes the user permanently.{st && (st.accounts || st.open) ? <> They are still assigned to <b>{st.accounts}</b> accounts and <b>{st.open}</b> open activities, which will keep showing their name. Consider deactivating instead.</> : null}</>,
      confirmLabel: 'Delete user', danger: true,
    });
    if (!ok) return;
    try {
      await db.remove('staff', s.id);
      toast(`${s.name} deleted`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<Staff>[] = [
    {
      key: 'name', header: 'Name', sortValue: (s) => s.name,
      render: (s) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={s.name} color={s.color} size={30} />
          <div className="min-w-0">
            <div className="font-semibold text-ink-900 truncate flex items-center gap-1.5">{s.name}{s.id === me?.id && <Badge tone="teal">You</Badge>}</div>
            <div className="text-xs text-ink-400 truncate">{s.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', sortValue: (s) => s.role, render: (s) => s.role },
    { key: 'status', header: 'Status', sortValue: (s) => (s.active ? 0 : 1), render: (s) => <Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'accts', header: 'Accounts', align: 'right', sortValue: (s) => stats.get(s.name)?.accounts ?? 0, render: (s) => <span className="tabular-nums">{stats.get(s.name)?.accounts ?? 0}</span> },
    { key: 'open', header: 'Open tasks', align: 'right', sortValue: (s) => stats.get(s.name)?.open ?? 0, render: (s) => <span className="tabular-nums">{stats.get(s.name)?.open ?? 0}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (s) => (
        <Menu items={[
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(s) },
          { label: s.active ? 'Deactivate' : 'Reactivate', icon: <Power size={14} />, onClick: () => toggleActive(s), disabled: s.active && s.id === me?.id },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => remove(s), danger: true, disabled: s.id === me?.id },
        ]} />
      ),
    },
  ];

  return (
    <Panel title="Users" actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add user</Button>} bodyClassName="p-0">
      <ErrorBanner message={staff.error} />
      <DataTable columns={columns} rows={staff.data} loading={staff.loading} onRowClick={(s) => setEditing(s)} initialSort={{ key: 'name', dir: 'asc' }}
        empty={<EmptyState icon={<Users size={22} />} title="No users yet" message="Add the producers, CSRs and account managers who work in your agency." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add user</Button>} />} />
      {editing && <StaffModal staff={editing === 'new' ? null : editing} all={staff.data} isMe={editing !== 'new' && editing.id === me?.id} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function StaffModal({ staff, all, isMe, onClose }: { staff: Staff | null; all: Staff[]; isMe: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, set] = useForm({
    name: staff?.name ?? '', email: staff?.email ?? '', role: (staff?.role ?? 'CSR') as StaffRole, active: staff?.active ?? true,
    color: staff?.color ?? PALETTE[all.length % PALETTE.length],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renamed = !!staff && v.name.trim() !== staff.name;

  const save = async () => {
    const e: Record<string, string> = {};
    const name = v.name.trim(), email = v.email.trim();
    if (!name) e.name = 'Name is required';
    else if (all.some((s) => s.id !== staff?.id && s.name.toLowerCase() === name.toLowerCase())) e.name = 'Another user already has this name';
    if (!email) e.email = 'Email is required';
    else if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email';
    else if (all.some((s) => s.id !== staff?.id && s.email.toLowerCase() === email.toLowerCase())) e.email = 'Another user already uses this email';
    if (isMe && !v.active) e.active = 'The current user must stay active';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      const values = { name, email, role: v.role, active: v.active, color: v.color };
      if (staff) {
        await db.update('staff', staff.id, values);
        if (renamed) await renameStaffReferences(staff.name, name);
        toast(`${name} updated`);
      } else {
        await db.insert('staff', values);
        toast(`${name} added`);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={staff ? `Edit ${staff.name}` : 'Add user'} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{staff ? 'Save changes' : 'Add user'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="flex items-center gap-3">
          <Avatar name={v.name || '?'} color={v.color} size={44} />
          <div className="text-xs text-ink-400">Avatar preview</div>
        </div>
        <Field label="Full name" required error={errors.name} hint={renamed ? 'Accounts, policies and activities assigned to the old name will be updated.' : undefined}>
          <Input value={v.name} onChange={(e) => set('name')(e.target.value)} autoFocus />
        </Field>
        <Field label="Email" required error={errors.email}><Input type="email" value={v.email} onChange={(e) => set('email')(e.target.value)} /></Field>
        <Field label="Role"><Select value={v.role} onChange={(e) => set('role')(e.target.value as StaffRole)} options={ROLES} /></Field>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Avatar color</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar color">
            {PALETTE.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} onClick={() => set('color')(c)}
                className="w-7 h-7 rounded-full grid place-items-center ring-offset-2 focus:outline-none focus:ring-2 focus:ring-brand-300" style={{ background: c }}>
                {v.color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Checkbox label={<span className="inline-flex items-center gap-1"><UserCheck size={14} className="text-ink-400" /> Active (can be assigned work)</span>} checked={v.active} disabled={isMe && v.active} onChange={set('active')} />
          {isMe && <div className="text-[11px] text-ink-400 mt-1">This is the current user, so they must stay active.</div>}
          {errors.active && <div className="text-[11px] text-red-600 mt-1">{errors.active}</div>}
        </div>
      </div>
    </Modal>
  );
}
