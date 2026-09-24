import { CalendarClock, History, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, EmptyState, ErrorBanner, LoadingBlock, Panel, Select, StatusBadge, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { logActivity } from '@/lib/domain';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import type { Activity, ActivityType } from '@/lib/types';
import { dueLabel, isDone, isOverdue, timeOf } from './constants';
import { ActivityFormModal, CompleteBox, TypeIcon } from './parts';

const LOG_TYPES: ActivityType[] = ['Note', 'Call', 'Email', 'Meeting'];

/** Activity timeline for an account and/or policy: open tasks first, then history. */
export function ActivityList({ accountId, policyId }: { accountId?: string; policyId?: string }) {
  const { me, staffColor } = useAppData();
  const { toast } = useFeedback();
  const policy = useRow('policies', policyId && !accountId ? policyId : null);
  const resolvedAccountId = accountId ?? policy.data?.account_id ?? null;

  const eq: Partial<Record<keyof Activity, string>> = {};
  if (accountId) eq.account_id = accountId;
  if (policyId) eq.policy_id = policyId;
  const list = useTable('activities', accountId || policyId ? { eq } : null);

  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState<ActivityType>('Note');
  const [saving, setSaving] = useState(false);

  const { open, history } = useMemo(() => {
    const open = list.data.filter((a) => !isDone(a)).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    const history = list.data.filter(isDone).sort((a, b) => timeOf(b.completed_at ?? b.created_at) - timeOf(a.completed_at ?? a.created_at) || timeOf(b.created_at) - timeOf(a.created_at));
    return { open, history };
  }, [list.data]);

  const addNote = async () => {
    const text = note.trim();
    if (saving) return; // Ctrl+Enter bypasses the disabled button
    if (!text) { toast('Type a note first', 'error'); return; }
    // Policy-only timelines resolve the account from the policy; don't log an orphan note before it loads.
    if (policyId && !resolvedAccountId && policy.loading) return;
    const firstLine = text.split('\n')[0].trim();
    const subject = firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine;
    setSaving(true);
    try {
      await logActivity({
        type: noteType,
        subject,
        description: text !== subject ? text : null,
        account_id: resolvedAccountId,
        policy_id: policyId ?? null,
        assigned_to: me?.name ?? null,
      });
      setNote('');
      toast(`${noteType === 'Note' ? 'Note' : noteType} logged`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (list.loading && !list.data.length) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={list.error} />
      <Panel bodyClassName="p-3">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
          placeholder="Add a note about this client… (Ctrl+Enter to save)"
          className="min-h-[60px]"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Log as</span>
          <Select className="!w-32 !h-8" value={noteType} onChange={(e) => setNoteType(e.target.value as ActivityType)} options={LOG_TYPES} aria-label="Log type" />
          <div className="ml-auto flex gap-2">
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New Task</Button>
            <Button size="sm" variant="primary" loading={saving} disabled={!note.trim()} onClick={addNote}>Add {noteType === 'Note' ? 'Note' : noteType}</Button>
          </div>
        </div>
      </Panel>

      <Panel title={<h2 className="text-[15px] font-semibold text-ink-900 flex items-center gap-2"><CalendarClock size={16} className="text-brand-500" /> Open Tasks <Badge tone="teal">{open.length}</Badge></h2>} bodyClassName="p-0">
        {open.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-ink-400 text-center">No open tasks. Nice work!</div>
        ) : (
          <ul className="divide-y divide-ink-50">
            {open.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-brand-50/40 cursor-pointer" onClick={() => setEditing(a)}>
                <span className="pt-1"><CompleteBox activity={a} /></span>
                <TypeIcon type={a.type} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-900 truncate">{a.subject}</div>
                  <div className="text-xs text-ink-400 flex flex-wrap gap-x-2">
                    <span>{a.type}</span>
                    {a.due_date && <span className={cx(isOverdue(a) && 'text-red-600 font-semibold')}>Due {fmtDate(a.due_date)} · {dueLabel(a)}</span>}
                    {a.assigned_to && <span>{a.assigned_to}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {a.priority !== 'Normal' && <StatusBadge status={a.priority} />}
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={<h2 className="text-[15px] font-semibold text-ink-900 flex items-center gap-2"><History size={16} className="text-brand-500" /> History</h2>}>
        {history.length === 0 ? (
          <EmptyState title="No history yet" message="Notes, calls, emails and completed tasks will appear here." />
        ) : (
          <ol className="relative">
            {history.map((a, i) => (
              <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < history.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-ink-100" aria-hidden />}
                <TypeIcon type={a.type} />
                <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left bg-transparent rounded hover:bg-ink-50 -mx-1.5 px-1.5 py-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold text-ink-900 break-words">{a.subject}</span>
                    <span className="text-[11px] text-ink-400" title={fmtDateTime(a.completed_at ?? a.created_at)}>{fmtRelative(a.completed_at ?? a.created_at)}</span>
                  </div>
                  {a.description && <p className="text-[13px] text-ink-600 whitespace-pre-wrap mt-0.5 break-words">{a.description}</p>}
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-ink-400">
                    {a.assigned_to && <Avatar name={a.assigned_to} color={staffColor(a.assigned_to)} size={16} />}
                    <span>{a.assigned_to ?? 'System'}</span>
                    <span>· {a.type}</span>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {editing && (
        <ActivityFormModal
          activity={editing === 'new' ? null : editing}
          defaults={{ account_id: resolvedAccountId, policy_id: policyId ?? null, type: 'Task' }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
