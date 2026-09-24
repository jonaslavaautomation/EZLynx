import { CheckSquare, CornerUpRight, Mail, Phone, RefreshCw, StickyNote, Trash2, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AccountPicker, PolicySelect, StaffSelect } from '@/components/pickers';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, cx, useFeedback, useForm } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDateTime, today } from '@/lib/format';
import type { Activity, ActivityStatus, ActivityType, Priority } from '@/lib/types';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, PRIORITIES, isDone, statusPatch } from './constants';

const TYPE_META: Record<ActivityType, { icon: (s: number) => ReactNode; cls: string }> = {
  Task: { icon: (s) => <CheckSquare size={s} />, cls: 'bg-brand-50 text-brand-600' },
  Call: { icon: (s) => <Phone size={s} />, cls: 'bg-sky-50 text-sky-600' },
  Email: { icon: (s) => <Mail size={s} />, cls: 'bg-violet-50 text-violet-600' },
  Meeting: { icon: (s) => <Users size={s} />, cls: 'bg-amber-50 text-amber-600' },
  Note: { icon: (s) => <StickyNote size={s} />, cls: 'bg-ink-100 text-ink-600' },
  'Renewal Review': { icon: (s) => <RefreshCw size={s} />, cls: 'bg-emerald-50 text-emerald-600' },
  'Follow-up': { icon: (s) => <CornerUpRight size={s} />, cls: 'bg-orange-50 text-orange-600' },
};

/** Round colored icon for an activity type. */
export function TypeIcon({ type, size = 26 }: { type: ActivityType; size?: number }) {
  const meta = TYPE_META[type] ?? TYPE_META.Task;
  return (
    <span title={type} className={cx('inline-grid place-items-center rounded-full shrink-0', meta.cls)} style={{ width: size, height: size }}>
      {meta.icon(Math.round(size * 0.52))}
    </span>
  );
}

/** Inline "complete" checkbox that toggles an activity between Completed and Open. */
export function CompleteBox({ activity, label }: { activity: Activity; label?: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const done = isDone(activity);
  const toggle = async () => {
    setBusy(true);
    try {
      await db.update('activities', activity.id, statusPatch(done ? 'Open' : 'Completed', activity));
      toast(done ? 'Activity reopened' : 'Activity completed');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <input
      type="checkbox"
      aria-label={label ?? (done ? 'Reopen activity' : 'Mark complete')}
      title={done ? 'Reopen' : 'Mark complete'}
      className="w-4 h-4 accent-[#dc2626] cursor-pointer align-middle"
      checked={done}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={toggle}
    />
  );
}

type FormValues = {
  type: ActivityType;
  subject: string;
  description: string;
  account_id: string | null;
  policy_id: string | null;
  due_date: string;
  priority: Priority;
  status: ActivityStatus;
  assigned_to: string | null;
};

/** Create or edit an activity. `defaults` prefill a new one (e.g. account/policy from the current screen). */
export function ActivityFormModal({ activity, defaults, onClose, onSaved }: { activity?: Activity | null; defaults?: Partial<Activity>; onClose: () => void; onSaved?: (a: Activity) => void }) {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const src: Partial<Activity> = activity ?? defaults ?? {};
  const [v, set] = useForm<FormValues>({
    type: src.type ?? 'Task',
    subject: src.subject ?? '',
    description: src.description ?? '',
    account_id: src.account_id ?? null,
    policy_id: src.policy_id ?? null,
    due_date: activity ? activity.due_date ?? '' : src.due_date ?? today(),
    priority: src.priority ?? 'Normal',
    status: src.status ?? 'Open',
    assigned_to: activity ? activity.assigned_to : src.assigned_to !== undefined ? src.assigned_to : me?.name ?? null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return; // Enter-to-submit bypasses the loading button
    const errs: typeof errors = {};
    if (!v.subject.trim()) errs.subject = 'Subject is required';
    else if (v.subject.trim().length > 200) errs.subject = 'Keep the subject under 200 characters';
    if (v.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.due_date)) errs.due_date = 'Enter a valid date';
    if (v.policy_id && !v.account_id) errs.policy_id = 'Choose an account for this policy';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const values: Partial<Activity> = {
        type: v.type,
        subject: v.subject.trim(),
        description: v.description.trim() || null,
        account_id: v.account_id,
        policy_id: v.account_id ? v.policy_id : null,
        due_date: v.due_date || null,
        priority: v.priority,
        assigned_to: v.assigned_to,
        ...statusPatch(v.status, activity),
      };
      const saved = activity ? await db.update('activities', activity.id, values) : await db.insert('activities', values);
      toast(activity ? 'Activity updated' : 'Activity created');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!activity) return;
    const ok = await confirm({ title: 'Delete activity?', message: `“${activity.subject}” will be permanently removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await db.remove('activities', activity.id);
      toast('Activity deleted');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Modal
      title={activity ? 'Edit Activity' : 'New Activity'}
      subtitle={activity ? `Created ${fmtDateTime(activity.created_at)}${activity.completed_at ? ` · Completed ${fmtDateTime(activity.completed_at)}` : ''}` : undefined}
      onClose={onClose}
      footer={<>
        {activity && <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" icon={<Trash2 size={14} />} onClick={remove}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{activity ? 'Save Changes' : 'Create Activity'}</Button>
      </>}
    >
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <div className="sm:col-span-2"><ErrorBanner message={error} /></div>}
        <Field label="Type">
          <Select value={v.type} onChange={(e) => set('type')(e.target.value as ActivityType)} options={ACTIVITY_TYPES} />
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status')(e.target.value as ActivityStatus)} options={ACTIVITY_STATUSES} />
        </Field>
        <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
          <Input autoFocus value={v.subject} maxLength={220} onChange={(e) => set('subject')(e.target.value)} placeholder="e.g. Call insured about renewal options" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={v.description} onChange={(e) => set('description')(e.target.value)} placeholder="Details, call notes, next steps…" />
        </Field>
        <Field label="Account" className="sm:col-span-2">
          <AccountPicker value={v.account_id} onChange={(id) => { set('account_id')(id); set('policy_id')(null); }} />
        </Field>
        <Field label="Policy" error={errors.policy_id} className="sm:col-span-2">
          <PolicySelect accountId={v.account_id} value={v.policy_id} onChange={set('policy_id')} />
        </Field>
        <Field label="Due Date" error={errors.due_date}>
          <Input type="date" value={v.due_date} onChange={(e) => set('due_date')(e.target.value)} />
        </Field>
        <Field label="Priority">
          <Select value={v.priority} onChange={(e) => set('priority')(e.target.value as Priority)} options={PRIORITIES} />
        </Field>
        <Field label="Assigned To" className="sm:col-span-2">
          <StaffSelect value={v.assigned_to} onChange={set('assigned_to')} />
        </Field>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}
