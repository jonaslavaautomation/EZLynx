import { AlertTriangle, Pencil, Plus, Power, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, PageHeader, Panel, Pills, Select, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import { LINES_OF_BUSINESS, type CommissionRule } from '@/lib/types';
import { overAllocatedScopes, parseAmount } from './shared';

const BUSINESS_TYPES: CommissionRule['business_type'][] = ['All', 'New Business', 'Renewal'];

export function RulesPage() {
  const { toast, confirm } = useFeedback();
  const { staff } = useAppData();
  const rules = useTable('commission_rules', { order: { column: 'staff_name' } });
  const [view, setView] = useState<'all' | 'active' | 'inactive'>('all');
  const [member, setMember] = useState('');
  const [editing, setEditing] = useState<CommissionRule | 'new' | null>(null);

  const warnings = useMemo(() => overAllocatedScopes(rules.data), [rules.data]);
  const rows = rules.data.filter((r) => (view === 'all' || (view === 'active' ? r.active : !r.active)) && (!member || r.staff_name === member));
  const members = [...new Set(rules.data.map((r) => r.staff_name))].sort();
  const roleOf = (name: string) => staff.find((s) => s.name === name);

  const toggle = async (r: CommissionRule) => {
    try { await db.update('commission_rules', r.id, { active: !r.active }); toast(r.active ? 'Rule deactivated' : 'Rule activated'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (r: CommissionRule) => {
    const ok = await confirm({ title: 'Delete rule?', message: `“${r.name}” (${r.staff_name}, ${r.split_percent}%) will be deleted. Open statements will be re-run without it.`, confirmLabel: 'Delete rule', danger: true });
    if (!ok) return;
    try { await db.remove('commission_rules', r.id); toast('Rule deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<CommissionRule>[] = [
    { key: 'name', header: 'Rule', sortValue: (r) => r.name, render: (r) => <button type="button" className="font-semibold text-brand-600 hover:underline bg-transparent text-left" onClick={() => setEditing(r)}>{r.name}</button> },
    { key: 'staff', header: 'Team member', sortValue: (r) => r.staff_name, render: (r) => { const s = roleOf(r.staff_name); return <span className="whitespace-nowrap">{r.staff_name}{s && <span className="text-ink-400"> · {s.role}{s.external ? ' (external)' : ''}</span>}{!s && <Badge tone="red" className="ml-1">Not on staff</Badge>}</span>; } },
    { key: 'type', header: 'Business', sortValue: (r) => r.business_type, render: (r) => <Badge tone={r.business_type === 'New Business' ? 'green' : r.business_type === 'Renewal' ? 'teal' : 'gray'}>{r.business_type}</Badge> },
    { key: 'lob', header: 'Line', sortValue: (r) => r.line_of_business, render: (r) => r.line_of_business ?? <span className="text-ink-400">Any</span> },
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.carrier, render: (r) => r.carrier ?? <span className="text-ink-400">Any</span> },
    { key: 'split', header: 'Split', align: 'right', sortValue: (r) => Number(r.split_percent), render: (r) => <span className="tabular-nums font-semibold">{Number(r.split_percent)}%</span> },
    { key: 'active', header: 'Status', sortValue: (r) => (r.active ? 1 : 0), render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (r) => <Menu items={[
      { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
      { label: r.active ? 'Deactivate' : 'Activate', icon: <Power size={14} />, onClick: () => void toggle(r) },
      'divider',
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(r) },
    ]} /> },
  ];

  return (
    <div>
      <PageHeader title="Service Team Rules" subtitle="Commission splits paid to producers and CSRs on the policies they are assigned to" icon={<Scale size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New rule</Button>} />
      {warnings.length > 0 && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> Splits can exceed 100% of the commission</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {warnings.slice(0, 6).map((w) => <li key={w.scope}>{w.scope}: {w.members.join(' + ')} = <b>{w.total}%</b></li>)}
            {warnings.length > 6 && <li>…and {warnings.length - 6} more scopes</li>}
          </ul>
        </div>
      )}
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100 flex flex-wrap gap-2 items-center">
          <Pills value={view} onChange={setView} options={[
            { value: 'all' as const, label: 'All', count: rules.data.length },
            { value: 'active' as const, label: 'Active', count: rules.data.filter((r) => r.active).length },
            { value: 'inactive' as const, label: 'Inactive', count: rules.data.filter((r) => !r.active).length },
          ]} />
          <Select className="sm:w-56" value={member} onChange={(e) => setMember(e.target.value)} placeholder="All team members" options={members} aria-label="Team member" />
        </div>
        <div className="p-3">
          <ErrorBanner message={rules.error} />
          <DataTable columns={columns} rows={rows} loading={rules.loading} dense initialSort={{ key: 'staff', dir: 'asc' }}
            empty={<EmptyState icon={<Scale size={22} />} title={rules.data.length ? 'No rules match' : 'No Service Team Rules yet'} message={rules.data.length ? 'Change the filters.' : 'Create a rule for each producer or CSR who earns a share of the agency commission.'} action={!rules.data.length ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New rule</Button> : undefined} />} />
          <div className="text-xs text-ink-400 px-3 pt-2">
            A rule pays its team member when they are the policy’s producer or the account’s CSR. When several rules apply to the same member, the most specific one (carrier, then line, then business type) is used. Open statements recalculate automatically when rules change. Only members of the <a href={href('/policy-mgmt/team')} className="text-brand-600 hover:underline">Service Team</a> can have rules.
          </div>
        </div>
      </Panel>
      {editing && <RuleModal rule={editing === 'new' ? null : editing} rules={rules.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleModal({ rule, rules, onClose }: { rule: CommissionRule | null; rules: CommissionRule[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const { staff, carriers } = useAppData();
  const [name, setName] = useState(rule?.name ?? '');
  const [member, setMember] = useState(rule?.staff_name ?? '');
  const [type, setType] = useState<CommissionRule['business_type']>(rule?.business_type ?? 'All');
  const [line, setLine] = useState(rule?.line_of_business ?? '');
  const [carrier, setCarrier] = useState(rule?.carrier ?? '');
  const [split, setSplit] = useState(rule ? String(rule.split_percent) : '');
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const team = staff.filter((s) => s.service_team);
  const memberOptions = team.map((s) => ({ value: s.name, label: `${s.name} · ${s.role}${s.external ? ' (external)' : ''}${s.active ? '' : ' — inactive'}` }));
  if (member && !team.some((s) => s.name === member)) memberOptions.unshift({ value: member, label: `${member} (not on Service Team)` });
  const pct = parseAmount(split);
  const suggested = member ? `${member} — ${type === 'All' ? 'All business' : type}${line ? ` · ${line}` : ''}${carrier ? ` · ${carrier}` : ''}` : '';

  const draft: CommissionRule | null = member && pct !== null ? {
    id: rule?.id ?? '__draft', created_at: '', name: name || suggested, staff_name: member, business_type: type, line_of_business: line || null, carrier: carrier || null, split_percent: pct, active,
  } : null;
  const warnings = (() => {
    if (!draft || !draft.active) return [];
    const others = rules.filter((r) => r.id !== draft.id);
    const before = new Set(overAllocatedScopes(others).map((w) => w.scope));
    return overAllocatedScopes([...others, draft]).filter((w) => !before.has(w.scope) || w.members.some((m) => m.startsWith(`${member} `)));
  })();
  const duplicate = rules.find((r) => r.id !== rule?.id && r.active && active && r.staff_name === member && r.business_type === type && (r.line_of_business ?? '') === line && (r.carrier ?? '') === carrier);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!member) return setError('Choose the team member.');
    if (!team.some((s) => s.name === member) && member !== rule?.staff_name) return setError('Only Service Team members can have commission rules.');
    if (pct === null || pct < 0 || pct > 100) return setError('Split must be a percentage between 0 and 100.');
    if (duplicate) return setError(`${member} already has an active rule for this exact scope (“${duplicate.name}”). Edit that rule instead.`);
    setBusy(true);
    try {
      const values = { name: name.trim() || suggested, staff_name: member, business_type: type, line_of_business: line || null, carrier: carrier || null, split_percent: pct, active };
      if (rule) await db.update('commission_rules', rule.id, values);
      else await db.insert('commission_rules', values);
      toast(rule ? 'Rule updated' : 'Rule created');
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={rule ? 'Edit Service Team rule' : 'New Service Team rule'} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>{rule ? 'Save rule' : 'Create rule'}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Team member" required hint={!team.length ? 'No staff are on the Service Team — add them under Manage Service Team.' : undefined}>
          <Select value={member} onChange={(e) => setMember(e.target.value)} placeholder="Select a team member" options={memberOptions} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Business type" required><Select value={type} onChange={(e) => setType(e.target.value as CommissionRule['business_type'])} options={BUSINESS_TYPES} /></Field>
          <Field label="Split %" required hint="Share of the agency commission"><Input value={split} inputMode="decimal" placeholder="e.g. 40" onChange={(e) => setSplit(e.target.value)} /></Field>
          <Field label="Line of business"><Select value={line} onChange={(e) => setLine(e.target.value)} placeholder="Any line" options={LINES_OF_BUSINESS} /></Field>
          <Field label="Carrier"><Select value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Any carrier" options={[...new Set([...carriers.map((c) => c.name), ...(carrier ? [carrier] : [])])]} /></Field>
        </div>
        <Field label="Rule name" hint={!name.trim() && suggested ? `Defaults to “${suggested}”` : undefined}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || 'e.g. Producer new business'} /></Field>
        <Checkbox label="Active" checked={active} onChange={setActive} />
        {pct !== null && (pct < 0 || pct > 100) && <div className="text-xs text-red-600">Split must be between 0 and 100%.</div>}
        {warnings.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> With this rule, splits for the same scope can exceed 100%:</div>
            <ul className="mt-1 space-y-0.5">{warnings.slice(0, 4).map((w) => <li key={w.scope}>{w.scope}: {w.members.join(' + ')} = {w.total}%</li>)}</ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
