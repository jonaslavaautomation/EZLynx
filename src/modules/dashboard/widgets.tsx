import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Field, Input, Modal, useFeedback } from '@/components/ui';
import { fmtMoney, fmtRelative, parseDate, today, toISODate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import { saveAppConfig, useAppConfig, type GoalsConfig } from '@/modules/admin/config';
import { rematch } from '@/lib/downloads';

/* Dashboard tiles: Performance Goals, Underwriting Requests, Policy Downloads, Claims Downloads. */

export function Card({ title, children, className = '', action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`card ${className}`}><div className="card-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}

export function StatRow({ label, value, to }: { label: string; value: ReactNode; to?: string }) {
  if (to) return <a className="stat-row px-1 -mx-1" href={href(to)}><span>{label}</span><strong>{value}</strong></a>;
  return <div className="stat-row"><span>{label}</span><strong>{value}</strong></div>;
}

export const dash = (n: number) => (n ? n.toLocaleString('en-US') : '-');

const DAY = 86400000;
const within = (iso: string | null | undefined, days: number) => !!iso && Date.now() - new Date(iso).getTime() <= days * DAY;
/** Local calendar date (YYYY-MM-DD) of a timestamp or date string — never the UTC prefix of an ISO timestamp. */
const localDay = (iso: string | null | undefined) => { const d = parseDate(iso); return d ? toISODate(d) : null; };
const isToday = (iso: string | null | undefined) => !!iso && localDay(iso) === today();

function Refresh({ onClick }: { onClick: () => void }) {
  return <button className="bg-transparent text-ink-700 hover:text-brand-600" aria-label="Refresh" title="Refresh" onClick={onClick}><RefreshCw size={18} /></button>;
}

// ── Performance Goals ──

type Goal = { key: keyof GoalsConfig; label: string; actual: number; target: number; paceTarget: number; format: (n: number) => string };

// Status colors (reserved for on-track / behind; always shown with an icon + label).
const GOOD = '#16a34a', BEHIND = '#ea580c';

function useGoals() {
  const { value: targets } = useAppConfig('goals');
  const tx = useTable('policy_transactions', {});
  const quotes = useTable('quotes', {});
  const acts = useTable('activities', { eq: { status: 'Completed' } });
  const goals = useMemo<Goal[]>(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pace = now.getDate() / daysInMonth; // share of the month elapsed
    const nb = tx.data.filter((t) => (t.type === 'New Business' || t.type === 'Rewrite') && localDay(t.created_at)?.slice(0, 7) === monthKey);
    const decided = quotes.data.filter((q) => within(q.created_at, 90) && (q.status === 'Bound' || q.status === 'Lost' || q.status === 'Rated'));
    const closePct = decided.length ? Math.round((decided.filter((q) => q.status === 'Bound').length / decided.length) * 100) : 0;
    const dueDone = acts.data.filter((a) => a.due_date && a.completed_at && within(a.completed_at, 30));
    const onTimePct = dueDone.length ? Math.round((dueDone.filter((a) => localDay(a.completed_at)! <= a.due_date!).length / dueDone.length) * 100) : 100;
    return [
      { key: 'monthly_new_policies', label: 'New policies this month', actual: nb.length, target: targets.monthly_new_policies, paceTarget: Math.ceil(targets.monthly_new_policies * pace), format: (n) => String(n) },
      { key: 'monthly_new_premium', label: 'New business premium this month', actual: Math.round(nb.reduce((s, t) => s + Number(t.premium_change), 0)), target: targets.monthly_new_premium, paceTarget: Math.round(targets.monthly_new_premium * pace), format: (n) => fmtMoney(n) },
      { key: 'quote_close_pct', label: 'Quote close ratio (90 days)', actual: closePct, target: targets.quote_close_pct, paceTarget: targets.quote_close_pct, format: (n) => `${n}%` },
      { key: 'tasks_on_time_pct', label: 'Tasks completed on time (30 days)', actual: onTimePct, target: targets.tasks_on_time_pct, paceTarget: targets.tasks_on_time_pct, format: (n) => `${n}%` },
    ];
  }, [targets, tx.data, quotes.data, acts.data]);
  return { goals, targets, loading: tx.loading || quotes.loading || acts.loading };
}

/** Two-segment status donut (on track vs behind) with a 2px surface gap between segments and hover tooltips. */
function GoalsDonut({ onTrack, behind }: { onTrack: number; behind: number }) {
  const [hover, setHover] = useState<'on' | 'behind' | null>(null);
  const total = Math.max(1, onTrack + behind);
  const r = 44, c = 2 * Math.PI * r, gap = onTrack && behind ? 2 : 0;
  const onLen = (onTrack / total) * c, behindLen = (behind / total) * c;
  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`${onTrack} goals on track, ${behind} behind`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#efeaea" strokeWidth="20" />
        {onTrack > 0 && (
          <circle cx="60" cy="60" r={r} fill="none" stroke={GOOD} strokeWidth={hover === 'on' ? 24 : 20} strokeDasharray={`${Math.max(0, onLen - gap)} ${c}`} transform="rotate(-90 60 60)"
            onMouseEnter={() => setHover('on')} onMouseLeave={() => setHover(null)} className="cursor-pointer transition-all" />
        )}
        {behind > 0 && (
          <circle cx="60" cy="60" r={r} fill="none" stroke={BEHIND} strokeWidth={hover === 'behind' ? 24 : 20} strokeDasharray={`${Math.max(0, behindLen - gap)} ${c}`} strokeDashoffset={-onLen} transform="rotate(-90 60 60)"
            onMouseEnter={() => setHover('behind')} onMouseLeave={() => setHover(null)} className="cursor-pointer transition-all" />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
        <div><div className="text-[20px] font-semibold text-ink-900 tabular-nums leading-none">{behind}</div><div className="text-[10px] text-ink-500 mt-0.5">behind</div></div>
      </div>
      {hover && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap rounded bg-ink-900 text-white text-[11px] px-2 py-1 shadow-pop pointer-events-none">
          {hover === 'on' ? `${onTrack} on track` : `${behind} behind pace`}
        </div>
      )}
    </div>
  );
}

export function PerformanceGoals() {
  const { goals, targets } = useGoals();
  const [open, setOpen] = useState(false);
  const status = goals.map((g) => g.actual >= g.paceTarget);
  const onTrack = status.filter(Boolean).length, behind = status.length - onTrack;
  return (
    <Card title="Performance Goals">
      <div className="flex items-center gap-4">
        <GoalsDonut onTrack={onTrack} behind={behind} />
        <ul className="space-y-1.5 text-[12px] min-w-0">
          <li className="flex items-center gap-1.5 text-ink-800"><CheckCircle2 size={13} style={{ color: GOOD }} /> On track <strong className="tabular-nums">{onTrack}</strong></li>
          <li className="flex items-center gap-1.5 text-ink-800"><AlertTriangle size={13} style={{ color: BEHIND }} /> Behind <strong className="tabular-nums">{behind}</strong></li>
        </ul>
      </div>
      <div className="flex justify-end mt-2"><button type="button" onClick={() => setOpen(true)} className="bg-transparent text-[12px] font-semibold text-brand-600 tracking-wide">View all</button></div>
      {open && <GoalsModal goals={goals} targets={targets} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function GoalsModal({ goals, targets, onClose }: { goals: Goal[]; targets: GoalsConfig; onClose: () => void }) {
  const { toast } = useFeedback();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<Record<keyof GoalsConfig, string>>({
    monthly_new_policies: String(targets.monthly_new_policies), monthly_new_premium: String(targets.monthly_new_premium),
    quote_close_pct: String(targets.quote_close_pct), tasks_on_time_pct: String(targets.tasks_on_time_pct),
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const next = Object.fromEntries(Object.entries(v).map(([k, s]) => [k, Math.max(0, Math.round(Number(s) || 0))])) as GoalsConfig;
    if (next.quote_close_pct > 100 || next.tasks_on_time_pct > 100) return toast('Percent targets must be 0–100', 'error');
    setBusy(true);
    try { await saveAppConfig('goals', next); toast('Goals updated'); setEdit(false); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Performance goals" subtitle="Monthly goals are compared with the pace for the days elapsed so far." onClose={onClose} footer={edit
      ? <><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save targets</Button></>
      : <><Button onClick={() => setEdit(true)}>Edit targets</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="space-y-4">
        {goals.map((g) => {
          const ok = g.actual >= g.paceTarget;
          const pct = g.target ? Math.min(100, Math.round((g.actual / g.target) * 100)) : 100;
          return (
            <div key={g.key}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-semibold text-ink-900">{g.label}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: ok ? GOOD : BEHIND }}>
                  {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{ok ? 'On track' : 'Behind'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-ink-100 mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: ok ? GOOD : BEHIND }} /></div>
              <div className="flex justify-between text-xs text-ink-500 mt-1 tabular-nums">
                <span>{g.format(g.actual)} of {g.format(g.target)}</span>
                {g.paceTarget !== g.target && <span>Pace today: {g.format(g.paceTarget)}</span>}
              </div>
              {edit && (
                <Field label="Target" className="mt-2 max-w-[200px]">
                  <Input type="number" min={0} value={v[g.key]} onChange={(e) => setV((s) => ({ ...s, [g.key]: e.target.value }))} />
                </Field>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Underwriting Requests: priced (final price) and bound quotes ──

export function UnderwritingRequests() {
  const quotes = useTable('quotes', {});
  const priced = quotes.data.filter((q) => q.status === 'Rated' || q.status === 'Bound' || q.status === 'Lost');
  const bound = quotes.data.filter((q) => q.status === 'Bound');
  const boundAt = (q: (typeof bound)[number]) => (typeof q.input?.bound_at === 'string' ? (q.input.bound_at as string) : q.created_at);
  return (
    <Card title="Underwriting Requests">
      <StatRow label="Final Price (30 Days)" value={dash(priced.filter((q) => within(q.created_at, 30)).length)} to="/quotes?status=Rated" />
      <StatRow label="Final Price (7 Days)" value={dash(priced.filter((q) => within(q.created_at, 7)).length)} to="/quotes?status=Rated" />
      <StatRow label="Final Price (Today)" value={dash(priced.filter((q) => isToday(q.created_at)).length)} to="/quotes?status=Rated" />
      <StatRow label="Bind Messages (30 Days)" value={dash(bound.filter((q) => within(boundAt(q), 30)).length)} to="/quotes?status=Bound" />
      <StatRow label="Bind Messages (7 Days)" value={dash(bound.filter((q) => within(boundAt(q), 7)).length)} to="/quotes?status=Bound" />
      <StatRow label="Bind Messages (Today)" value={dash(bound.filter((q) => isToday(boundAt(q))).length)} to="/quotes?status=Bound" />
    </Card>
  );
}

// ── Policy Downloads (last 7 days) ──

export function PolicyDownloads() {
  const { value, loading } = useAppConfig('carrier_downloads');
  const [refreshedAt, setRefreshedAt] = useState(() => new Date().toISOString());
  const all = value.items.filter((t) => t.kind === 'policy');
  const week = all.filter((t) => within(t.received_at, 7));
  const n = (type: string) => week.filter((t) => t.type === type).length;
  const link = (q: string) => `/policy-mgmt/downloads?${q}`;
  return (
    <Card title="Policy Downloads" action={<Refresh onClick={() => { void rematch('all', null).finally(() => setRefreshedAt(new Date().toISOString())); }} />}>
      <p className="card-note">(Last 7 Days) - updated {fmtRelative(refreshedAt)}</p>
      <StatRow label="All Unmatched" value={loading ? '…' : dash(all.filter((t) => t.status === 'Unmatched').length)} to={link('view=unmatched&range=all')} />
      <StatRow label="Cancellations" value={dash(n('Cancellation'))} to={link('view=all&type=Cancellation&range=7')} />
      <StatRow label="Renewals" value={dash(n('Renewal'))} to={link('view=all&type=Renewal&range=7')} />
      <StatRow label="New Policies" value={dash(n('New Business'))} to={link('view=all&type=New%20Business&range=7')} />
      <StatRow label="Non Renewals" value={dash(n('Non-Renewal'))} to={link('view=all&type=Non-Renewal&range=7')} />
      <StatRow label="Matched" value={dash(week.filter((t) => t.status === 'Matched').length)} to={link('view=matched&range=7')} />
      <StatRow label="Unmatched" value={dash(week.filter((t) => t.status === 'Unmatched').length)} to={link('view=unmatched&range=7')} />
    </Card>
  );
}

// ── Claims Downloads (last 7 days) ──

export function ClaimsDownloads() {
  const { value, loading } = useAppConfig('carrier_downloads');
  const [refreshedAt, setRefreshedAt] = useState(() => new Date().toISOString());
  const all = value.items.filter((t) => t.kind === 'claim');
  const week = all.filter((t) => within(t.received_at, 7));
  const st = (...xs: string[]) => week.filter((t) => xs.includes(t.claim?.status ?? '')).length;
  const link = (q: string) => `/policy-mgmt/downloads?kind=claim&${q}`;
  return (
    <Card title="Claims Downloads" action={<Refresh onClick={() => { void rematch('all', null).finally(() => setRefreshedAt(new Date().toISOString())); }} />}>
      <p className="card-note">(Last 7 Days) - updated {fmtRelative(refreshedAt)}</p>
      <StatRow label="All Unmatched" value={loading ? '…' : dash(all.filter((t) => t.status === 'Unmatched').length)} to={link('view=unmatched&range=all')} />
      <StatRow label="Open" value={dash(st('Open', 'Under Review'))} to={link('view=all&range=7')} />
      <StatRow label="Closed" value={dash(st('Closed', 'Denied'))} to={link('view=all&range=7')} />
      <StatRow label="Reopened" value={dash(st('Reopened'))} to={link('view=all&range=7')} />
      <StatRow label="Paid" value={dash(st('Paid'))} to={link('view=all&range=7')} />
      <StatRow label="Matched" value={dash(week.filter((t) => t.status === 'Matched').length)} to={link('view=matched&range=7')} />
      <StatRow label="Unmatched" value={dash(week.filter((t) => t.status === 'Unmatched').length)} to={link('view=unmatched&range=7')} />
    </Card>
  );
}

