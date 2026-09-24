import { addDays, daysUntil, parseDate, today } from '@/lib/format';
import type { Activity, ActivityStatus, ActivityType, Priority } from '@/lib/types';

export const ACTIVITY_TYPES: ActivityType[] = ['Task', 'Call', 'Email', 'Meeting', 'Note', 'Renewal Review', 'Follow-up'];
export const PRIORITIES: Priority[] = ['Low', 'Normal', 'High'];
export const ACTIVITY_STATUSES: ActivityStatus[] = ['Open', 'In Progress', 'Completed'];

export type QueueView = 'my' | 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

export const QUEUE_VIEWS: { value: QueueView; label: string }[] = [
  { value: 'my', label: 'My Open' },
  { value: 'all', label: 'All Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'upcoming', label: 'Upcoming (7 days)' },
  { value: 'completed', label: 'Completed' },
];

export const isDone = (a: Pick<Activity, 'status'>) => a.status === 'Completed';

export const isOverdue = (a: Pick<Activity, 'status' | 'due_date'>) => !isDone(a) && !!a.due_date && a.due_date < today();

/** Does the activity belong in a queue view? `ignoreStatus` is used by Board/Calendar, which show every status. */
export function matchesView(a: Activity, view: QueueView, me: string | null, ignoreStatus = false) {
  const open = ignoreStatus || !isDone(a);
  const t = today();
  switch (view) {
    case 'my': return open && !!me && a.assigned_to === me;
    case 'all': return open;
    case 'overdue': return open && !!a.due_date && a.due_date < t;
    case 'today': return open && a.due_date === t;
    case 'upcoming': return open && !!a.due_date && a.due_date >= t && a.due_date <= addDays(t, 7);
    case 'completed': return isDone(a);
  }
}

/** Patch to apply when changing status: completing stamps completed_at, reopening clears it. */
export function statusPatch(status: ActivityStatus, prev?: Pick<Activity, 'status' | 'completed_at'> | null): Pick<Activity, 'status' | 'completed_at'> {
  if (status === 'Completed') return { status, completed_at: prev?.status === 'Completed' && prev.completed_at ? prev.completed_at : new Date().toISOString() };
  return { status, completed_at: null };
}

/** Epoch ms of a timestamp (Supabase returns '+00:00' offsets, local mode 'Z'); 0 when missing. */
export const timeOf = (s: string | null | undefined) => parseDate(s)?.getTime() ?? 0;

/** Start of the current week (Sunday) as a Date. */
export function startOfWeek() {
  const d = parseDate(today())!;
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function dueLabel(a: Pick<Activity, 'due_date' | 'status'>) {
  const n = daysUntil(a.due_date);
  if (n === null || isDone(a)) return null;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return `${-n}d overdue`;
  return `in ${n}d`;
}
