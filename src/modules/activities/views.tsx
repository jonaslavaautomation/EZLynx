import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { Avatar, Badge, Button, IconButton, Panel, StatusBadge, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, fmtDate, fmtRelative, parseDate, toISODate, today } from '@/lib/format';
import { href } from '@/lib/router';
import type { Account, Activity, ActivityStatus } from '@/lib/types';
import { ACTIVITY_STATUSES, dueLabel, isDone, isOverdue, statusPatch, timeOf } from './constants';
import { TypeIcon } from './parts';

type Lookup = { accounts: Map<string, Account> };

function useMove() {
  const { toast } = useFeedback();
  return async (a: Activity, status: ActivityStatus) => {
    if (a.status === status) return;
    try {
      await db.update('activities', a.id, statusPatch(status, a));
      toast(`Moved to ${status}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
}

// ── Board ──

const COLUMN_STYLE: Record<ActivityStatus, string> = {
  Open: 'border-t-sky-500',
  'In Progress': 'border-t-amber-500',
  Completed: 'border-t-emerald-500',
};
const COMPLETED_CAP = 30;

export function BoardView({ rows, lookup, onEdit }: { rows: Activity[]; lookup: Lookup; onEdit: (a: Activity) => void }) {
  const move = useMove();
  const { staffColor } = useAppData();
  const [over, setOver] = useState<ActivityStatus | null>(null);

  const columns = useMemo(() => ACTIVITY_STATUSES.map((status) => {
    let items = rows.filter((r) => r.status === status);
    if (status === 'Completed') items = items.sort((a, b) => timeOf(b.completed_at) - timeOf(a.completed_at));
    else items = items.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    return { status, total: items.length, items: status === 'Completed' ? items.slice(0, COMPLETED_CAP) : items };
  }), [rows]);

  const onDrop = (e: DragEvent, status: ActivityStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const a = rows.find((r) => r.id === id);
    if (a) move(a, status);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {columns.map((col, ci) => (
        <div
          key={col.status}
          onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
          onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
          onDrop={(e) => onDrop(e, col.status)}
          className={cx('bg-ink-50 border border-ink-100 border-t-4 rounded min-h-[160px] flex flex-col', COLUMN_STYLE[col.status], over === col.status && 'ring-2 ring-brand-300 bg-brand-50/50')}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{col.status}</span>
            <Badge>{col.total}</Badge>
          </div>
          <div className="flex-1 px-2 pb-2 space-y-2 max-h-[calc(var(--vh100)*0.65)] overflow-y-auto">
            {col.items.length === 0 && <div className="text-xs text-ink-400 text-center py-6">Drop tasks here</div>}
            {col.items.map((a) => {
              const acct = a.account_id ? lookup.accounts.get(a.account_id) : undefined;
              return (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => onEdit(a)}
                  className="bg-white border border-[#e3e3e3] rounded shadow-card p-2.5 cursor-pointer hover:border-brand-200"
                >
                  <div className="flex items-start gap-2">
                    <TypeIcon type={a.type} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink-900 leading-snug break-words">{a.subject}</div>
                      {acct && <a href={href(`/accounts/${acct.id}`)} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 hover:underline truncate block">{accountName(acct)}</a>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {a.assigned_to && <span title={a.assigned_to}><Avatar name={a.assigned_to} color={staffColor(a.assigned_to)} size={20} /></span>}
                    {a.priority !== 'Normal' && <StatusBadge status={a.priority} />}
                    <span className={cx('text-[11px]', isOverdue(a) ? 'text-red-600 font-semibold' : 'text-ink-400')}>
                      {isDone(a) ? `Done ${fmtRelative(a.completed_at)}` : a.due_date ? `${fmtDate(a.due_date)} · ${dueLabel(a)}` : 'No due date'}
                    </span>
                    <span className="ml-auto flex">
                      {ci > 0 && <IconButton label={`Move to ${ACTIVITY_STATUSES[ci - 1]}`} className="!w-6 !h-6" onClick={(e) => { e.stopPropagation(); move(a, ACTIVITY_STATUSES[ci - 1]); }}><ArrowLeft size={13} /></IconButton>}
                      {ci < ACTIVITY_STATUSES.length - 1 && <IconButton label={`Move to ${ACTIVITY_STATUSES[ci + 1]}`} className="!w-6 !h-6" onClick={(e) => { e.stopPropagation(); move(a, ACTIVITY_STATUSES[ci + 1]); }}><ArrowRight size={13} /></IconButton>}
                    </span>
                  </div>
                </div>
              );
            })}
            {col.total > col.items.length && <div className="text-[11px] text-ink-400 text-center py-1">Showing {col.items.length} most recent of {col.total}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Calendar ──

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({ rows, lookup, onEdit, onCreate }: { rows: Activity[]; lookup: Lookup; onEdit: (a: Activity) => void; onCreate: (date: string) => void }) {
  const [month, setMonth] = useState(() => { const d = parseDate(today())!; d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(today());
  const t = today();

  const byDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    rows.forEach((a) => { if (a.due_date) m.set(a.due_date, [...(m.get(a.due_date) ?? []), a]); });
    m.forEach((list) => list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.subject.localeCompare(b.subject)));
    return m;
  }, [rows]);
  const undated = rows.filter((a) => !a.due_date).length;

  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const weeks = Math.ceil((month.getDay() + last.getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => { const d = parseDate(t)!; d.setDate(1); setMonth(d); setSelected(t); };
  const selectedList = selected ? byDay.get(selected) ?? [] : [];

  const chipCls = (a: Activity) => isDone(a) ? 'bg-emerald-50 text-emerald-700 line-through' : isOverdue(a) ? 'bg-red-50 text-red-700' : a.status === 'In Progress' ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700';

  return (
    <div className="space-y-3">
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-ink-100">
          <IconButton label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={16} /></IconButton>
          <div className="text-[15px] font-semibold text-ink-900 min-w-[140px] text-center">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
          <IconButton label="Next month" onClick={() => shift(1)}><ChevronRight size={16} /></IconButton>
          <Button size="sm" onClick={goToday}>Today</Button>
          {undated > 0 && <span className="ml-auto text-xs text-ink-400">{undated} without a due date not shown</span>}
        </div>
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/60">
          {WEEKDAYS.map((d) => <div key={d} className="px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const iso = toISODate(d);
            const list = byDay.get(iso) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            const hasOverdue = list.some(isOverdue);
            return (
              <div
                key={iso}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(iso)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(iso); } }}
                className={cx('min-h-[56px] sm:min-h-[96px] border-b border-r border-ink-50 p-1 text-left cursor-pointer hover:bg-brand-50/40 outline-none focus-visible:ring-2 focus-visible:ring-brand-300', !inMonth && 'bg-ink-50/50', selected === iso && 'bg-brand-50 ring-1 ring-inset ring-brand-300')}
              >
                <div className="flex items-center justify-between">
                  <span className={cx('text-xs w-6 h-6 grid place-items-center rounded-full', iso === t ? 'bg-brand-500 text-white font-semibold' : inMonth ? 'text-ink-800' : 'text-ink-300')}>{d.getDate()}</span>
                  {list.length > 0 && <span className={cx('sm:hidden text-[10px] font-semibold rounded-full px-1.5', hasOverdue ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700')}>{list.length}</span>}
                </div>
                <div className="hidden sm:block space-y-0.5 mt-0.5">
                  {list.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                      title={a.subject}
                      className={cx('w-full truncate text-left text-[11px] leading-4 px-1 py-px rounded', chipCls(a))}
                    >
                      {a.subject}
                    </button>
                  ))}
                  {list.length > 3 && <div className="text-[10px] text-ink-400 px-1">+{list.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {selected && (
        <Panel
          title={`Due ${parseDate(selected)!.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
          actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => onCreate(selected)}>Add Task</Button>}
          bodyClassName="p-0"
        >
          {selectedList.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-ink-400 text-center">Nothing due this day.</div>
          ) : (
            <ul className="divide-y divide-ink-50">
              {selectedList.map((a) => {
                const acct = a.account_id ? lookup.accounts.get(a.account_id) : undefined;
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => onEdit(a)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left bg-transparent hover:bg-brand-50/40">
                      <TypeIcon type={a.type} />
                      <div className="min-w-0 flex-1">
                        <div className={cx('text-[13px] font-semibold truncate', isDone(a) ? 'text-ink-400 line-through' : 'text-ink-900')}>{a.subject}</div>
                        <div className="text-xs text-ink-400 truncate">{[acct ? accountName(acct) : null, a.assigned_to].filter(Boolean).join(' · ') || a.type}</div>
                      </div>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
