import { Building2, Download, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, Panel, Pills, SearchInput, useFeedback, useForm, type Column } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtMoney } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { COMMERCIAL_LINES, LINES_OF_BUSINESS, PERSONAL_LINES, type Carrier, type LineOfBusiness } from '@/lib/types';
import { renameWhere } from './rename';

type Filter = 'all' | 'appointed' | 'not';

export function CarriersTab() {
  const { toast, confirm } = useFeedback();
  const carriers = useTable('carriers', { order: { column: 'name' } });
  const policies = useTable('policies');
  const [editing, setEditing] = useState<Carrier | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const stats = useMemo(() => {
    const m = new Map<string, { policies: number; active: number; premium: number }>();
    policies.data.forEach((p) => {
      const s = m.get(p.carrier) ?? { policies: 0, active: 0, premium: 0 };
      s.policies++;
      if (p.status === 'Active') { s.active++; s.premium += Number(p.premium); }
      m.set(p.carrier, s);
    });
    return m;
  }, [policies.data]);

  const rows = carriers.data.filter((c) => (filter === 'all' || (filter === 'appointed') === c.appointed)
    && (!q.trim() || [c.name, c.naic].some((s) => (s ?? '').toLowerCase().includes(q.trim().toLowerCase()))));

  const remove = async (c: Carrier) => {
    const n = stats.get(c.name)?.policies ?? 0;
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: n ? `${n} policies are written with this carrier. They keep the carrier name, but the carrier will no longer appear in pickers or rating. Consider marking it not appointed instead.` : 'This removes the carrier from your agency.',
      confirmLabel: 'Delete carrier', danger: true,
    });
    if (!ok) return;
    try {
      await db.remove('carriers', c.id);
      toast(`${c.name} deleted`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const toggle = async (c: Carrier, field: 'appointed' | 'downloads_enabled') => {
    try {
      await db.update('carriers', c.id, { [field]: !c[field] });
      toast(`${c.name}: ${field === 'appointed' ? (c.appointed ? 'not appointed' : 'appointed') : (c.downloads_enabled ? 'downloads disabled' : 'downloads enabled')}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<Carrier>[] = [
    {
      key: 'name', header: 'Carrier', sortValue: (c) => c.name,
      render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">{c.name}</div>
          <div className="text-xs text-ink-400">{c.naic ? `NAIC ${c.naic}` : 'No NAIC'}{c.phone ? ` · ${c.phone}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'lines', header: 'Lines', className: 'max-w-[280px]',
      render: (c) => <div className="flex flex-wrap gap-1">{c.lines.slice(0, 4).map((l) => <Badge key={l}>{l}</Badge>)}{c.lines.length > 4 && <Badge tone="gray">+{c.lines.length - 4}</Badge>}{!c.lines.length && <span className="text-ink-300">—</span>}</div>,
    },
    { key: 'rate', header: 'Commission', align: 'right', sortValue: (c) => Number(c.commission_rate), render: (c) => <span className="tabular-nums">{Number(c.commission_rate)}%</span> },
    { key: 'status', header: 'Status', sortValue: (c) => (c.appointed ? 0 : 1), render: (c) => <div className="flex flex-wrap gap-1"><Badge tone={c.appointed ? 'green' : 'gray'}>{c.appointed ? 'Appointed' : 'Not appointed'}</Badge>{c.downloads_enabled && <Badge tone="blue"><Download size={10} /> Downloads</Badge>}</div> },
    { key: 'pols', header: 'Policies', align: 'right', sortValue: (c) => stats.get(c.name)?.policies ?? 0, render: (c) => { const s = stats.get(c.name); return <span className="tabular-nums">{s?.active ?? 0}<span className="text-ink-400"> / {s?.policies ?? 0}</span></span>; } },
    { key: 'prem', header: 'Active premium', align: 'right', sortValue: (c) => stats.get(c.name)?.premium ?? 0, render: (c) => <span className="tabular-nums font-semibold">{fmtMoney(stats.get(c.name)?.premium ?? 0)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (c) => (
        <Menu items={[
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(c) },
          ...(c.website ? [{ label: 'Open website', icon: <ExternalLink size={14} />, onClick: () => window.open(c.website!, '_blank', 'noopener') }] : []),
          { label: c.appointed ? 'Mark not appointed' : 'Mark appointed', onClick: () => toggle(c, 'appointed') },
          { label: c.downloads_enabled ? 'Disable downloads' : 'Enable downloads', onClick: () => toggle(c, 'downloads_enabled') },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => remove(c), danger: true },
        ]} />
      ),
    },
  ];

  return (
    <Panel title="Carriers" actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add carrier</Button>} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
        <Pills value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: carriers.data.length },
          { value: 'appointed', label: 'Appointed', count: carriers.data.filter((c) => c.appointed).length },
          { value: 'not', label: 'Not appointed', count: carriers.data.filter((c) => !c.appointed).length },
        ]} />
        <SearchInput className="ml-auto w-full sm:w-56" value={q} onChange={setQ} placeholder="Search name or NAIC…" />
      </div>
      <ErrorBanner message={carriers.error} />
      <DataTable columns={columns} rows={rows} loading={carriers.loading} onRowClick={(c) => setEditing(c)} initialSort={{ key: 'name', dir: 'asc' }}
        empty={<EmptyState icon={<Building2 size={22} />} title={carriers.data.length ? 'No carriers match' : 'No carriers yet'} message="Add the carriers your agency is appointed with." action={!carriers.data.length ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add carrier</Button> : undefined} />} />
      {editing && <CarrierModal carrier={editing === 'new' ? null : editing} all={carriers.data} policyCount={editing === 'new' ? 0 : stats.get(editing.name)?.policies ?? 0} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function CarrierModal({ carrier, all, policyCount, onClose }: { carrier: Carrier | null; all: Carrier[]; policyCount: number; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, set] = useForm({
    name: carrier?.name ?? '', naic: carrier?.naic ?? '', lines: (carrier?.lines ?? []) as LineOfBusiness[], commission_rate: String(carrier?.commission_rate ?? 12),
    phone: carrier?.phone ?? '', website: carrier?.website ?? '', appointed: carrier?.appointed ?? true, downloads_enabled: carrier?.downloads_enabled ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renamed = !!carrier && v.name.trim() !== carrier.name;

  const toggleLine = (l: LineOfBusiness, on: boolean) => set('lines')(on ? LINES_OF_BUSINESS.filter((x) => x === l || v.lines.includes(x)) : v.lines.filter((x) => x !== l));
  const setGroup = (group: LineOfBusiness[], on: boolean) => set('lines')(LINES_OF_BUSINESS.filter((x) => (group.includes(x) ? on : v.lines.includes(x))));

  const save = async () => {
    const e: Record<string, string> = {};
    const name = v.name.trim();
    const rate = Number(v.commission_rate);
    if (!name) e.name = 'Name is required';
    else if (all.some((c) => c.id !== carrier?.id && c.name.toLowerCase() === name.toLowerCase())) e.name = 'A carrier with this name already exists';
    if (v.naic && !/^\d{5}$/.test(v.naic.trim())) e.naic = 'NAIC codes are 5 digits';
    if (v.commission_rate === '' || !(rate >= 0 && rate <= 100)) e.commission_rate = 'Enter 0–100';
    let website = v.website.trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (website) { try { new URL(website); } catch { e.website = 'Enter a valid URL'; } }
    if (!v.lines.length) e.lines = 'Choose at least one line of business';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      const values = { name, naic: v.naic.trim() || null, lines: v.lines, commission_rate: rate, phone: v.phone.trim() || null, website: website || null, appointed: v.appointed, downloads_enabled: v.downloads_enabled };
      if (carrier) {
        await db.update('carriers', carrier.id, values);
        if (renamed) await renameWhere('policies', 'carrier', carrier.name, name);
        toast(`${name} updated`);
      } else {
        await db.insert('carriers', values);
        toast(`${name} added`);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, lines: LineOfBusiness[]) => {
    const allOn = lines.every((l) => v.lines.includes(l));
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-ink-600">{title}</span>
          <button type="button" className="text-xs text-brand-600 bg-transparent hover:underline" onClick={() => setGroup(lines, !allOn)}>{allOn ? 'Clear' : 'Select all'}</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {lines.map((l) => <Checkbox key={l} label={l} checked={v.lines.includes(l)} onChange={(on) => toggleLine(l, on)} />)}
        </div>
      </div>
    );
  };

  return (
    <Modal title={carrier ? `Edit ${carrier.name}` : 'Add carrier'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{carrier ? 'Save changes' : 'Add carrier'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Carrier name" required error={errors.name} className="sm:col-span-2" hint={renamed && policyCount ? `${policyCount} policies will be updated to the new name.` : undefined}>
            <Input value={v.name} onChange={(e) => set('name')(e.target.value)} autoFocus />
          </Field>
          <Field label="NAIC code" error={errors.naic}><Input value={v.naic} inputMode="numeric" maxLength={5} onChange={(e) => set('naic')(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Commission %" required error={errors.commission_rate}><Input type="number" min="0" max="100" step="0.5" value={v.commission_rate} onChange={(e) => set('commission_rate')(e.target.value)} /></Field>
          <Field label="Phone"><Input type="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
          <Field label="Website" error={errors.website}><Input value={v.website} placeholder="https://" onChange={(e) => set('website')(e.target.value)} /></Field>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Lines of business<span className="text-red-500"> *</span></span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-ink-100 rounded p-3">
            {group('Personal lines', PERSONAL_LINES)}
            {group('Commercial lines', COMMERCIAL_LINES)}
          </div>
          {errors.lines && <span className="block text-[11px] text-red-600 mt-1">{errors.lines}</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label="Appointed (available for new business & rating)" checked={v.appointed} onChange={set('appointed')} />
          <Checkbox label="Policy downloads enabled" checked={v.downloads_enabled} onChange={set('downloads_enabled')} />
        </div>
      </div>
    </Modal>
  );
}
