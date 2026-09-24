import { ArrowDown, ArrowUp, Bot, Clock, Copy, Pencil, Play, Plus, RefreshCw, Trash2, UserPlus, Workflow, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import {
  Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Menu, Modal, Panel, Pills, Select, StatCard, StatusBadge, Tabs,
  Textarea, cx, useFeedback, type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import { LINES_OF_BUSINESS, type AutomationAction, type AutomationRun, type AutomationStep, type AutomationTrigger, type AutomationWorkflow, type Priority } from '@/lib/types';
import { LINE_TRIGGERS, TRIGGERS, describeTrigger, processDueRuns, runAccountName, runAutomationsTick, startWorkflow } from './automation-engine';
import { AdminHeader, Toggle } from './shared';

const ACTIONS: AutomationAction[] = ['Create Task', 'Send Email', 'Send Text', 'Add Label'];
const DAYS_TRIGGERS: AutomationTrigger[] = ['Renewal Approaching', 'Quote Not Bound'];
const TRIGGER_HINT: Record<AutomationTrigger, string> = {
  'Applicant Created': 'Starts when a new applicant (account) is created.',
  'Label Added': 'Starts when a label is added to an applicant.',
  'Renewal Approaching': 'Checked automatically: starts for each Active policy expiring within N days (once per term).',
  'Quote Not Bound': 'Checked automatically: starts when a Rated quote is still unbound N days after rating.',
  'Claim Reported': 'Starts when a new claim is reported.',
  'Policy Cancelled': 'Starts when a policy is cancelled.',
};

type Tab = 'workflows' | 'runs';

export function AutomationPage() {
  const { toast, confirm } = useFeedback();
  const workflows = useTable('automation_workflows', { order: { column: 'created_at' } });
  const runs = useTable('automation_runs', { order: { column: 'due_at', ascending: false } });
  const labels = useTable('labels');
  const [tab, setTab] = useState<Tab>('workflows');
  const [editing, setEditing] = useState<AutomationWorkflow | 'new' | null>(null);
  const [starting, setStarting] = useState<AutomationWorkflow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const labelName = (id: string) => labels.data.find((l) => l.id === id)?.name;

  const stats = useMemo(() => {
    const m = new Map<string, { pending: number; done: number; failed: number }>();
    runs.data.forEach((r) => {
      const s = m.get(r.workflow_id) ?? { pending: 0, done: 0, failed: 0 };
      if (r.status === 'Pending') s.pending++; else if (r.status === 'Failed') s.failed++; else s.done++;
      m.set(r.workflow_id, s);
    });
    return m;
  }, [runs.data]);
  const now = Date.now();
  const due = runs.data.filter((r) => r.status === 'Pending' && new Date(r.due_at).getTime() <= now).length;

  const toggle = async (w: AutomationWorkflow, active: boolean) => {
    try { await db.update('automation_workflows', w.id, { active }); toast(`${w.name} ${active ? 'activated' : 'paused'}`); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (w: AutomationWorkflow) => {
    const pending = stats.get(w.id)?.pending ?? 0;
    const ok = await confirm({ title: `Delete “${w.name}”?`, message: `The workflow and its run history are deleted${pending ? `, and ${pending} pending step${pending === 1 ? '' : 's'} will not run` : ''}. Tasks and messages it already created are kept.`, confirmLabel: 'Delete workflow', danger: true });
    if (!ok) return;
    try { await db.remove('automation_workflows', w.id); toast('Workflow deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const duplicate = async (w: AutomationWorkflow) => {
    try { await db.insert('automation_workflows', { name: `${w.name} (copy)`, trigger: w.trigger, trigger_config: w.trigger_config, steps: w.steps, active: false }); toast('Workflow duplicated (paused)'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const runNow = async (mode: 'due' | 'tick') => {
    if (busy) return;
    setBusy(mode);
    try {
      if (mode === 'due') {
        const r = await processDueRuns();
        toast(r.done + r.skipped + r.failed ? `Ran ${r.done} step${r.done === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} skipped` : ''}${r.failed ? `, ${r.failed} failed` : ''}` : 'No steps are due right now', r.failed ? 'error' : r.done ? 'success' : 'info');
      } else {
        const r = await runAutomationsTick();
        if (r.skippedTick) toast('The engine is already running — try again in a moment', 'info');
        else toast(`Scan queued ${r.queued} new run${r.queued === 1 ? '' : 's'}; ran ${r.done} step${r.done === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`, r.failed ? 'error' : 'success');
      }
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const columns: Column<AutomationWorkflow>[] = [
    { key: 'name', header: 'Workflow', sortValue: (w) => w.name.toLowerCase(), render: (w) => <div><div className="font-semibold text-ink-900">{w.name}</div><div className="text-xs text-ink-400">{describeTrigger(w, labelName)}</div></div> },
    { key: 'trigger', header: 'Trigger', sortValue: (w) => w.trigger, render: (w) => <Badge tone={DAYS_TRIGGERS.includes(w.trigger) ? 'purple' : 'blue'}>{w.trigger}</Badge> },
    {
      key: 'steps', header: 'Steps', render: (w) => (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {w.steps.map((s, i) => <span key={i} className="inline-flex items-center gap-1">{i > 0 && <span className="text-ink-300">→</span>}{s.delay_days > 0 && <span className="text-ink-400">+{s.delay_days}d</span>}<Badge>{s.action}</Badge></span>)}
        </div>
      ),
    },
    { key: 'runs', header: 'Runs', align: 'right', render: (w) => { const s = stats.get(w.id); return <span className="text-xs tabular-nums whitespace-nowrap">{s?.pending ?? 0} pending · {s?.done ?? 0} done{s?.failed ? <span className="text-red-600"> · {s.failed} failed</span> : ''}</span>; } },
    { key: 'active', header: 'Active', align: 'center', sortValue: (w) => (w.active ? 0 : 1), render: (w) => <Toggle label={w.active ? 'Pause workflow' : 'Activate workflow'} checked={w.active} onChange={(v) => void toggle(w, v)} /> },
    {
      key: 'actions', header: '', align: 'right', render: (w) => <Menu items={[
        { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(w) },
        { label: 'Run for an applicant…', icon: <UserPlus size={14} />, disabled: !w.steps.length, onClick: () => setStarting(w) },
        { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(w) },
        'divider',
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(w) },
      ]} />,
    },
  ];

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Automation Center" subtitle="Workflows whose steps run at timed intervals — tasks, emails, texts and labels on autopilot" icon={<Workflow size={20} />}
        actions={<>
          <Button icon={<RefreshCw size={15} />} loading={busy === 'tick'} onClick={() => void runNow('tick')}>Scan triggers</Button>
          <Button icon={<Play size={15} />} loading={busy === 'due'} onClick={() => void runNow('due')}>Run due steps now{due ? ` (${due})` : ''}</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New workflow</Button>
        </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Active workflows" value={workflows.data.filter((w) => w.active).length} hint={`${workflows.data.length} total`} icon={<Workflow size={17} />} />
        <StatCard label="Pending steps" value={runs.data.filter((r) => r.status === 'Pending').length} hint={due ? `${due} due now` : 'None due now'} icon={<Clock size={17} />} tone="blue" onClick={() => setTab('runs')} />
        <StatCard label="Completed steps" value={runs.data.filter((r) => r.status === 'Done').length} icon={<Bot size={17} />} tone="green" onClick={() => setTab('runs')} />
        <StatCard label="Failed" value={runs.data.filter((r) => r.status === 'Failed').length} icon={<X size={17} />} tone="red" onClick={() => setTab('runs')} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'workflows', label: 'Workflows', count: workflows.data.length }, { value: 'runs', label: 'Runs log', count: runs.data.length }]} />
      {tab === 'workflows' ? (
        <Panel bodyClassName="p-0">
          <ErrorBanner message={workflows.error} />
          <DataTable columns={columns} rows={workflows.data} loading={workflows.loading} onRowClick={(w) => setEditing(w)}
            empty={<EmptyState icon={<Workflow size={22} />} title="No workflows yet" message="Build a workflow such as “Renewal 60 days out → task to CSR, then email 7 days later”." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New workflow</Button>} />} />
          <div className="text-[11px] text-ink-400 px-4 py-3 border-t border-ink-100">The engine checks time-based triggers and runs due steps when the app opens and every 5 minutes while it is open. Emails and texts are simulated: they are written to the applicant’s message history (suppressed addresses are skipped).</div>
        </Panel>
      ) : <RunsLog runs={runs.data} loading={runs.loading} workflows={workflows.data} />}
      {editing && <WorkflowModal workflow={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {starting && <StartModal workflow={starting} onClose={() => setStarting(null)} />}
    </div>
  );
}

// ── Runs log ──

type RunFilter = 'all' | AutomationRun['status'];

function RunsLog({ runs, loading, workflows }: { runs: AutomationRun[]; loading: boolean; workflows: AutomationWorkflow[] }) {
  const { toast, confirm } = useFeedback();
  const accounts = useTable('accounts');
  const [filter, setFilter] = useState<RunFilter>('all');
  const [wf, setWf] = useState('');
  const am = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const wm = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);
  const shown = runs.filter((r) => (filter === 'all' || r.status === filter) && (!wf || r.workflow_id === wf));
  const count = (s: AutomationRun['status']) => runs.filter((r) => r.status === s).length;

  const cancel = async (r: AutomationRun) => {
    const ok = await confirm({ title: 'Skip this step?', message: 'The pending step is marked Skipped and later steps of this run will not be queued.', confirmLabel: 'Skip step' });
    if (!ok) return;
    try { await db.update('automation_runs', r.id, { status: 'Skipped', result: `Step ${r.step_index + 1}: skipped manually` }); toast('Step skipped'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const retry = async (r: AutomationRun) => {
    try { await db.update('automation_runs', r.id, { status: 'Pending', due_at: new Date().toISOString(), result: null }); await processDueRuns(); toast('Step retried'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<AutomationRun>[] = [
    { key: 'due', header: 'Due', sortValue: (r) => r.due_at, render: (r) => <div className="whitespace-nowrap"><div>{fmtDateTime(r.due_at)}</div><div className="text-[11px] text-ink-400">{fmtRelative(r.due_at)}</div></div> },
    { key: 'wf', header: 'Workflow', sortValue: (r) => wm.get(r.workflow_id)?.name ?? '', render: (r) => { const w = wm.get(r.workflow_id); return <div><div className="font-semibold text-ink-900">{w?.name ?? 'Deleted workflow'}</div><div className="text-[11px] text-ink-400">Step {r.step_index + 1}{w?.steps[r.step_index] ? ` · ${w.steps[r.step_index].action}` : ''}</div></div>; } },
    { key: 'acct', header: 'Applicant', sortValue: (r) => runAccountName(am.get(r.account_id ?? '')), render: (r) => (r.account_id && am.get(r.account_id) ? <a className="hover:text-brand-600 hover:underline" href={href(`/accounts/${r.account_id}`)}>{runAccountName(am.get(r.account_id))}</a> : '—') },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status === 'Done' ? 'Completed' : r.status} /> },
    { key: 'result', header: 'Result', className: 'max-w-[360px]', render: (r) => <span className={cx('text-xs', r.status === 'Failed' ? 'text-red-600' : 'text-ink-500')}>{r.result || (r.status === 'Pending' ? 'Waiting' : '—')}</span> },
    {
      key: 'actions', header: '', align: 'right', render: (r) => (r.status === 'Pending'
        ? <Button size="sm" variant="ghost" onClick={() => void cancel(r)}>Skip</Button>
        : r.status === 'Failed' ? <Button size="sm" onClick={() => void retry(r)}>Retry</Button> : null),
    },
  ];

  return (
    <Panel bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
        <Pills value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: runs.length }, { value: 'Pending', label: 'Pending', count: count('Pending') }, { value: 'Done', label: 'Done', count: count('Done') },
          { value: 'Skipped', label: 'Skipped', count: count('Skipped') }, { value: 'Failed', label: 'Failed', count: count('Failed') },
        ]} />
        <Select className="w-full sm:w-60 ml-auto" value={wf} onChange={(e) => setWf(e.target.value)} placeholder="All workflows" options={workflows.map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <DataTable columns={columns} rows={shown} loading={loading} dense initialSort={{ key: 'due', dir: 'desc' }}
        empty={<EmptyState icon={<Bot size={22} />} title="No runs yet" message="Runs appear here when a trigger fires or when you run a workflow for an applicant." />} />
    </Panel>
  );
}

// ── Workflow editor ──

const blankStep = (action: AutomationAction = 'Create Task', delay = 0): AutomationStep => ({ delay_days: delay, action, subject: '', body: '', template_id: null, assign_to: 'csr', label_id: null, priority: 'Normal' });

function WorkflowModal({ workflow, onClose }: { workflow: AutomationWorkflow | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const { activeStaff } = useAppData();
  const labels = useTable('labels', { order: { column: 'name' } });
  const templates = useTable('message_templates', { order: { column: 'name' } });
  const [name, setName] = useState(workflow?.name ?? '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(workflow?.trigger ?? 'Applicant Created');
  const [days, setDays] = useState(String(workflow?.trigger_config?.days ?? 30));
  const [labelId, setLabelId] = useState(workflow?.trigger_config?.label_id ?? '');
  const [lines, setLines] = useState<string[]>(workflow?.trigger_config?.lines ?? []);
  const [steps, setSteps] = useState<AutomationStep[]>(workflow?.steps?.length ? workflow.steps.map((s) => ({ ...blankStep(), ...s })) : [blankStep()]);
  const [active, setActive] = useState(workflow?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setStep = (i: number, patch: Partial<AutomationStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const assignOptions = [{ value: 'csr', label: 'Account CSR' }, { value: 'producer', label: 'Account producer' }, ...activeStaff.map((s) => ({ value: s.name, label: s.name }))];
  const total = steps.reduce((s, x) => s + (Number(x.delay_days) || 0), 0);

  const validate = (): string | null => {
    if (!name.trim()) return 'Name the workflow';
    if (DAYS_TRIGGERS.includes(trigger)) { const n = Number(days); if (!Number.isInteger(n) || n < 1 || n > 365) return 'Trigger days must be a whole number from 1 to 365'; }
    if (!steps.length) return 'Add at least one step';
    for (const [i, s] of steps.entries()) {
      const p = `Step ${i + 1}: `;
      if (!Number.isInteger(Number(s.delay_days)) || Number(s.delay_days) < 0 || Number(s.delay_days) > 365) return `${p}delay must be 0–365 days`;
      if (s.action === 'Create Task' && !s.subject?.trim()) return `${p}enter the task subject`;
      if ((s.action === 'Send Email' || s.action === 'Send Text') && !s.template_id && !s.body?.trim()) return `${p}choose a template or write the message`;
      if (s.action === 'Send Email' && !s.template_id && !s.subject?.trim()) return `${p}enter the email subject`;
      if (s.action === 'Send Text' && !s.template_id && (s.body ?? '').length > 480) return `${p}keep texts under 480 characters`;
      if (s.action === 'Add Label' && !s.label_id) return `${p}choose the label to add`;
    }
    return null;
  };

  const save = async () => {
    if (busy) return;
    const e = validate();
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    const clean: AutomationStep[] = steps.map((s) => {
      const base = { delay_days: Number(s.delay_days) || 0, action: s.action };
      switch (s.action) {
        case 'Create Task': return { ...base, subject: s.subject?.trim(), body: s.body?.trim() || '', assign_to: s.assign_to || 'csr', priority: s.priority ?? 'Normal' };
        case 'Send Email': return { ...base, template_id: s.template_id || null, subject: s.template_id ? '' : s.subject?.trim(), body: s.template_id ? '' : s.body?.trim() };
        case 'Send Text': return { ...base, template_id: s.template_id || null, body: s.template_id ? '' : s.body?.trim() };
        default: return { ...base, label_id: s.label_id || null };
      }
    });
    const trigger_config = {
      ...(DAYS_TRIGGERS.includes(trigger) ? { days: Number(days) } : {}),
      ...(trigger === 'Label Added' ? { label_id: labelId || null } : {}),
      ...(LINE_TRIGGERS.includes(trigger) ? { lines } : {}),
    };
    try {
      const values = { name: name.trim(), trigger, trigger_config, steps: clean, active };
      if (workflow) await db.update('automation_workflows', workflow.id, values); else await db.insert('automation_workflows', values);
      toast(workflow ? 'Workflow saved' : 'Workflow created');
      onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  };

  return (
    <Modal title={workflow ? 'Edit workflow' : 'New workflow'} subtitle="Steps run one after another; each waits its delay after the previous step" size="lg" onClose={onClose}
      footer={<>
        <span className="mr-auto self-center"><Checkbox label="Active" checked={active} onChange={setActive} /></span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{workflow ? 'Save workflow' : 'Create workflow'}</Button>
      </>}>
      <div className="space-y-4">
        <ErrorBanner message={err} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Workflow name" required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Renewal review — 60 days out" /></Field>
          <Field label="Trigger" required hint={TRIGGER_HINT[trigger]}><Select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)} options={TRIGGERS} /></Field>
          {DAYS_TRIGGERS.includes(trigger) && <Field label={trigger === 'Renewal Approaching' ? 'Days before expiration' : 'Days after rating'} required><Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></Field>}
          {trigger === 'Label Added' && <Field label="Label" hint="Leave as “Any label” to start on every label."><Select value={labelId} onChange={(e) => setLabelId(e.target.value)} placeholder="Any label" options={labels.data.map((l) => ({ value: l.id, label: l.name }))} /></Field>}
        </div>
        {LINE_TRIGGERS.includes(trigger) && (
          <div>
            <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Line of business filter (optional)</span>{lines.length > 0 && <button type="button" className="text-xs text-brand-600 bg-transparent hover:underline" onClick={() => setLines([])}>Clear — all lines</button>}</div>
            <div className="flex flex-wrap gap-1.5">
              {LINES_OF_BUSINESS.map((l) => { const on = lines.includes(l); return <button key={l} type="button" onClick={() => setLines((x) => (on ? x.filter((y) => y !== l) : [...x, l]))} className={cx('px-2 h-7 rounded-full border text-xs font-semibold', on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300')}>{l}</button>; })}
            </div>
            <div className="text-[11px] text-ink-400 mt-1">{lines.length ? `Only ${lines.join(', ')}` : 'All lines'}</div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Steps ({steps.length}) · spans {total} day{total === 1 ? '' : 's'}</span>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setSteps((s) => [...s, blankStep('Send Email', s.length ? 3 : 0)])} disabled={steps.length >= 10}>Add step</Button>
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="border border-ink-100 rounded p-3 bg-ink-50/40">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-bold grid place-items-center mb-1.5">{i + 1}</span>
                  <Field label={i === 0 ? 'Wait (days after trigger)' : 'Wait (days after previous)'} className="w-40"><Input type="number" min={0} max={365} value={String(s.delay_days)} onChange={(e) => setStep(i, { delay_days: e.target.value === '' ? 0 : Number(e.target.value) })} /></Field>
                  <Field label="Action" className="w-44"><Select value={s.action} onChange={(e) => setStep(i, { action: e.target.value as AutomationAction, template_id: null })} options={ACTIONS} /></Field>
                  <div className="ml-auto flex gap-1 mb-0.5">
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></IconButton>
                    <IconButton label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></IconButton>
                    <IconButton label="Remove step" disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></IconButton>
                  </div>
                </div>
                <div className="mt-2">
                  {s.action === 'Create Task' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Field label="Task subject" required className="sm:col-span-3"><Input value={s.subject ?? ''} maxLength={200} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="e.g. Renewal review: {policy_number}" /></Field>
                      <Field label="Assign to"><Select value={s.assign_to ?? 'csr'} onChange={(e) => setStep(i, { assign_to: e.target.value })} options={assignOptions.some((o) => o.value === s.assign_to) || !s.assign_to ? assignOptions : [...assignOptions, { value: s.assign_to, label: `${s.assign_to} (inactive)` }]} /></Field>
                      <Field label="Priority"><Select value={s.priority ?? 'Normal'} onChange={(e) => setStep(i, { priority: e.target.value as Priority })} options={['Low', 'Normal', 'High']} /></Field>
                      <Field label="Details" className="sm:col-span-3"><Textarea rows={2} value={s.body ?? ''} onChange={(e) => setStep(i, { body: e.target.value })} /></Field>
                    </div>
                  )}
                  {(s.action === 'Send Email' || s.action === 'Send Text') && (() => {
                    const channel = s.action === 'Send Email' ? 'Email' : 'SMS';
                    const opts = templates.data.filter((t) => t.channel === channel);
                    return (
                      <div className="grid grid-cols-1 gap-2">
                        <Field label={`${channel === 'Email' ? 'Email' : 'SMS'} template`} hint={opts.length ? undefined : `No ${channel} templates yet — write the message below, or add templates in Communication Center.`}>
                          <Select value={s.template_id ?? ''} onChange={(e) => setStep(i, { template_id: e.target.value || null })} placeholder="Write a custom message" options={opts.map((t) => ({ value: t.id, label: t.name }))} />
                        </Field>
                        {!s.template_id && <>
                          {channel === 'Email' && <Field label="Subject" required><Input value={s.subject ?? ''} onChange={(e) => setStep(i, { subject: e.target.value })} /></Field>}
                          <Field label="Message" required hint={`Merge fields: {first_name} {full_name} {agency} {agent}${LINE_TRIGGERS.includes(trigger) ? ' {policy_number} {line} {carrier} {expiration_date}' : ''}`}>
                            <Textarea rows={channel === 'Email' ? 4 : 2} value={s.body ?? ''} onChange={(e) => setStep(i, { body: e.target.value })} />
                          </Field>
                        </>}
                      </div>
                    );
                  })()}
                  {s.action === 'Add Label' && (
                    <Field label="Label to add" required hint={labels.data.length ? undefined : 'Create labels in Manage Labels first.'}>
                      <Select value={s.label_id ?? ''} onChange={(e) => setStep(i, { label_id: e.target.value || null })} placeholder="Choose a label" options={labels.data.map((l) => ({ value: l.id, label: l.name }))} />
                    </Field>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {workflow && <p className="text-[11px] text-ink-400 mt-2">Editing affects steps that haven’t run yet. Pending runs execute the step at their position when due.</p>}
        </div>
      </div>
    </Modal>
  );
}

function StartModal({ workflow, onClose }: { workflow: AutomationWorkflow; onClose: () => void }) {
  const { toast } = useFeedback();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (!accountId) return setErr('Choose an applicant');
    setBusy(true);
    try {
      const run = await startWorkflow(workflow, accountId);
      if (new Date(run.due_at).getTime() <= Date.now()) await processDueRuns();
      toast(`“${workflow.name}” started`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Run workflow for an applicant" subtitle={workflow.name} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Play size={14} />} loading={busy} onClick={() => void go()}>Start</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <Field label="Applicant" required><AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setErr(null); }} /></Field>
        <p className="text-xs text-ink-500">Step 1 {workflow.steps[0]?.delay_days ? `runs in ${workflow.steps[0].delay_days} day${workflow.steps[0].delay_days === 1 ? '' : 's'}` : 'runs immediately'}; later steps follow their delays. Policy merge fields are blank for manual runs.</p>
      </div>
    </Modal>
  );
}

