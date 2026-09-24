import { ArrowRight, Pencil, Shuffle, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Avatar, Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Panel, Pills, Select, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { fmtMoney } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import type { Account, AccountType, Policy, Staff, StaffRole } from '@/lib/types';

const ROLES: StaffRole[] = ['Agency Owner', 'Admin', 'Producer', 'CSR', 'Account Manager'];

type Row = Staff & { producerAccounts: number; csrAccounts: number; book: number; policies: number; rules: number };

export function TeamPage() {
  const { staff, loading } = useAppData();
  const accounts = useTable('accounts');
  const policies = useTable('policies');
  const rules = useTable('commission_rules');
  const [view, setView] = useState<'team' | 'all'>('team');
  const [editing, setEditing] = useState<Staff | null>(null);
  const [reassign, setReassign] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const am = new Map(accounts.data.map((a) => [a.id, a]));
    return staff.map((s) => {
      const book = policies.data.filter((p) => p.status === 'Active' && (p.producer || am.get(p.account_id)?.producer) === s.name);
      return {
        ...s,
        producerAccounts: accounts.data.filter((a) => a.producer === s.name).length,
        csrAccounts: accounts.data.filter((a) => a.csr === s.name).length,
        book: book.reduce((t, p) => t + Number(p.premium || 0), 0),
        policies: book.length,
        rules: rules.data.filter((r) => r.staff_name === s.name && r.active).length,
      };
    });
  }, [staff, accounts.data, policies.data, rules.data]);

  const shown = view === 'team' ? rows.filter((r) => r.service_team) : rows;

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => <div className="flex items-center gap-2 whitespace-nowrap"><Avatar name={r.name} color={r.color} size={26} /><div><div className="font-semibold text-ink-900">{r.name}</div><div className="text-xs text-ink-400">{r.email}</div></div></div> },
    { key: 'role', header: 'Role', sortValue: (r) => r.role, render: (r) => <span className="whitespace-nowrap">{r.role}</span> },
    { key: 'team', header: 'Service Team', sortValue: (r) => (r.service_team ? 1 : 0), render: (r) => (r.service_team ? <Badge tone="green">Member</Badge> : <Badge>—</Badge>) },
    { key: 'type', header: 'Type', sortValue: (r) => (r.external ? 1 : 0), render: (r) => (r.external ? <Badge tone="purple">External</Badge> : <span className="text-ink-500">Internal</span>) },
    { key: 'code', header: 'Producer code', sortValue: (r) => r.producer_code, render: (r) => r.producer_code || <span className="text-ink-300">—</span> },
    { key: 'prod', header: 'Producer of', align: 'right', sortValue: (r) => r.producerAccounts, render: (r) => r.producerAccounts },
    { key: 'csr', header: 'CSR of', align: 'right', sortValue: (r) => r.csrAccounts, render: (r) => r.csrAccounts },
    { key: 'book', header: 'Book premium', align: 'right', sortValue: (r) => r.book, render: (r) => <span className="tabular-nums" title={`${r.policies} active policies`}>{fmtMoney(r.book)}</span> },
    { key: 'rules', header: 'Rules', align: 'right', sortValue: (r) => r.rules, render: (r) => r.rules },
    { key: 'active', header: 'Status', sortValue: (r) => (r.active ? 1 : 0), render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'edit', header: '', align: 'right', render: (r) => <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={(e) => { e.stopPropagation(); setEditing(r); }}>Edit</Button> },
  ];

  return (
    <div>
      <PageHeader title="Manage Service Team" subtitle="Everyone paid commission (internal and external producers) and the CSRs tracked on commission reports" icon={<Users size={20} />}
        actions={<Button variant="primary" icon={<Shuffle size={15} />} onClick={() => setReassign(true)}>Reassign book</Button>} />
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100">
          <Pills value={view} onChange={setView} options={[{ value: 'team' as const, label: 'Service Team', count: rows.filter((r) => r.service_team).length }, { value: 'all' as const, label: 'All staff', count: rows.length }]} />
        </div>
        <div className="p-3">
          <ErrorBanner message={accounts.error || policies.error} />
          <DataTable columns={columns} rows={shown} loading={loading} dense initialSort={{ key: 'name', dir: 'asc' }} onRowClick={(r) => setEditing(r)}
            empty={<EmptyState icon={<Users size={22} />} title={view === 'team' ? 'No one is on the Service Team' : 'No staff yet'} message={view === 'team' ? 'Switch to All staff and edit a person to add them.' : 'Add users under Settings → Users.'} action={view === 'team' && rows.length ? <Button onClick={() => setView('all')}>Show all staff</Button> : undefined} />} />
        </div>
      </Panel>
      {editing && <MemberModal member={editing} onClose={() => setEditing(null)} />}
      {reassign && <ReassignModal staff={staff} accounts={accounts.data} policies={policies.data} onClose={() => setReassign(false)} />}
    </div>
  );
}

function MemberModal({ member, onClose }: { member: Staff; onClose: () => void }) {
  const { toast } = useFeedback();
  const { staff } = useAppData();
  const [role, setRole] = useState<StaffRole>(member.role);
  const [team, setTeam] = useState(member.service_team);
  const [external, setExternal] = useState(member.external);
  const [code, setCode] = useState(member.producer_code ?? '');
  const [active, setActive] = useState(member.active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);
    const c = code.trim();
    if (c && staff.some((s) => s.id !== member.id && (s.producer_code ?? '').toLowerCase() === c.toLowerCase())) return setError(`Producer code ${c} is already assigned to another team member.`);
    setBusy(true);
    try {
      await db.update('staff', member.id, { role, service_team: team, external, producer_code: c || null, active });
      toast(`${member.name} updated`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit ${member.name}`} subtitle={member.email} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>Save</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} options={ROLES} /></Field>
          <Field label="Producer code" hint="Carrier/agency code used on statements"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. P-104" /></Field>
        </div>
        <div className="flex flex-col gap-2">
          <Checkbox label="Service Team member (paid commission or tracked on commission reports)" checked={team} onChange={setTeam} />
          <Checkbox label="External producer (not an employee)" checked={external} onChange={setExternal} />
          <Checkbox label="Active" checked={active} onChange={setActive} />
        </div>
        {!team && member.service_team && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">Removing {member.name} from the Service Team keeps existing rules, but new rules can’t be assigned to them.</div>}
      </div>
    </Modal>
  );
}

function ReassignModal({ staff, accounts, policies, onClose }: { staff: Staff[]; accounts: Account[]; policies: Policy[]; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const { me } = useAppData();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asProducer, setAsProducer] = useState(true);
  const [asCsr, setAsCsr] = useState(false);
  const [type, setType] = useState<'' | AccountType>('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const running = useRef(false);

  const names = [...new Set([...staff.map((s) => s.name), ...accounts.flatMap((a) => [a.producer, a.csr]).filter((x): x is string => !!x)])].sort();
  const toOptions = staff.filter((s) => s.active && s.name !== from).map((s) => ({ value: s.name, label: `${s.name} · ${s.role}` }));
  const inScope = accounts.filter((a) => !type || (a.account_type ?? 'Personal') === type);
  const prodAccounts = asProducer ? inScope.filter((a) => a.producer === from) : [];
  const csrAccounts = asCsr ? inScope.filter((a) => a.csr === from) : [];
  const scopeIds = new Set(inScope.map((a) => a.id));
  const prodPolicies = asProducer ? policies.filter((p) => p.producer === from && scopeIds.has(p.account_id)) : [];
  const touched = new Set([...prodAccounts, ...csrAccounts].map((a) => a.id));
  const total = touched.size + prodPolicies.length;

  const submit = async () => {
    if (running.current) return;
    setError(null);
    if (!from) return setError('Choose the team member to move the book from.');
    if (!to) return setError('Choose who receives the book.');
    if (from === to) return setError('Choose two different team members.');
    if (!asProducer && !asCsr) return setError('Choose producer and/or CSR assignments to move.');
    if (!total) return setError('Nothing to reassign with these options.');
    const ok = await confirm({
      title: 'Reassign book?',
      message: `${touched.size} account${touched.size === 1 ? '' : 's'}${prodPolicies.length ? ` and ${prodPolicies.length} polic${prodPolicies.length === 1 ? 'y' : 'ies'}` : ''} will move from ${from} to ${to}${asProducer && asCsr ? ' (producer and CSR)' : asProducer ? ' (producer)' : ' (CSR)'}.`,
      confirmLabel: 'Reassign',
    });
    if (!ok) return;
    running.current = true;
    let done = 0;
    setProgress({ done, total });
    try {
      const all = new Map([...prodAccounts, ...csrAccounts].map((a) => [a.id, a]));
      for (const a of all.values()) {
        const patch: Partial<Account> = {};
        if (asProducer && a.producer === from) patch.producer = to;
        if (asCsr && a.csr === from) patch.csr = to;
        await db.update('accounts', a.id, patch);
        setProgress({ done: ++done, total });
      }
      for (const p of prodPolicies) {
        await db.update('policies', p.id, { producer: to });
        setProgress({ done: ++done, total });
      }
      await logActivity({
        subject: `Book reassigned from ${from} to ${to}`, assigned_to: me?.name ?? null,
        description: `${prodAccounts.length} producer account(s), ${csrAccounts.length} CSR account(s) and ${prodPolicies.length} policy producer assignment(s) moved${type ? ` (${type} accounts only)` : ''}.`,
      }).catch(() => {});
      toast(`Reassigned ${done} record${done === 1 ? '' : 's'} to ${to}`);
      onClose();
    } catch (e) {
      setError(`${(e as Error).message} — ${done} of ${total} updated. Run again to finish the rest.`);
      setProgress(null);
      running.current = false;
    }
  };

  const busy = progress !== null;
  return (
    <Modal title="Reassign book of business" subtitle="Move producer and/or CSR assignments between team members" size="sm" onClose={busy ? () => {} : onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" icon={<Shuffle size={14} />} loading={busy} onClick={() => void submit()}>Reassign {total ? `(${total})` : ''}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <Field label="From" required><Select value={from} disabled={busy} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(''); }} placeholder="Select…" options={names} /></Field>
          <ArrowRight size={16} className="text-ink-400 mb-2.5" />
          <Field label="To" required><Select value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} placeholder="Select…" options={toOptions} /></Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Producer assignments" checked={asProducer} disabled={busy} onChange={setAsProducer} />
          <Checkbox label="CSR assignments" checked={asCsr} disabled={busy} onChange={setAsCsr} />
        </div>
        <Field label="Accounts"><Select value={type} disabled={busy} onChange={(e) => setType(e.target.value as '' | AccountType)} options={[{ value: '', label: 'All accounts' }, { value: 'Personal', label: 'Personal accounts only' }, { value: 'Commercial', label: 'Commercial accounts only' }]} /></Field>
        {from && (
          <div className="text-xs bg-ink-50 border border-ink-100 rounded px-3 py-2 text-ink-600 space-y-0.5">
            {asProducer && <div>{prodAccounts.length} account{prodAccounts.length === 1 ? '' : 's'} where {from} is producer · {prodPolicies.length} polic{prodPolicies.length === 1 ? 'y' : 'ies'} with {from} as producer</div>}
            {asCsr && <div>{csrAccounts.length} account{csrAccounts.length === 1 ? '' : 's'} where {from} is CSR</div>}
          </div>
        )}
        {progress && (
          <div>
            <div className="h-2 rounded bg-ink-100 overflow-hidden"><div className="h-full bg-brand-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
            <div className="text-xs text-ink-500 mt-1">{progress.done} of {progress.total} updated…</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
