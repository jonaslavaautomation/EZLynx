import { AlarmClock, CalendarDays, CheckCircle2, ClipboardList, Kanban, List, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StaffSelect } from '@/components/pickers';
import {
  Avatar, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Modal, PageHeader, Panel, Pills, SearchInput, Select, StatCard, StatusBadge, cx, useFeedback,
  type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, fmtDate, parseDate, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, setParam, useRoute } from '@/lib/router';
import type { Account, Activity, ActivityType, Policy, Priority } from '@/lib/types';
import { ACTIVITY_TYPES, PRIORITIES, QUEUE_VIEWS, dueLabel, isDone, isOverdue, matchesView, startOfWeek, statusPatch, timeOf, type QueueView } from './constants';
import { ActivityFormModal, CompleteBox, TypeIcon } from './parts';
import { BoardView, CalendarView } from './views';

type Layout = 'table' | 'board' | 'calendar';
const LAYOUT_KEY = 'northstar-ams:activities-layout';

function readLayout(): Layout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === 'board' || v === 'calendar' ? v : 'table';
  } catch { return 'table'; }
}

/** The agency work queue: tasks, calls, follow-ups and renewal reviews. */
export function ActivitiesPage() {
  const { params } = useRoute();
  const { me, staffColor } = useAppData();
  const { toast, confirm } = useFeedback();
  const view = (QUEUE_VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'my') as QueueView;
  const assignee = params.get('assignee');

  const activities = useTable('activities', { order: { column: 'due_date', ascending: true } });
  const accounts = useTable('accounts');
  const policies = useTable('policies');

  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [type, setType] = useState<ActivityType | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ activity?: Activity; defaults?: Partial<Activity> } | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ }
  };

  const lookup = useMemo(() => ({
    accounts: new Map<string, Account>(accounts.data.map((a) => [a.id, a])),
    policies: new Map<string, Policy>(policies.data.map((p) => [p.id, p])),
  }), [accounts.data, policies.data]);

  const meName = me?.name ?? null;

  // Filters other than the view.
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.data.filter((a) => {
      if (type && a.type !== type) return false;
      if (priority && a.priority !== priority) return false;
      if (assignee && a.assigned_to !== assignee) return false;
      if (q) {
        const acct = a.account_id ? lookup.accounts.get(a.account_id) : undefined;
        const pol = a.policy_id ? lookup.policies.get(a.policy_id) : undefined;
        const hay = [a.subject, a.description, acct ? accountName(acct) : '', acct?.email, pol?.policy_number].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities.data, type, priority, assignee, search, lookup]);

  const rows = useMemo(() => {
    const out = base.filter((a) => matchesView(a, view, meName));
    // The Completed view has no initial column sort: show the most recently completed first.
    return view === 'completed' ? out.sort((a, b) => timeOf(b.completed_at) - timeOf(a.completed_at)) : out;
  }, [base, view, meName]);
  const boardRows = useMemo(() => base.filter((a) => matchesView(a, view, meName, true)), [base, view, meName]);

  const stats = useMemo(() => {
    const t = today();
    const weekStart = startOfWeek().getTime();
    const open = base.filter((a) => !isDone(a));
    return {
      open: open.length,
      overdue: open.filter(isOverdue).length,
      today: open.filter((a) => a.due_date === t).length,
      completedWeek: base.filter((a) => isDone(a) && a.type !== 'Note' && (parseDate(a.completed_at)?.getTime() ?? 0) >= weekStart).length,
    };
  }, [base]);

  const viewOptions = QUEUE_VIEWS.map((v) => ({ ...v, count: base.filter((a) => matchesView(a, v.value, meName)).length }));

  // Drop selections that are no longer visible.
  useEffect(() => {
    setSelected((s) => {
      const visible = new Set(rows.map((r) => r.id));
      const next = new Set([...s].filter((id) => visible.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

  const toggleSel = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const bulk = async (label: string, fn: (a: Activity) => Promise<unknown>) => {
    setBulkBusy(true);
    try {
      await Promise.all(selectedRows.map(fn));
      toast(label);
      setSelected(new Set());
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkComplete = () => {
    const pending = selectedRows.filter((a) => !isDone(a));
    if (!pending.length) { toast('Selected activities are already completed', 'info'); return; }
    bulk(`${pending.length} ${pending.length === 1 ? 'activity' : 'activities'} completed`, (a) => (isDone(a) ? Promise.resolve() : db.update('activities', a.id, statusPatch('Completed', a))));
  };

  const bulkDelete = async () => {
    const n = selectedRows.length;
    const ok = await confirm({ title: `Delete ${n} ${n === 1 ? 'activity' : 'activities'}?`, message: 'This permanently removes the selected activities.', confirmLabel: 'Delete', danger: true });
    if (ok) bulk(`${n} ${n === 1 ? 'activity' : 'activities'} deleted`, (a) => db.remove('activities', a.id));
  };

  const columns: Column<Activity>[] = [
    {
      key: 'sel', header: '', className: 'w-8',
      render: (a) => <input type="checkbox" aria-label="Select row" className="w-4 h-4 accent-[#dc2626] cursor-pointer align-middle" checked={selected.has(a.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => toggleSel(a.id, e.target.checked)} />,
    },
    { key: 'done', header: 'Done', className: 'w-10', align: 'center', render: (a) => <CompleteBox activity={a} /> },
    {
      key: 'subject', header: 'Subject', sortValue: (a) => a.subject.toLowerCase(),
      render: (a) => (
        <div className="flex items-center gap-2 min-w-[200px]">
          <TypeIcon type={a.type} size={24} />
          <div className="min-w-0">
            <div className={cx('font-semibold truncate max-w-[320px]', isDone(a) ? 'text-ink-400 line-through' : 'text-ink-900')}>{a.subject}</div>
            <div className="text-xs text-ink-400">{a.type}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'insured', header: 'Insured', sortValue: (a) => (a.account_id ? accountName(lookup.accounts.get(a.account_id)) : ''),
      render: (a) => {
        const acct = a.account_id ? lookup.accounts.get(a.account_id) : undefined;
        return acct ? <a href={href(`/accounts/${acct.id}`)} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline whitespace-nowrap">{accountName(acct)}</a> : <span className="text-ink-300">—</span>;
      },
    },
    {
      key: 'policy', header: 'Policy #',
      render: (a) => {
        const p = a.policy_id ? lookup.policies.get(a.policy_id) : undefined;
        return p ? <a href={href(`/policies/${p.id}`)} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline whitespace-nowrap">{p.policy_number}</a> : <span className="text-ink-300">—</span>;
      },
    },
    {
      key: 'due', header: 'Due', sortValue: (a) => a.due_date,
      render: (a) => a.due_date ? (
        <div className={cx('whitespace-nowrap', isOverdue(a) ? 'text-red-600 font-semibold' : 'text-ink-800')}>
          {fmtDate(a.due_date)}
          {dueLabel(a) && <div className={cx('text-[11px]', isOverdue(a) ? 'text-red-500' : 'text-ink-400 font-normal')}>{dueLabel(a)}</div>}
        </div>
      ) : <span className="text-ink-300">—</span>,
    },
    { key: 'priority', header: 'Priority', sortValue: (a) => PRIORITIES.indexOf(a.priority), render: (a) => <StatusBadge status={a.priority} /> },
    {
      key: 'assignee', header: 'Assigned', sortValue: (a) => a.assigned_to,
      render: (a) => a.assigned_to ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={a.assigned_to}>
          <Avatar name={a.assigned_to} color={staffColor(a.assigned_to)} size={22} />
          <span className="hidden xl:inline text-ink-600">{a.assigned_to}</span>
        </span>
      ) : <span className="text-ink-300 text-xs">Unassigned</span>,
    },
    { key: 'status', header: 'Status', sortValue: (a) => a.status, render: (a) => <StatusBadge status={a.status} /> },
  ];

  const filtersActive = !!(type || priority || assignee || search);
  const openNew = (defaults?: Partial<Activity>) => setEditing({ defaults: { type: 'Task', ...defaults } });

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Tasks, calls, follow-ups and renewal reviews across the agency"
        icon={<ClipboardList size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => openNew()}>New Activity</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Open" value={stats.open} icon={<ClipboardList size={18} />} onClick={() => setParam('view', 'all')} />
        <StatCard label="Overdue" value={stats.overdue} tone="red" icon={<AlarmClock size={18} />} onClick={() => setParam('view', 'overdue')} />
        <StatCard label="Due Today" value={stats.today} tone="amber" icon={<CalendarDays size={18} />} onClick={() => setParam('view', 'today')} />
        <StatCard label="Completed This Week" value={stats.completedWeek} tone="green" icon={<CheckCircle2 size={18} />} onClick={() => setParam('view', 'completed')} />
      </div>

      <ErrorBanner message={activities.error} />

      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 p-3 border-b border-ink-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Pills options={viewOptions} value={view} onChange={(v) => setParam('view', v === 'my' ? null : v)} />
            <div className="inline-flex bg-ink-50 border border-ink-100 rounded p-0.5" role="group" aria-label="Layout">
              {([['table', 'List', <List key="l" size={14} />], ['board', 'Board', <Kanban key="b" size={14} />], ['calendar', 'Calendar', <CalendarDays key="c" size={14} />]] as const).map(([val, label, icon]) => (
                <button key={val} type="button" onClick={() => setLayout(val)} aria-pressed={layout === val} className={cx('inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-semibold', layout === val ? 'bg-white text-brand-600 shadow-sm' : 'bg-transparent text-ink-500 hover:text-ink-800')}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_160px_140px_200px_auto] gap-2 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search subject, insured or policy #…" />
            <Select value={type} onChange={(e) => setType(e.target.value as ActivityType | '')} placeholder="All types" options={ACTIVITY_TYPES} aria-label="Type filter" />
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} placeholder="All priorities" options={PRIORITIES} aria-label="Priority filter" />
            <StaffSelect value={assignee} onChange={(n) => setParam('assignee', n)} placeholder="All assignees" />
            {filtersActive ? <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => { setType(''); setPriority(''); setSearch(''); setParam('assignee', null); }}>Clear</Button> : <span />}
          </div>
        </div>

        {layout === 'table' && (
          <>
            {rows.length > 0 && (
              <div className={cx('flex flex-wrap items-center gap-2 px-3 py-2 border-b border-ink-100', selected.size > 0 && 'bg-brand-50/60')}>
                <Checkbox label={selected.size > 0 ? `${selected.size} selected` : `Select all ${rows.length}`} checked={allSelected} onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />
                {selected.size > 0 && (
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <Button size="sm" icon={<CheckCircle2 size={13} />} loading={bulkBusy} onClick={bulkComplete}>Complete</Button>
                    <Button size="sm" icon={<UserPlus size={13} />} disabled={bulkBusy} onClick={() => setReassigning(true)}>Reassign</Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 size={13} />} disabled={bulkBusy} onClick={bulkDelete}>Delete</Button>
                  </div>
                )}
              </div>
            )}
            <DataTable
              key={view}
              columns={columns}
              rows={rows}
              loading={activities.loading && !activities.data.length}
              onRowClick={(a) => setEditing({ activity: a })}
              initialSort={view === 'completed' ? undefined : { key: 'due', dir: 'asc' }}
              empty={<EmptyState icon={<CheckCircle2 size={22} />} title={view === 'completed' ? 'No completed activities' : 'Queue is clear'} message={filtersActive ? 'No activities match your filters.' : 'Nothing in this view right now.'} action={<Button icon={<Plus size={14} />} onClick={() => openNew()}>New Activity</Button>} />}
            />
          </>
        )}
        {layout === 'board' && <div className="p-3"><BoardView rows={boardRows} lookup={lookup} onEdit={(a) => setEditing({ activity: a })} /></div>}
        {layout === 'calendar' && <div className="p-3"><CalendarView rows={boardRows} lookup={lookup} onEdit={(a) => setEditing({ activity: a })} onCreate={(date) => openNew({ due_date: date })} /></div>}
      </Panel>

      {editing && <ActivityFormModal activity={editing.activity} defaults={editing.defaults} onClose={() => setEditing(null)} />}
      {reassigning && (
        <ReassignModal
          count={selectedRows.length}
          onClose={() => setReassigning(false)}
          onApply={async (name) => {
            setReassigning(false);
            await bulk(`${selectedRows.length} reassigned to ${name ?? 'Unassigned'}`, (a) => db.update('activities', a.id, { assigned_to: name }));
          }}
        />
      )}
    </div>
  );
}

function ReassignModal({ count, onClose, onApply }: { count: number; onClose: () => void; onApply: (name: string | null) => void }) {
  const { me } = useAppData();
  const [name, setName] = useState<string | null>(me?.name ?? null);
  return (
    <Modal
      title="Reassign Activities"
      subtitle={`${count} selected`}
      size="sm"
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onApply(name)}>Reassign</Button>
      </>}
    >
      <Field label="Assign To" hint="Leave blank to unassign.">
        <StaffSelect value={name} onChange={setName} />
      </Field>
    </Modal>
  );
}
