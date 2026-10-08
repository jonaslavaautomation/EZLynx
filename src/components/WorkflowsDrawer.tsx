import { ChevronDown, ChevronUp, History, ListPlus, Play, Workflow, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import { cx, useFeedback } from '@/components/ui';
import { accountName, fmtDateTime } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { navigate, useRoute } from '@/lib/router';
import type { AutomationRun, AutomationWorkflow } from '@/lib/types';
import { describeTrigger, processDueRuns, startWorkflow } from '@/modules/admin/automation-engine';

/*
 * Workflows panel (top bar workflow icon), as in EZLynx: docked on the right, with the applicant it applies to
 * (defaults to the applicant being viewed), three actions (workflows to run · run history · new workflow), and an
 * accordion per workflow with "View workflow" (opens it in the Automation Center) and "Start workflow"
 * (starts it for the selected applicant; step 1 runs now or after its delay, later steps follow their delays).
 */

type View = 'run' | 'history';

/** Applicant id from the current page (/accounts/:id/...), if any. */
function useRouteAccountId() {
  const { path } = useRoute();
  const m = path.match(/^\/accounts\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function WorkflowsDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useFeedback();
  const routeAccount = useRouteAccountId();
  const [accountId, setAccountId] = useState<string | null>(routeAccount);
  const [view, setView] = useState<View>('run');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const account = useRow('accounts', accountId);
  const workflows = useTable('automation_workflows', { order: { column: 'created_at' } });
  const runs = useTable('automation_runs', accountId ? { eq: { account_id: accountId }, order: { column: 'due_at', ascending: false } } : null);

  // Opening another applicant while the panel is open switches the panel to it.
  useEffect(() => { if (routeAccount) setAccountId(routeAccount); }, [routeAccount]);
  useEffect(() => {
    // Let open modals handle Escape first.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = useMemo(() => workflows.data.filter((w) => w.active && w.steps.length > 0)
    .sort((a, b) => Number(b.trigger === 'Manual') - Number(a.trigger === 'Manual') || a.name.localeCompare(b.name)), [workflows.data]);
  const byId = useMemo(() => new Map(workflows.data.map((w) => [w.id, w])), [workflows.data]);
  const inProgress = (wf: AutomationWorkflow) => runs.data.some((r) => r.workflow_id === wf.id && r.status === 'Pending');

  const start = async (wf: AutomationWorkflow) => {
    if (!accountId || !account.data) { toast('Choose an applicant first', 'error'); return; }
    if (inProgress(wf)) { toast(`“${wf.name}” is already in progress for ${accountName(account.data)}`, 'info'); return; }
    setBusy(wf.id);
    try {
      const run = await startWorkflow(wf, accountId);
      if (new Date(run.due_at).getTime() <= Date.now()) await processDueRuns();
      const later = Number(wf.steps[0]?.delay_days) || 0;
      toast(`Workflow “${wf.name}” started for ${accountName(account.data)}${later ? ` — step 1 runs in ${later} day${later === 1 ? '' : 's'}` : ''}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const actionBtn = (label: string, icon: React.ReactNode, selected: boolean, onClick: () => void) => (
    <button type="button" aria-label={label} title={label} aria-pressed={selected} onClick={onClick}
      className={cx('w-11 h-11 rounded-full grid place-items-center transition-colors', selected ? 'bg-ink-100 text-ink-900' : 'bg-transparent text-ink-800 hover:bg-ink-50')}>
      {icon}
    </button>
  );

  return (
    <aside className="notif-panel theme-quote" aria-label="Workflows" data-testid="workflows-drawer">
      <div className="flex items-center justify-between h-[34px] px-2.5 bg-[#263238] text-white">
        <span className="text-[13px] font-semibold">Workflows</span>
        <button type="button" aria-label="Close workflows" onClick={onClose} className="bg-transparent text-white"><X size={20} /></button>
      </div>
      <div className="px-2.5 pt-2.5">
        <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setOpen(null); }} placeholder="Choose an applicant…" />
      </div>
      <div className="flex items-center justify-around px-2.5 py-2 border-b border-ink-200">
        {actionBtn('Workflows to run', <Play size={26} className="fill-current" />, view === 'run', () => setView('run'))}
        {actionBtn('Workflow history', <History size={26} />, view === 'history', () => setView('history'))}
        {actionBtn('Create workflow', <ListPlus size={28} className="text-brand-600" />, false, () => navigate('/admin/automation?new=1'))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'run' ? (
          <ul data-testid="workflow-list">
            {workflows.loading && !workflows.data.length && <li className="px-3 py-6 text-[13px] text-ink-400">Loading workflows…</li>}
            {!workflows.loading && !active.length && (
              <li className="px-3 py-6 text-[13px] text-ink-600">
                No active workflows yet. <button type="button" onClick={() => navigate('/admin/automation?new=1')} className="bg-transparent text-brand-600 font-semibold">Create a workflow</button>
              </li>
            )}
            {active.map((wf) => {
              const expanded = open === wf.id;
              const running = inProgress(wf);
              return (
                <li key={wf.id} className="border-b border-ink-100" data-testid="workflow-item">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : wf.id)}
                    className="w-full flex items-start gap-2 px-2.5 py-2.5 bg-transparent text-left hover:bg-ink-50">
                    <Workflow size={16} className="text-brand-600 mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-brand-600 leading-snug">{wf.name}</span>
                      {running && <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">In progress</span>}
                    </span>
                    {expanded ? <ChevronUp size={18} className="text-ink-700 shrink-0" /> : <ChevronDown size={18} className="text-ink-700 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="px-2.5 pb-3 pl-8" data-testid="workflow-actions">
                      <div className="text-[11.5px] text-ink-500 mb-2">{describeTrigger(wf)} · {wf.steps.length} step{wf.steps.length === 1 ? '' : 's'}</div>
                      <div className="flex items-center gap-5">
                        <button type="button" onClick={() => navigate(`/admin/automation?workflow=${wf.id}`)} className="bg-transparent text-[13px] text-brand-600 hover:underline">View workflow</button>
                        <button type="button" disabled={!accountId || busy === wf.id} onClick={() => void start(wf)}
                          title={accountId ? undefined : 'Choose an applicant first'}
                          className="bg-transparent text-[13px] text-brand-600 hover:underline disabled:text-ink-300 disabled:no-underline">
                          {busy === wf.id ? 'Starting…' : 'Start workflow'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <HistoryList accountId={accountId} runs={runs.data} loading={runs.loading} byId={byId} />
        )}
      </div>
    </aside>
  );
}

function HistoryList({ accountId, runs, loading, byId }: { accountId: string | null; runs: AutomationRun[]; loading: boolean; byId: Map<string, AutomationWorkflow> }) {
  if (!accountId) return <p className="px-3 py-6 text-[13px] text-ink-600">Choose an applicant to see its workflow history.</p>;
  if (loading && !runs.length) return <p className="px-3 py-6 text-[13px] text-ink-400">Loading…</p>;
  if (!runs.length) return <p className="px-3 py-6 text-[13px] text-ink-600">No workflows have run for this applicant yet.</p>;
  const tone = { Pending: 'text-amber-700 bg-amber-50', Done: 'text-emerald-700 bg-emerald-50', Skipped: 'text-ink-600 bg-ink-100', Failed: 'text-red-700 bg-red-50' } as const;
  return (
    <ul data-testid="workflow-history">
      {runs.map((r) => {
        const wf = byId.get(r.workflow_id);
        return (
          <li key={r.id} className="px-2.5 py-2.5 border-b border-ink-100">
            <div className="flex items-start gap-2">
              <Workflow size={15} className="text-ink-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-ink-900 leading-snug">{wf?.name ?? 'Deleted workflow'}</div>
                <div className="text-[11.5px] text-ink-500">Step {r.step_index + 1}{wf ? ` of ${wf.steps.length}` : ''} · {r.status === 'Pending' ? `due ${fmtDateTime(r.due_at)}` : fmtDateTime(r.due_at)}</div>
                {r.result && <div className="text-[11.5px] text-ink-600 mt-0.5">{r.result}</div>}
              </div>
              <span className={cx('text-[11px] font-semibold rounded px-1.5 py-0.5', tone[r.status])}>{r.status}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
