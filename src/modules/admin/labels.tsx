import { Check, Eye, EyeOff, Megaphone, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Menu, Modal, Panel, Pills, Textarea, cx, useFeedback, type Column } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Label, LeadSource } from '@/lib/types';
import { AdminHeader, LABEL_COLORS, LabelChip } from './shared';
import { DEFAULT_LEAD_SOURCES } from './sample';

// ── Manage Labels ──

export function LabelsPage() {
  const { toast, confirm } = useFeedback();
  const labels = useTable('labels', { order: { column: 'name' } });
  const accounts = useTable('accounts');
  const workflows = useTable('automation_workflows');
  const [editing, setEditing] = useState<Label | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    accounts.data.forEach((a) => (a.labels ?? []).forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)));
    return m;
  }, [accounts.data]);

  const remove = async (l: Label) => {
    if (busyId) return;
    const n = usage.get(l.id) ?? 0;
    const wfs = workflows.data.filter((w) => w.trigger_config?.label_id === l.id || w.steps.some((s) => s.label_id === l.id));
    const ok = await confirm({
      title: `Delete label “${l.name}”?`, danger: true, confirmLabel: 'Delete label',
      message: <div className="space-y-2">
        <p>{n ? <>The label is removed from <b>{n}</b> account{n === 1 ? '' : 's'}.</> : 'No accounts use this label.'} This can’t be undone.</p>
        {wfs.length > 0 && <p className="text-amber-700">Used by automation workflow{wfs.length === 1 ? '' : 's'}: {wfs.map((w) => w.name).join(', ')}. Those triggers will stop matching and “Add Label” steps will fail until edited.</p>}
      </div>,
    });
    if (!ok) return;
    setBusyId(l.id);
    try {
      const fresh = await db.list('accounts');
      const using = fresh.filter((a) => (a.labels ?? []).includes(l.id));
      for (const a of using) await db.update('accounts', a.id, { labels: a.labels.filter((x) => x !== l.id) });
      await db.remove('labels', l.id);
      toast(`Label deleted${using.length ? ` and removed from ${using.length} account${using.length === 1 ? '' : 's'}` : ''}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<Label>[] = [
    { key: 'name', header: 'Label', sortValue: (l) => l.name.toLowerCase(), render: (l) => <LabelChip name={l.name} color={l.color} /> },
    { key: 'desc', header: 'Description', render: (l) => <span className="text-ink-600">{l.description || '—'}</span> },
    { key: 'used', header: 'Accounts', align: 'right', sortValue: (l) => usage.get(l.id) ?? 0, render: (l) => (usage.get(l.id) ? <a className="text-brand-600 hover:underline tabular-nums" href={href(`/accounts?label=${l.id}`)} onClick={(e) => e.stopPropagation()}>{usage.get(l.id)}</a> : <span className="text-ink-400">0</span>) },
    { key: 'created', header: 'Created', sortValue: (l) => l.created_at, render: (l) => fmtDate(l.created_at) },
    {
      key: 'actions', header: '', align: 'right',
      render: (l) => <Menu items={[
        { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(l) },
        'divider',
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, disabled: busyId === l.id, onClick: () => void remove(l) },
      ]} />,
    },
  ];

  return (
    <div className="max-w-5xl">
      <AdminHeader title="Manage Labels" subtitle="Labels that mirror your agency’s structure — used to filter applicants and trigger workflows" icon={<Tag size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add label</Button>} />
      <Panel bodyClassName="p-0">
        <ErrorBanner message={labels.error} />
        <DataTable columns={columns} rows={labels.data} loading={labels.loading} onRowClick={(l) => setEditing(l)} initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<Tag size={22} />} title="No labels yet" message="Create labels such as VIP Client or Renewal Risk, then assign them from an applicant’s header." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add label</Button>} />} />
      </Panel>
      {editing && <LabelModal label={editing === 'new' ? null : editing} all={labels.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LabelModal({ label, all, onClose }: { label: Label | null; all: Label[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? LABEL_COLORS[0]);
  const [description, setDescription] = useState(label?.description ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const n = name.trim();
    if (!n) return setErr('Name is required');
    if (n.length > 40) return setErr('Keep label names under 40 characters');
    if (all.some((l) => l.id !== label?.id && l.name.toLowerCase() === n.toLowerCase())) return setErr('A label with this name already exists');
    if (!/^#[0-9a-f]{6}$/i.test(color)) return setErr('Choose a color');
    setBusy(true);
    setErr(null);
    try {
      const values = { name: n, color, description: description.trim() || null };
      if (label) await db.update('labels', label.id, values); else await db.insert('labels', values);
      toast(label ? 'Label updated' : `Label “${n}” created`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={label ? 'Edit label' : 'Add label'} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{label ? 'Save changes' : 'Add label'}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorBanner message={err} />
        <Field label="Name" required><Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className={cx('w-7 h-7 rounded-full grid place-items-center text-white', color === c && 'ring-2 ring-offset-2 ring-ink-400')} style={{ background: c }}>
                {color === c && <Check size={14} />}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="text-xs text-ink-400">Preview: <LabelChip name={name.trim() || 'Label'} color={color} /></div>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}

// ── Manage Lead Sources ──

type LsFilter = 'all' | 'visible' | 'hidden';

export function LeadSourcesPage() {
  const { toast, confirm } = useFeedback();
  const sources = useTable('lead_sources', { order: { column: 'created_at' } });
  const accounts = useTable('accounts');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<LsFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    accounts.data.forEach((a) => { if (a.lead_source) { const k = a.lead_source.toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1); } });
    return m;
  }, [accounts.data]);
  const used = (s: LeadSource) => usage.get(s.name.toLowerCase()) ?? 0;

  const rows = sources.data.filter((s) => filter === 'all' || (filter === 'hidden') === s.hidden);

  const toggle = async (s: LeadSource) => {
    if (busy) return;
    setBusy(s.id);
    try {
      await db.update('lead_sources', s.id, { hidden: !s.hidden });
      toast(`${s.name} ${s.hidden ? 'shown' : 'hidden'}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const remove = async (s: LeadSource) => {
    if (busy) return;
    const ok = await confirm({ title: `Delete “${s.name}”?`, message: 'This custom lead source is not used by any account and will be removed permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusy(s.id);
    try {
      const inUse = (await db.list('accounts')).some((a) => (a.lead_source ?? '').toLowerCase() === s.name.toLowerCase());
      if (inUse) throw new Error(`${s.name} is now used by an account — hide it instead.`);
      await db.remove('lead_sources', s.id);
      toast(`${s.name} deleted`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const loadDefaults = async () => {
    if (busy) return;
    setBusy('defaults');
    try {
      const existing = new Set(sources.data.map((s) => s.name.toLowerCase()));
      const add = DEFAULT_LEAD_SOURCES.filter((n) => !existing.has(n.toLowerCase()));
      await db.insertMany('lead_sources', add.map((name) => ({ name, is_default: true, hidden: false })));
      toast(`${add.length} default lead source${add.length === 1 ? '' : 's'} added`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const columns: Column<LeadSource>[] = [
    { key: 'name', header: 'Lead source', sortValue: (s) => s.name.toLowerCase(), render: (s) => <span className={cx('font-semibold', s.hidden ? 'text-ink-400' : 'text-ink-900')}>{s.name}</span> },
    { key: 'type', header: 'Type', sortValue: (s) => (s.is_default ? 0 : 1), render: (s) => (s.is_default ? <Badge tone="blue">Default</Badge> : <Badge>Custom</Badge>) },
    { key: 'status', header: 'Status', sortValue: (s) => (s.hidden ? 1 : 0), render: (s) => (s.hidden ? <Badge tone="gray"><EyeOff size={10} /> Hidden</Badge> : <Badge tone="green"><Eye size={10} /> Visible</Badge>) },
    { key: 'used', header: 'Accounts', align: 'right', sortValue: used, render: (s) => <span className="tabular-nums">{used(s)}</span> },
    { key: 'added', header: 'Added', sortValue: (s) => s.created_at, render: (s) => fmtDate(s.created_at) },
    {
      key: 'actions', header: '', align: 'right',
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" loading={busy === s.id} icon={s.hidden ? <Eye size={13} /> : <EyeOff size={13} />} onClick={() => void toggle(s)}>{s.hidden ? 'Show' : 'Hide'}</Button>
          {!s.is_default && used(s) === 0 && <IconButton label={`Delete ${s.name}`} onClick={() => void remove(s)}><Trash2 size={14} /></IconButton>}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl">
      <AdminHeader title="Manage Lead Sources" subtitle="Where applicants come from — shown in the applicant form and lead source reports" icon={<Megaphone size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add Lead Source</Button>} />
      <div className="text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2 mb-3">
        Default lead sources can be hidden but not removed. Once added, a lead source <b>can’t be edited or renamed</b> — hide it and add a new one instead. Custom sources no account uses can be deleted.
      </div>
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: sources.data.length },
            { value: 'visible', label: 'Visible', count: sources.data.filter((s) => !s.hidden).length },
            { value: 'hidden', label: 'Hidden', count: sources.data.filter((s) => s.hidden).length },
          ]} />
        </div>
        <ErrorBanner message={sources.error} />
        <DataTable columns={columns} rows={rows} loading={sources.loading} initialSort={{ key: 'type', dir: 'asc' }}
          empty={<EmptyState icon={<Megaphone size={22} />} title={sources.data.length ? 'No lead sources match' : 'No lead sources set up'} message={sources.data.length ? undefined : 'The applicant form uses the built-in list until lead sources are set up here.'}
            action={!sources.data.length ? <Button loading={busy === 'defaults'} onClick={() => void loadDefaults()}>Load default lead sources</Button> : undefined} />} />
      </Panel>
      {adding && <AddLeadSourceModal all={sources.data} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddLeadSourceModal({ all, onClose }: { all: LeadSource[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setErr('Name is required');
    if (n.length > 60) return setErr('Keep it under 60 characters');
    if (all.some((s) => s.name.toLowerCase() === n.toLowerCase())) return setErr('That lead source already exists (it may be hidden)');
    setBusy(true);
    setErr(null);
    try {
      const fresh = await db.list('lead_sources');
      if (fresh.some((s) => s.name.toLowerCase() === n.toLowerCase())) throw new Error('That lead source already exists');
      await db.insert('lead_sources', { name: n, is_default: false, hidden: false });
      toast(`Lead source “${n}” added`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add Lead Source" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Add Lead Source</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorBanner message={err} />
        <Field label="Lead source name" required hint="Check the spelling — lead sources can’t be renamed after they are added.">
          <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chamber of Commerce" />
        </Field>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}
