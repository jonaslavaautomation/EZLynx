import {
  CheckSquare, ChevronDown, ChevronUp, ClipboardCopy, FileText, Folder, ListFilter, MailOpen, MoreVertical, Plus, Settings, Sparkles, Square,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Menu, Modal, cx, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import { daysUntil, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, Activity, EmailCampaign, Policy, PolicyTransaction, Quote } from '@/lib/types';
import { saveAppConfig, useAppConfig } from '@/modules/admin/config';
import { useLabels } from '@/modules/admin/integration';
import { LabelChip } from '@/modules/admin/shared';
import { ActivityFormModal } from '@/modules/activities';
import { campaignMessages, matchRecipients } from '@/modules/comm/shared';
import { bestRate } from '@/modules/quotes/rating';
import { workflowPath } from '@/modules/quotes/data';

/* Account Overview: policy / application cards, tasks and campaigns, and the "Catch me up" summary. */

const mdy = (iso: string | null | undefined) => (iso ? fmtDate(iso).replace(/\b0(\d)\//g, '$1/') : '-');
const lobTitle = (p: Pick<Policy, 'line_of_business'>) => (p.line_of_business === 'Personal Auto' ? 'Auto (Personal)' : p.line_of_business === 'Commercial Auto' ? 'Auto (Commercial)' : p.line_of_business);
const isActive = (p: Policy) => p.status === 'Active';

export function StatusPill({ policy }: { policy: Policy }) {
  const active = isActive(policy);
  const pending = policy.status === 'Pending';
  return (
    <span title={policy.status} className={cx('inline-flex items-center h-[22px] px-2.5 rounded-full text-[12px] font-medium text-white shrink-0',
      active ? 'bg-[#1e8e3e]' : pending ? 'bg-[#e37400]' : 'bg-[#d93025]')}>
      {active ? 'Active' : pending ? 'Pending' : 'Inactive'}
    </span>
  );
}

/** Purple count bubble pinned to an icon, as on the overview card headers. */
function CountIcon({ icon, count }: { icon: ReactNode; count: number }) {
  return (
    <span className="relative inline-flex">
      {icon}
      <span className="absolute -top-3 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7048e8] text-white text-[10.5px] font-semibold grid place-items-center">{count}</span>
    </span>
  );
}

// ── Policy labels (stored per policy in app config) ──

function PolicyLabels({ policy }: { policy: Policy }) {
  const { value } = useAppConfig('policy_labels');
  const labels = useLabels();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const mine = value.byPolicy[policy.id] ?? [];
  const byId = new Map(labels.data.map((l) => [l.id, l]));
  const current = mine.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  const [picked, setPicked] = useState<string[]>(mine);
  const save = async () => {
    try {
      await saveAppConfig('policy_labels', { byPolicy: { ...value.byPolicy, [policy.id]: picked } });
      toast('Labels updated');
      setOpen(false);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-semibold text-ink-900">Labels:</span>
      {current.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
      <button type="button" onClick={() => { setPicked(mine); setOpen(true); }} className="inline-flex items-center gap-1 font-semibold tracking-wide text-brand-600 hover:text-brand-800 hover:underline">
        <Plus size={14} /> {current.length ? 'Edit labels' : 'Add label'}
      </button>
      {open && (
        <Modal title="Policy labels" subtitle={`${lobTitle(policy)} · ${policy.policy_number}`} size="sm" onClose={() => setOpen(false)} footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>Save</Button>
        </>}>
          {labels.data.length === 0 ? <p className="text-[13px] text-ink-500">No labels yet. Create them in Agency Management → Manage Labels.</p> : (
            <div className="space-y-1.5">
              {labels.data.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#007a78]" checked={picked.includes(l.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                  <LabelChip name={l.name} color={l.color} />
                </label>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Policy card ──

function PolicyCard({ policy: p, account, txns }: { policy: Policy; account: Account; txns: PolicyTransaction[] }) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const mine = txns.filter((t) => t.policy_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = mine[0]?.type ?? 'New Business';
  const origination = [...mine].sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]?.effective_date ?? p.effective_date;
  const team = [p.producer ?? account.producer, account.csr].filter(Boolean).join(' / ') || '-';
  const copy = () => navigator.clipboard?.writeText(p.policy_number).then(() => toast(`Copied ${p.policy_number}`, 'info'), () => toast('Copy failed', 'error'));
  const metric = (label: string, value: ReactNode) => (
    <div className="min-w-0 truncate"><span className="font-semibold text-ink-900">{label}:</span> <span className="text-ink-700">{value}</span></div>
  );
  return (
    <div className="border border-[#e2e8f0] rounded bg-white hover:shadow-card transition-shadow" data-testid="policy-card">
      <div className="flex items-start gap-3 px-2.5 pt-2.5">
        <StatusPill policy={p} />
        <div className="min-w-0 flex-1">
          <a href={href(`/policies/${p.id}`)} className="text-[15px] font-semibold text-ink-900 hover:text-brand-600 hover:underline">{lobTitle(p)} | {p.policy_number}</a>
          <div className="text-[12px] text-ink-500">{p.carrier}</div>
        </div>
        <div className="flex items-center gap-1 text-ink-800">
          <button type="button" aria-label="Copy policy number" title="Copy policy number" onClick={copy} className="w-8 h-8 grid place-items-center rounded hover:bg-ink-100"><ClipboardCopy size={18} /></button>
          <Menu trigger={<button type="button" aria-label="Policy actions" className="w-8 h-8 grid place-items-center rounded hover:bg-ink-100"><MoreVertical size={18} /></button>} items={[
            { label: 'View policy', onClick: () => navigate(`/policies/${p.id}`) },
            { label: 'Transactions', onClick: () => navigate(`/policies/${p.id}?tab=history`) },
            { label: 'Proof of insurance / ID cards', onClick: () => navigate(`/accounts/${account.id}?tab=documents`) },
            { label: 'Log activity', onClick: () => navigate(`/accounts/${account.id}?tab=activities`) },
          ]} />
          <button type="button" aria-label={open ? 'Collapse policy' : 'Expand policy'} aria-expanded={open} onClick={() => setOpen(!open)} className="w-8 h-8 grid place-items-center rounded hover:bg-ink-100">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 px-2.5 py-2 text-[13px]">
        {metric('Premium', fmtMoney(p.premium, true))}
        {metric('Term', `${mdy(p.effective_date)} to ${mdy(p.expiration_date)}`)}
        {metric('Transaction Type', latest)}
        {metric('Writing Company', p.carrier.toUpperCase())}
        {metric('Service Team', team)}
        {metric('LOB Origination Date', mdy(origination))}
      </div>
      <div className="bg-[#f5f6f8] border-t border-[#e2e8f0] px-3 py-2.5 rounded-b">
        <PolicyLabels policy={p} />
        {open && (
          <div className="mt-3 text-[13px] space-y-2" data-testid="policy-expanded">
            <div className="text-ink-700">{[account.address, account.city, account.state, account.zip].filter(Boolean).join(', ')}</div>
            {(p.coverages ?? []).length > 0 && (
              <table className="w-full max-w-xl text-[12.5px]">
                <tbody>{p.coverages.map((c) => <tr key={c.name} className="border-b border-[#e2e8f0] last:border-0"><td className="py-1 text-ink-800">{c.name}</td><td className="py-1 text-ink-600">{c.limit}</td><td className="py-1 text-ink-600">{c.deductible ? `Ded ${c.deductible}` : ''}</td></tr>)}</tbody>
              </table>
            )}
            {p.notes && <div className="text-ink-600 whitespace-pre-wrap">{p.notes}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Applications (quotes in progress) ──

function ApplicationCard({ quote: q }: { quote: Quote }) {
  const best = bestRate(q.results);
  const quoted = (q.results ?? []).filter((r) => r.status === 'Quoted').length;
  const open = () => navigate(workflowPath(q) ?? `/quotes/${q.id}`);
  return (
    <div className="border border-[#e2e8f0] rounded bg-white hover:shadow-card transition-shadow px-3 py-2.5 flex flex-wrap items-center gap-3">
      <span className={cx('inline-flex items-center h-[22px] px-2.5 rounded-full text-[12px] font-medium', q.status === 'Rated' ? 'bg-[#e6f4f1] text-[#007a78]' : 'bg-ink-100 text-ink-700')}>{q.status === 'Rated' ? 'Quoted' : 'In progress'}</span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={open} className="text-[15px] font-semibold text-ink-900 hover:text-brand-600 hover:underline text-left">{lobTitle(q)} application</button>
        <div className="text-[12px] text-ink-500">Effective {mdy(q.effective_date)} · started {mdy(q.created_at)}</div>
      </div>
      <div className="text-[13px] text-right">
        {best ? <><div className="font-semibold text-ink-900">{fmtMoney(best.premium)}</div><div className="text-[11px] text-ink-500">lowest of {quoted} quote{quoted === 1 ? '' : 's'}</div></> : <div className="text-ink-500">Not yet submitted</div>}
      </div>
      <Button size="sm" onClick={open}>Open</Button>
    </div>
  );
}

type PolicyFilter = 'all' | 'active' | 'inactive';
type PolicySort = 'effective' | 'premium' | 'lob';

function PoliciesCard({ account, policies, quotes, txns }: { account: Account; policies: Policy[]; quotes: Quote[]; txns: PolicyTransaction[] }) {
  const [tab, setTab] = useState<'policies' | 'applications'>('policies');
  const [filter, setFilter] = useState<PolicyFilter>('all');
  const [sort, setSort] = useState<PolicySort>('effective');
  const apps = quotes.filter((q) => q.status === 'Draft' || q.status === 'Rated').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shown = policies
    .filter((p) => (filter === 'all' ? true : filter === 'active' ? isActive(p) : !isActive(p)))
    .sort((a, b) => (sort === 'premium' ? Number(b.premium) - Number(a.premium) : sort === 'lob' ? a.line_of_business.localeCompare(b.line_of_business) : b.effective_date.localeCompare(a.effective_date)));
  const tabBtn = (key: typeof tab, label: string, count: number, icon: ReactNode) => (
    <button type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      className={cx('flex items-center gap-3 px-6 h-12 border-b-[3px] text-[19px] font-semibold tracking-wide transition-colors', tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-800')}>
      <CountIcon icon={icon} count={count} /> {label}
    </button>
  );
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-card min-h-[520px]">
      <div className="flex items-center border-b border-[#e2e8f0] pr-2" role="tablist">
        {tabBtn('policies', 'Policies', policies.length, <Folder size={22} className={tab === 'policies' ? 'fill-brand-600 text-brand-600' : 'text-ink-500'} />)}
        {tabBtn('applications', 'Applications', apps.length, <FileText size={22} />)}
        <div className="flex-1" />
        <Menu trigger={<button type="button" aria-label="Filter policies" title="Filter" className={cx('w-9 h-9 grid place-items-center rounded hover:bg-ink-100', filter !== 'all' ? 'text-brand-600' : 'text-ink-800')}><ListFilter size={20} /></button>} items={[
          { label: `${filter === 'all' ? '✓ ' : ''}All policies`, onClick: () => setFilter('all') },
          { label: `${filter === 'active' ? '✓ ' : ''}Active only`, onClick: () => setFilter('active') },
          { label: `${filter === 'inactive' ? '✓ ' : ''}Inactive only`, onClick: () => setFilter('inactive') },
        ]} />
        <Menu trigger={<button type="button" aria-label="Policy settings" title="Sort" className="w-9 h-9 grid place-items-center rounded hover:bg-ink-100 text-ink-800"><Settings size={20} /></button>} items={[
          { label: `${sort === 'effective' ? '✓ ' : ''}Sort by effective date`, onClick: () => setSort('effective') },
          { label: `${sort === 'premium' ? '✓ ' : ''}Sort by premium`, onClick: () => setSort('premium') },
          { label: `${sort === 'lob' ? '✓ ' : ''}Sort by line of business`, onClick: () => setSort('lob') },
          'divider',
          { label: 'Add a policy', onClick: () => navigate(`/accounts/${account.id}?tab=policies`) },
        ]} />
      </div>
      <div className="p-2 space-y-2">
        {tab === 'policies' && (shown.length ? shown.map((p) => <PolicyCard key={p.id} policy={p} account={account} txns={txns} />) : (
          <div className="text-center py-16 text-[13px] text-ink-500">{policies.length ? 'No policies match this filter.' : 'No policies yet. Quote and bind, or add an existing policy.'}</div>
        ))}
        {tab === 'applications' && (apps.length ? apps.map((q) => <ApplicationCard key={q.id} quote={q} />) : (
          <div className="text-center py-16 text-[13px] text-ink-500">No applications in progress.
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" variant="primary" onClick={() => navigate(`/accounts/${account.id}/auto-quote`)}>Start auto</Button>
              <Button size="sm" variant="primary" onClick={() => navigate(`/accounts/${account.id}/home-quote`)}>Start home</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tasks & campaigns ──

function TasksCard({ account, activities }: { account: Account; activities: Activity[] }) {
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  const open = activities.filter((a) => a.status !== 'Completed').sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  const complete = async (a: Activity) => {
    try { await db.update('activities', a.id, { status: 'Completed', completed_at: new Date().toISOString() }); toast('Task completed'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-card min-h-[250px] flex flex-col">
      <div className="flex items-center gap-3 px-5 h-12 border-b border-[#e2e8f0]">
        <CountIcon icon={<Square size={22} className="text-ink-800" />} count={open.length} />
        <span className="text-[17px] font-semibold text-ink-900 ml-1">Tasks</span>
        <div className="flex-1" />
        <Menu trigger={<button type="button" aria-label="Task settings" className="w-9 h-9 grid place-items-center rounded hover:bg-ink-100 text-ink-800"><Settings size={20} /></button>} items={[
          { label: 'Add task', onClick: () => setAdding(true) },
          { label: 'View all activity', onClick: () => navigate(`/accounts/${account.id}?tab=activities`) },
        ]} />
      </div>
      {open.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center py-10">
          <div><span className="w-10 h-10 mx-auto rounded bg-[#90a4ae] text-white grid place-items-center"><CheckSquare size={26} /></span><div className="text-[13px] text-ink-700 mt-3">There are no tasks.</div></div>
        </div>
      ) : (
        <ul className="divide-y divide-[#e2e8f0]">
          {open.slice(0, 6).map((t) => {
            const d = t.due_date ? daysUntil(t.due_date) : null;
            return (
              <li key={t.id} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
                <button type="button" aria-label={`Complete ${t.subject}`} onClick={() => void complete(t)} className="mt-0.5 text-ink-500 hover:text-brand-600"><Square size={16} /></button>
                <div className="min-w-0 flex-1">
                  <div className="text-ink-900 truncate">{t.subject}</div>
                  <div className={cx('text-[11.5px]', d !== null && d < 0 ? 'text-red-600' : 'text-ink-500')}>{t.type} · {t.due_date ? `due ${mdy(t.due_date)}` : 'no due date'} · {t.assigned_to ?? 'Unassigned'}</div>
                </div>
              </li>
            );
          })}
          {open.length > 6 && <li className="px-4 py-2 text-[12px]"><a href={href(`/accounts/${account.id}?tab=activities`)} className="text-brand-600 hover:underline">View all {open.length} tasks</a></li>}
        </ul>
      )}
      {adding && <ActivityFormModal defaults={{ account_id: account.id, type: 'Task' }} onClose={() => setAdding(false)} />}
    </div>
  );
}

function CampaignsCard({ account }: { account: Account }) {
  const campaigns = useTable('email_campaigns', { order: { column: 'created_at', ascending: false } });
  const lists = useTable('recipient_lists');
  const messages = useTable('messages', { eq: { account_id: account.id } });
  const policies = useTable('policies', { eq: { account_id: account.id } });
  const rows = useMemo(() => campaigns.data.flatMap((c): { c: EmailCampaign; state: 'Sent' | 'Scheduled' }[] => {
    if (c.status === 'Sent') return campaignMessages(c, messages.data).length ? [{ c, state: 'Sent' as const }] : [];
    if (c.status === 'Scheduled') {
      const list = lists.data.find((l) => l.id === c.recipient_list_id);
      return list && matchRecipients(list.filters ?? {}, [account], policies.data).length ? [{ c, state: 'Scheduled' as const }] : [];
    }
    return [];
  }), [campaigns.data, lists.data, messages.data, policies.data, account]);
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-card min-h-[420px] flex flex-col">
      <div className="flex items-center gap-3 px-5 h-12 border-b border-[#e2e8f0]">
        <CountIcon icon={<MailOpen size={22} className="text-ink-800" />} count={rows.length} />
        <span className="text-[17px] font-semibold text-ink-900 ml-1">Campaigns</span>
        <div className="flex-1" />
        <Menu trigger={<button type="button" aria-label="Campaign settings" className="w-9 h-9 grid place-items-center rounded hover:bg-ink-100 text-ink-800"><Settings size={20} /></button>} items={[
          { label: 'All campaigns', onClick: () => navigate('/comm/campaigns') },
          { label: 'Recipient lists', onClick: () => navigate('/comm/lists') },
        ]} />
      </div>
      {rows.length ? (
        <ul className="divide-y divide-[#e2e8f0] flex-1">
          {rows.map(({ c, state }) => (
            <li key={c.id} className="px-4 py-2.5 text-[13px]">
              <a href={href(`/comm/campaigns/${c.id}`)} className="text-ink-900 font-medium hover:text-brand-600 hover:underline">{c.name}</a>
              <div className="text-[11.5px] text-ink-500">{state} {state === 'Sent' ? mdy(c.sent_at) : mdy(c.scheduled_at)} · {c.subject}</div>
            </li>
          ))}
        </ul>
      ) : <div className="flex-1 flex items-end justify-center pb-4 text-[13px] text-ink-700">No sent or scheduled campaigns</div>}
      <div className="px-5 pb-6 pt-2 flex justify-center"><Button variant="primary" onClick={() => navigate('/comm/campaigns/new')}>Send new campaign</Button></div>
    </div>
  );
}

// ── Catch me up ──

export function CatchMeUpModal({ account, policies, quotes, activities, onClose }: { account: Account; policies: Policy[]; quotes: Quote[]; activities: Activity[]; onClose: () => void }) {
  const claims = useTable('claims', { eq: { account_id: account.id } });
  const invoices = useTable('invoices', { eq: { account_id: account.id } });
  const messages = useTable('messages', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false }, limit: 5 });
  const active = policies.filter(isActive);
  const premium = active.reduce((s, p) => s + Number(p.premium), 0);
  const next = active.map((p) => p.expiration_date).sort()[0];
  const openTasks = activities.filter((a) => a.status !== 'Completed');
  const overdue = openTasks.filter((a) => a.due_date && a.due_date < today());
  const openClaims = claims.data.filter((c) => c.status === 'Open' || c.status === 'Under Review');
  const balance = invoices.data.filter((i) => i.status !== 'Void').reduce((s, i) => s + Number(i.amount) - Number(i.amount_paid), 0);
  const apps = quotes.filter((q) => q.status === 'Draft' || q.status === 'Rated');
  const lastActivity = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const lastMsg = messages.data[0];
  const lines: ReactNode[] = [
    <><b>{account.status ?? 'Prospect'}</b> {account.account_type === 'Commercial' ? 'commercial' : 'personal lines'} client since {mdy(account.customer_since ?? account.created_at)}; producer {account.producer ?? 'unassigned'}, CSR {account.csr ?? 'unassigned'}.</>,
    active.length ? <><b>{active.length} active polic{active.length === 1 ? 'y' : 'ies'}</b> ({[...new Set(active.map((p) => p.line_of_business))].join(', ')}) totalling {fmtMoney(premium)}; next renewal {mdy(next)}{next ? ` (${daysUntil(next)} days)` : ''}.</> : <>No active policies{policies.length ? ` (${policies.length} inactive on file)` : ''}.</>,
    apps.length ? <><b>{apps.length} application{apps.length === 1 ? '' : 's'} in progress</b>: {apps.map((q) => `${q.line_of_business} (${q.status === 'Rated' ? `quoted, lowest ${fmtMoney(bestRate(q.results)?.premium ?? null)}` : 'not yet submitted'})`).join('; ')}.</> : null,
    openTasks.length ? <><b>{openTasks.length} open task{openTasks.length === 1 ? '' : 's'}</b>{overdue.length ? <>, <span className="text-red-700">{overdue.length} overdue</span></> : ''}: {openTasks.slice(0, 3).map((t) => t.subject).join('; ')}.</> : <>No open tasks.</>,
    openClaims.length ? <><b>{openClaims.length} open claim{openClaims.length === 1 ? '' : 's'}</b>: {openClaims.map((c) => `${c.claim_number} (${c.status})`).join(', ')}.</> : null,
    balance > 0 ? <><b>Balance due {fmtMoney(balance, true)}</b> on agency-billed invoices.</> : null,
    lastActivity ? <>Last activity {mdy(lastActivity.created_at)}: {lastActivity.subject}.</> : null,
    lastMsg ? <>Last message {mdy(lastMsg.created_at)} ({lastMsg.channel}, {lastMsg.direction.toLowerCase()}): {(lastMsg.subject || lastMsg.body || '').slice(0, 90)}.</> : null,
  ].filter(Boolean);
  return (
    <Modal title={<span className="inline-flex items-center gap-2"><Sparkles size={18} className="text-[#7048e8]" /> Catch me up</span>} subtitle={account.account_type === 'Commercial' ? account.business_name ?? undefined : `${account.first_name} ${account.last_name}`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <ul className="space-y-2.5 text-[13.5px] text-ink-800 list-disc pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="text-[11px] text-ink-400 mt-4">Summary generated from this account's policies, applications, tasks, claims, billing and messages.</p>
    </Modal>
  );
}

// ── Overview body ──

export function AccountOverviewBody({ account, policies, quotes, activities }: { account: Account; policies: Policy[]; quotes: Quote[]; activities: Activity[] }) {
  const txns = useTable('policy_transactions', { eq: { account_id: account.id } });
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-4">
      <PoliciesCard account={account} policies={policies} quotes={quotes} txns={txns.data} />
      <div className="space-y-4">
        <TasksCard account={account} activities={activities} />
        <CampaignsCard account={account} />
      </div>
    </div>
  );
}

