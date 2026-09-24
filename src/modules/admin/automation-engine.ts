import { useEffect } from 'react';
import { db } from '@/lib/db';
import { accountName, addDays, daysUntil, fmtDate, parseDate, today } from '@/lib/format';
import type { Account, AgencySettings, AutomationRun, AutomationStep, AutomationTrigger, AutomationWorkflow, Policy } from '@/lib/types';
import { composeEmailBody, mergeFields } from '@/modules/comm/shared';
import { isSuppressed } from '@/modules/comm/suppression';

/**
 * Automation Center engine. A workflow's steps run one at a time: each step is an `automation_runs` row with a
 * `due_at`; when it executes, the next step is queued `delay_days` later (delays are relative to the previous step).
 *
 * - Event triggers (Applicant Created, Label Added, Claim Reported, Policy Cancelled) call `enqueueAutomation`.
 * - Time-based triggers (Renewal Approaching, Quote Not Bound) are found by `scanAutomations`.
 * - `processDueRuns` executes Pending runs whose `due_at` has passed.
 */

export const TRIGGERS: AutomationTrigger[] = ['Applicant Created', 'Label Added', 'Renewal Approaching', 'Quote Not Bound', 'Claim Reported', 'Policy Cancelled'];
export const TIME_TRIGGERS: AutomationTrigger[] = ['Renewal Approaching', 'Quote Not Bound'];
/** Triggers tied to a policy or quote, where the optional line-of-business filter applies. */
export const LINE_TRIGGERS: AutomationTrigger[] = ['Renewal Approaching', 'Quote Not Bound', 'Claim Reported', 'Policy Cancelled'];

const DAY = 86_400_000;
const timeOf = (s: string | null | undefined) => parseDate(s)?.getTime() ?? 0;
const dueAt = (delayDays: number, from = Date.now()) => new Date(from + Math.max(0, delayDays) * DAY).toISOString();

// ── Concurrency guard: one engine pass at a time (ticker, "Run now" buttons and event kicks share it) ──

let chain: Promise<unknown> = Promise.resolve();
let busy = false;

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.catch(() => {}).then(async () => {
    busy = true;
    try { return await fn(); } finally { busy = false; }
  });
  chain = next;
  return next;
}

// ── Triggers ──

export type EnqueueContext = { account_id: string; policy_id?: string | null; label_id?: string | null; line?: string | null; exclude_workflow_id?: string };

function lineMatches(wf: AutomationWorkflow, line: string | null | undefined) {
  const lines = wf.trigger_config?.lines ?? [];
  if (!lines.length || !LINE_TRIGGERS.includes(wf.trigger)) return true;
  return !!line && lines.includes(line);
}

async function enqueueNow(trigger: AutomationTrigger, ctx: EnqueueContext) {
  const workflows = (await db.list('automation_workflows', { eq: { trigger, active: true } })).filter((w) => w.id !== ctx.exclude_workflow_id && w.steps?.length);
  if (!workflows.length) return [] as AutomationRun[];
  let line = ctx.line ?? null;
  if (!line && ctx.policy_id && workflows.some((w) => (w.trigger_config?.lines ?? []).length)) line = (await db.get('policies', ctx.policy_id))?.line_of_business ?? null;
  const matching = workflows.filter((w) => {
    if (trigger === 'Label Added' && w.trigger_config?.label_id && w.trigger_config.label_id !== ctx.label_id) return false;
    return lineMatches(w, line);
  });
  if (!matching.length) return [];
  return db.insertMany('automation_runs', matching.map((w) => ({
    workflow_id: w.id, account_id: ctx.account_id, policy_id: ctx.policy_id ?? null, step_index: 0,
    due_at: dueAt(Number(w.steps[0].delay_days) || 0), status: 'Pending' as const, result: null,
  })));
}

/**
 * Starts every active workflow for an event trigger. Steps due immediately are executed right away (in the
 * background). Returns the runs created.
 */
export async function enqueueAutomation(trigger: AutomationTrigger, ctx: EnqueueContext): Promise<AutomationRun[]> {
  const runs = await enqueueNow(trigger, ctx);
  if (runs.some((r) => timeOf(r.due_at) <= Date.now())) void processDueRuns().catch(() => {});
  return runs;
}

/** Manually start one workflow for an account (Automation Center "Run for applicant"). */
export async function startWorkflow(wf: AutomationWorkflow, account_id: string, policy_id: string | null = null) {
  if (!wf.steps.length) throw new Error('This workflow has no steps');
  const run = await db.insert('automation_runs', {
    workflow_id: wf.id, account_id, policy_id, step_index: 0, due_at: dueAt(Number(wf.steps[0].delay_days) || 0), status: 'Pending', result: null,
  });
  return run;
}

/**
 * Finds records matching the time-based triggers and queues step 1 for each one not already queued:
 * - Renewal Approaching: Active policies expiring within N days (once per policy term).
 * - Quote Not Bound: Rated quotes N+ days after rating that were never bound or marked lost (once per rating).
 */
export async function scanAutomations(): Promise<number> {
  const workflows = (await db.list('automation_workflows', { eq: { active: true } })).filter((w) => TIME_TRIGGERS.includes(w.trigger) && w.steps?.length);
  if (!workflows.length) return 0;
  const runs = await db.list('automation_runs', { in: { column: 'workflow_id', values: workflows.map((w) => w.id) } });
  const byWorkflow = new Map<string, AutomationRun[]>();
  runs.forEach((r) => byWorkflow.set(r.workflow_id, [...(byWorkflow.get(r.workflow_id) ?? []), r]));
  const needPolicies = workflows.some((w) => w.trigger === 'Renewal Approaching');
  const needQuotes = workflows.some((w) => w.trigger === 'Quote Not Bound');
  const [policies, quotes] = await Promise.all([
    needPolicies ? db.list('policies', { eq: { status: 'Active' } }) : Promise.resolve([] as Policy[]),
    needQuotes ? db.list('quotes', { eq: { status: 'Rated' } }) : Promise.resolve([]),
  ]);
  const inserts: Partial<AutomationRun>[] = [];
  for (const wf of workflows) {
    const days = Math.max(0, Number(wf.trigger_config?.days) || 0);
    const existing = byWorkflow.get(wf.id) ?? [];
    const first = dueAt(Number(wf.steps[0].delay_days) || 0);
    if (wf.trigger === 'Renewal Approaching') {
      for (const p of policies) {
        const left = daysUntil(p.expiration_date);
        if (left === null || left < 0 || left > days || !lineMatches(wf, p.line_of_business)) continue;
        // Already queued for this term: a run for this policy created inside the renewal window.
        const windowStart = parseDate(addDays(p.expiration_date, -(days + 7)))!.getTime();
        if (existing.some((r) => r.policy_id === p.id && timeOf(r.created_at) >= windowStart)) continue;
        inserts.push({ workflow_id: wf.id, account_id: p.account_id, policy_id: p.id, step_index: 0, due_at: first, status: 'Pending', result: null });
      }
    } else {
      for (const q of quotes) {
        if (q.policy_id || !lineMatches(wf, q.line_of_business)) continue;
        const ratedAt = typeof q.input?.rated_at === 'string' ? (q.input.rated_at as string) : q.created_at;
        const rated = timeOf(ratedAt);
        if (!rated || Date.now() - rated < days * DAY) continue;
        // Already queued for this rating of the quote's account.
        if (existing.some((r) => r.account_id === q.account_id && r.policy_id === null && timeOf(r.created_at) >= rated)) continue;
        if (inserts.some((r) => r.workflow_id === wf.id && r.account_id === q.account_id)) continue;
        inserts.push({ workflow_id: wf.id, account_id: q.account_id, policy_id: null, step_index: 0, due_at: first, status: 'Pending', result: `Quote ${q.line_of_business} rated ${fmtDate(ratedAt)}` });
      }
    }
  }
  if (inserts.length) await db.insertMany('automation_runs', inserts);
  return inserts.length;
}

// ── Execution ──

type Ctx = { account: Account; policy: Policy | null; settings: AgencySettings | null; workflow: AutomationWorkflow };

function fill(text: string, c: Ctx) {
  const p = c.policy;
  const pre = text
    .replace(/\{policy_number\}/g, () => p?.policy_number ?? '')
    .replace(/\{line\}/g, () => p?.line_of_business ?? 'insurance')
    .replace(/\{carrier\}/g, () => p?.carrier ?? '')
    .replace(/\{expiration_date\}/g, () => (p ? fmtDate(p.expiration_date) : ''));
  return mergeFields(pre, c.account, c.settings, c.account.producer);
}

function resolveAssignee(step: AutomationStep, c: Ctx) {
  const rule = step.assign_to ?? 'csr';
  if (rule === 'csr') return c.account.csr ?? c.account.producer ?? null;
  if (rule === 'producer') return c.policy?.producer ?? c.account.producer ?? c.account.csr ?? null;
  return rule || null;
}

/** Executes one step; returns the result text, or throws. `{ skipped }` results are marked Skipped. */
async function execute(step: AutomationStep, c: Ctx): Promise<{ text: string; skipped?: boolean }> {
  const { account } = c;
  switch (step.action) {
    case 'Create Task': {
      const assigned_to = resolveAssignee(step, c);
      const subject = fill(step.subject?.trim() || `${c.workflow.name} follow-up`, c).slice(0, 200);
      await db.insert('activities', {
        type: 'Task', subject, description: step.body?.trim() ? fill(step.body, c) : `Created by automation workflow “${c.workflow.name}”.`,
        account_id: account.id, policy_id: c.policy?.id ?? null, due_date: today(), priority: step.priority ?? 'Normal', status: 'Open',
        assigned_to, completed_at: null,
      });
      return { text: `Task “${subject}” assigned to ${assigned_to ?? 'nobody (unassigned)'}` };
    }
    case 'Send Email':
    case 'Send Text': {
      const email = step.action === 'Send Email';
      let subject = step.subject ?? '';
      let body = step.body ?? '';
      if (step.template_id) {
        const t = await db.get('message_templates', step.template_id);
        if (!t) throw new Error('The message template for this step was deleted');
        subject = t.subject ?? subject;
        body = t.body;
      }
      if (!body.trim()) throw new Error('This step has no message body');
      const to = email ? account.email?.trim() : (account.mobile_phone || account.phone || '').trim();
      if (!to) return { text: email ? 'Skipped — no email address on file' : 'Skipped — no mobile or phone number on file', skipped: true };
      if (await isSuppressed(email ? 'Email' : 'SMS', to)) return { text: `Skipped — ${to} is on the ${email ? 'email' : 'SMS'} suppression list`, skipped: true };
      await db.insert('messages', {
        account_id: account.id, channel: email ? 'Email' : 'SMS', direction: 'Outbound', to_address: to,
        subject: email ? fill(subject || c.workflow.name, c) : null,
        body: email ? composeEmailBody(fill(body, c), account, c.settings, account.producer) : fill(body, c),
        status: 'Delivered', read: true,
      });
      return { text: `${email ? 'Email' : 'Text'} sent to ${to}` };
    }
    case 'Add Label': {
      if (!step.label_id) throw new Error('No label chosen for this step');
      const label = await db.get('labels', step.label_id);
      if (!label) throw new Error('The label for this step was deleted');
      const fresh = await db.get('accounts', account.id);
      const labels = fresh?.labels ?? [];
      if (labels.includes(label.id)) return { text: `Label “${label.name}” already on account` };
      await db.update('accounts', account.id, { labels: [...labels, label.id] });
      // Let other workflows react to the new label (never this one, to avoid loops).
      try { await enqueueNow('Label Added', { account_id: account.id, label_id: label.id, exclude_workflow_id: c.workflow.id }); } catch { /* best effort */ }
      return { text: `Label “${label.name}” added` };
    }
    default:
      throw new Error(`Unknown action ${String((step as AutomationStep).action)}`);
  }
}

export type ProcessResult = { done: number; skipped: number; failed: number };

/** Runs passes until nothing is due, so follow-on steps with no delay execute right away (bounded). */
async function processNow(): Promise<ProcessResult> {
  const out: ProcessResult = { done: 0, skipped: 0, failed: 0 };
  for (let pass = 0; pass < 10; pass++) {
    const r = await processOnce();
    out.done += r.done; out.skipped += r.skipped; out.failed += r.failed;
    if (!(r.done + r.skipped + r.failed)) break;
  }
  return out;
}

async function processOnce(): Promise<ProcessResult> {
  const out: ProcessResult = { done: 0, skipped: 0, failed: 0 };
  const now = Date.now();
  const due = (await db.list('automation_runs', { eq: { status: 'Pending' } })).filter((r) => timeOf(r.due_at) <= now).sort((a, b) => timeOf(a.due_at) - timeOf(b.due_at));
  if (!due.length) return out;
  const [workflows, settingsRows] = await Promise.all([db.list('automation_workflows'), db.list('agency_settings', { order: { column: 'created_at' }, limit: 1 })]);
  const wfMap = new Map(workflows.map((w) => [w.id, w]));
  const settings = settingsRows[0] ?? null;

  for (const run of due) {
    const wf = wfMap.get(run.workflow_id);
    const mark = (status: AutomationRun['status'], result: string) => db.update('automation_runs', run.id, { status, result });
    try {
      if (!wf) { await mark('Skipped', 'Workflow no longer exists'); out.skipped++; continue; }
      if (!wf.active) { await mark('Skipped', 'Workflow is inactive'); out.skipped++; continue; }
      const step = wf.steps[run.step_index];
      if (!step) { await mark('Skipped', 'Step no longer exists (workflow was edited)'); out.skipped++; continue; }
      if (!run.account_id) throw new Error('Run has no account');
      const account = await db.get('accounts', run.account_id);
      if (!account) throw new Error('Account not found');
      const policy = run.policy_id ? await db.get('policies', run.policy_id) : null;
      const r = await execute(step, { account, policy, settings, workflow: wf });
      await mark(r.skipped ? 'Skipped' : 'Done', `Step ${run.step_index + 1}: ${r.text}`);
      if (r.skipped) out.skipped++; else out.done++;
      const next = wf.steps[run.step_index + 1];
      if (next) {
        await db.insert('automation_runs', {
          workflow_id: wf.id, account_id: run.account_id, policy_id: run.policy_id, step_index: run.step_index + 1,
          due_at: dueAt(Number(next.delay_days) || 0), status: 'Pending', result: null,
        });
      }
    } catch (e) {
      out.failed++;
      try { await mark('Failed', `Step ${run.step_index + 1}: ${(e as Error).message}`); } catch { /* row may be gone (cascade) */ }
    }
  }
  return out;
}

/** Executes every Pending run that is due. Serialized with other engine passes. */
export function processDueRuns(): Promise<ProcessResult> {
  return exclusive(processNow);
}

export type TickResult = ProcessResult & { queued: number; skippedTick?: boolean };

/** Scan time-based triggers, then execute due runs. Skips (does not queue) when a pass is already running. */
export async function runAutomationsTick(): Promise<TickResult> {
  if (busy) return { queued: 0, done: 0, skipped: 0, failed: 0, skippedTick: true };
  return exclusive(async () => {
    const queued = await scanAutomations();
    const r = await processNow();
    return { ...r, queued };
  });
}

/** Mount once in the app shell: runs the engine on load and every 5 minutes. Renders nothing. */
export function AutomationTicker() {
  useEffect(() => {
    let stopped = false;
    const tick = () => { if (!stopped) void runAutomationsTick().catch(() => {}); };
    const first = setTimeout(tick, 4000);
    const every = setInterval(tick, 5 * 60 * 1000);
    return () => { stopped = true; clearTimeout(first); clearInterval(every); };
  }, []);
  return null;
}

/** Plain-English trigger description for lists. */
export function describeTrigger(wf: Pick<AutomationWorkflow, 'trigger' | 'trigger_config'>, labelName?: (id: string) => string | undefined) {
  const c = wf.trigger_config ?? {};
  let s: string;
  switch (wf.trigger) {
    case 'Renewal Approaching': s = `Renewal within ${c.days ?? 0} days`; break;
    case 'Quote Not Bound': s = `Quote not bound ${c.days ?? 0} days after rating`; break;
    case 'Label Added': s = c.label_id ? `Label “${labelName?.(c.label_id) ?? 'deleted label'}” added` : 'Any label added'; break;
    default: s = wf.trigger;
  }
  if (c.lines?.length && LINE_TRIGGERS.includes(wf.trigger)) s += ` · ${c.lines.join(', ')}`;
  return s;
}

export const runAccountName = (a: Account | undefined) => (a ? accountName(a) : 'Deleted account');
