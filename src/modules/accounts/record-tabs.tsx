import {
  ArrowDown, ArrowUp, CalendarCheck, CheckSquare, ChevronDown, ChevronUp, Clock, FilePlus2, FileText, Filter, Layers, Mail, MoreVertical, Phone, RefreshCw, Search, UserSearch, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AccountPicker } from '@/components/pickers';
import { Button, ErrorBanner, Field, Input, Menu, Modal, Select, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { accountName, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { Account, Activity, ActivityType, Policy, Quote } from '@/lib/types';
import { ActivityFormModal } from '@/modules/activities/parts';
import { useLeadSourceOptions } from '@/modules/admin/integration';
import { saveAppConfig, useAppConfig, type CertificateMaster, type LeadDetails, type SoldPolicy } from '@/modules/admin/config';
import { PolicyFormModal } from '@/modules/policies/PolicyFormModal';
import { PolicyList } from '@/modules/policies';
import { lobTitle, mdy } from '@/modules/policies/extras';
import { FillModal } from '@/modules/policymgmt/acord';
import { Acord25PdfModal, useAcordFile } from '@/modules/policymgmt/acord25';
import { ACORD_FORMS } from '@/modules/policymgmt/acord-html';
import { workflowPath } from '@/modules/quotes/data';
import { openDocumentFile } from '@/modules/documents/shared';
import { PolicyCard } from './overview';

/* EZLynx-style record tabs: Policies, Quotes, Lead Info, Certificates (masters) and Account Activity. */

/** Renders header actions into the record's title bar (right side), as EZLynx places them. */
export function HeadActions({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
  return slot ? createPortal(children, slot) : null;
}

const outline = 'inline-flex items-center gap-1.5 h-9 px-4 rounded border border-ink-300 bg-white text-[13px] font-semibold tracking-wide text-brand-700 hover:bg-brand-50';
const card = 'bg-white border border-[#e2e8f0] rounded shadow-card';

// ── Policies ──

const STATUS_ORDER: Record<string, number> = { Active: 0, Pending: 1, Expired: 2, 'Non-Renewed': 3, Cancelled: 4 };
const SORTS = [
  { value: 'status', label: 'Policy Status (Default)' }, { value: 'effective', label: 'Effective Date' }, { value: 'expiration', label: 'Expiration Date' },
  { value: 'premium', label: 'Premium' }, { value: 'line', label: 'Line of Business' },
] as const;
type SortKey = (typeof SORTS)[number]['value'];

function timeWithAgency(since: string) {
  const a = new Date(since), b = new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  months = Math.max(0, months);
  const y = Math.floor(months / 12), m = months % 12;
  if (!y && !m) return 'Less than a month';
  return [y && `${y} year${y === 1 ? '' : 's'}`, m && `${m} month${m === 1 ? '' : 's'}`].filter(Boolean).join(', ');
}

export function PoliciesTab({ account, slot }: { account: Account; slot: HTMLElement | null }) {
  const policies = useTable('policies', { eq: { account_id: account.id } });
  const txns = useTable('policy_transactions', { eq: { account_id: account.id } });
  const quotes = useTable('quotes', { eq: { account_id: account.id } });
  const [table, setTable] = useState(false);
  const [sort, setSort] = useState<SortKey>('status');
  const [asc, setAsc] = useState(true);
  const [adding, setAdding] = useState(false);
  const inForce = policies.data.filter((p) => p.status === 'Active' || p.status === 'Pending');
  const written = inForce.reduce((s, p) => s + Number(p.premium), 0);
  const annual = inForce.reduce((s, p) => s + Number(p.premium) * (12 / Math.max(1, p.term_months)), 0);
  const sorted = useMemo(() => {
    const key = (p: Policy): string | number => (sort === 'status' ? STATUS_ORDER[p.status] ?? 9 : sort === 'effective' ? p.effective_date : sort === 'expiration' ? p.expiration_date : sort === 'premium' ? Number(p.premium) : lobTitle(p));
    return [...policies.data].sort((a, b) => { const x = key(a), y = key(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return (asc ? c : -c) || a.policy_number.localeCompare(b.policy_number); });
  }, [policies.data, sort, asc]);
  return (
    <div>
      <HeadActions slot={slot}>
        <button type="button" className={outline} onClick={() => navigate('/admin/automation')}>Set up automation</button>
        <Button variant="primary" className="h-9 px-4 tracking-wide" onClick={() => setAdding(true)}>Add policy</Button>
      </HeadActions>
      <div className="flex flex-wrap items-stretch gap-3">
        <div className={cx(card, 'flex-1 min-w-[280px] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-200 py-3')} data-testid="policy-metrics">
          {([['Total Written Premium', fmtMoney(written, true)], ['Total Annualized Premium', fmtMoney(annual, true)], ['Time with Agency', timeWithAgency(account.customer_since ?? account.created_at)]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="text-center px-3 py-1"><div className="text-[13px] text-ink-800">{k}</div><div className="text-[20px] font-semibold text-ink-900">{v}</div></div>
          ))}
        </div>
        <div className="flex items-start"><button type="button" onClick={() => setTable(!table)} className="h-9 px-4 rounded bg-[#6b46c1] text-white text-[13px] font-semibold tracking-wide hover:bg-[#583da1]">{table ? 'Card view' : 'Table view'}</button></div>
      </div>
      {table ? <div className="mt-4"><PolicyList accountId={account.id} /></div> : (
        <>
          <div className="flex justify-end items-center gap-2 mt-4">
            <label className="relative">
              <span className="absolute -top-2 left-2 bg-[#f2f4f7] px-1 text-[11px] text-ink-600">Sort</span>
              <select aria-label="Sort policies" className="h-10 min-w-[190px] rounded border border-ink-300 bg-white px-2 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </label>
            <button type="button" aria-label={asc ? 'Sort descending' : 'Sort ascending'} onClick={() => setAsc(!asc)} className="w-9 h-9 grid place-items-center rounded hover:bg-ink-100">{asc ? <ArrowUp size={18} /> : <ArrowDown size={18} />}</button>
          </div>
          {policies.loading && !policies.data.length ? <div className="py-8 text-center text-[13px] text-ink-500">Loading policies…</div> : sorted.length ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">{sorted.map((p) => <PolicyCard key={p.id} policy={p} account={account} txns={txns.data} policies={policies.data} quotes={quotes.data} columns={2} />)}</div>
          ) : (
            <div className={cx(card, 'mt-3 py-10 text-center text-[13px] text-ink-500')}>No policies yet. Use <b>Add policy</b> to record one.</div>
          )}
        </>
      )}
      {adding && <PolicyFormModal accountId={account.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

// ── Quotes ──

const lobShort = (line: string) => (line === 'Personal Auto' ? 'Auto' : line === 'Homeowners' ? 'Home' : line);
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
function quoteDescription(q: Quote) {
  const input = q.input as { workflow?: { rating?: { description?: string } }; description?: string } | null;
  return input?.workflow?.rating?.description || input?.description || '';
}

export function QuotesTab({ account, slot }: { account: Account; slot: HTMLElement | null }) {
  const quotes = useTable('quotes', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState<string | null>(null);
  const commercial = account.account_type === 'Commercial';
  const go = (q: Quote) => navigate(workflowPath(q) ?? `/quotes/${q.id}`);
  const remove = async (q: Quote) => {
    if (!(await confirm({ title: 'Delete this quote?', message: `The ${lobShort(q.line_of_business)} quote from ${stamp(q.created_at)} will be permanently deleted.`, confirmLabel: 'Delete quote', danger: true }))) return;
    try { await db.remove('quotes', q.id); toast('Quote deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const th = 'px-4 py-3 text-left text-[13px] font-semibold text-ink-900 border-b border-ink-200';
  return (
    <div>
      <HeadActions slot={slot}>
        <Menu trigger={<button type="button" className={outline}>Add quote</button>} items={commercial
          ? [{ label: 'Commercial quote', onClick: () => navigate(`/quotes/new?account=${account.id}&line=${encodeURIComponent('General Liability')}`) }]
          : [
            { label: 'Auto', onClick: () => navigate(`/accounts/${account.id}/auto-quote`) },
            { label: 'Home', onClick: () => navigate(`/accounts/${account.id}/home-quote`) },
            { label: 'Other lines', onClick: () => navigate(`/quotes/new?account=${account.id}&line=Renters`) },
          ]} />
      </HeadActions>
      <div className={card}>
        <table className="w-full border-collapse" aria-label="Quotes">
          <thead><tr><th className={th}>Last Rate</th><th className={th}>LOB</th><th className={th}>Description</th><th className={th}>Sales Center</th><th className={cx(th, 'w-24')} /></tr></thead>
          <tbody>
            {quotes.loading && !quotes.data.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-ink-500">Loading quotes…</td></tr>}
            {!quotes.loading && !quotes.data.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-500">No quotes yet. Use <b>Add quote</b> to start one.</td></tr>}
            {quotes.data.map((q) => {
              const isOpen = open === q.id;
              const quoted = (q.results ?? []).filter((r) => r.status === 'Quoted');
              return [
                <tr key={q.id} className="hover:bg-[#f7f9fb]" data-testid="quote-row">
                  <td className="px-4 py-3.5 text-[13px] border-b border-ink-100"><button type="button" className="hover:text-brand-700 hover:underline" onClick={() => go(q)}>{stamp(q.created_at)}</button></td>
                  <td className="px-4 py-3.5 text-[13px] border-b border-ink-100">{lobShort(q.line_of_business)}</td>
                  <td className="px-4 py-3.5 text-[13px] border-b border-ink-100 text-ink-700">{quoteDescription(q)}</td>
                  <td className="px-4 py-3.5 text-[13px] border-b border-ink-100 text-ink-700">{q.status === 'Bound' ? 'Sold' : ''}</td>
                  <td className="px-2 py-2 border-b border-ink-100 text-right whitespace-nowrap">
                    <Menu trigger={<button type="button" aria-label="Quote actions" className="w-8 h-8 inline-grid place-items-center rounded hover:bg-ink-100"><MoreVertical size={18} /></button>} items={[
                      { label: 'Open', onClick: () => go(q) },
                      { label: 'View quote record', onClick: () => navigate(`/quotes/${q.id}`) },
                      { label: 'Edit & re-rate', disabled: q.status === 'Bound', onClick: () => { const wf = workflowPath(q); navigate(wf ? `${wf}?step=review` : `/quotes/new?quote=${q.id}`); } },
                      'divider',
                      { label: 'Delete', danger: true, onClick: () => void remove(q) },
                    ]} />
                    <button type="button" aria-label={isOpen ? 'Collapse quote' : 'Expand quote'} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q.id)} className="w-8 h-8 inline-grid place-items-center rounded hover:bg-ink-100">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${q.id}-x`} data-testid="quote-expanded"><td colSpan={5} className="px-6 py-3 bg-[#f7f9fb] border-b border-ink-100 text-[13px]">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink-700 mb-2"><span>Status: <b>{q.status}</b></span><span>Effective: <b>{mdy(q.effective_date)}</b></span><span>{quoted.length} of {q.results?.length ?? 0} carriers quoted</span>{q.selected_carrier && <span>Selected: <b>{q.selected_carrier}</b></span>}</div>
                    {(q.results ?? []).length ? (
                      <table className="text-[12.5px]"><tbody>{q.results.map((r) => <tr key={r.carrier}><td className="pr-6 py-0.5">{r.carrier}</td><td className="pr-6">{r.status}</td><td className="tabular-nums">{r.premium != null ? `${fmtMoney(r.premium, true)} / ${r.term_months} mo` : r.message ?? '—'}</td></tr>)}</tbody></table>
                    ) : <div className="text-ink-500">Not submitted to carriers yet.</div>}
                  </td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Lead Info ──

const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Hot'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Quoting', 'Proposal Sent', 'Negotiating', 'Won', 'Lost', 'Unresponsive'];
const PROBABILITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const TERMS = ['6 Months', '12 Months'];
const BLANK_SOLD: SoldPolicy = { carrier: '', sold_date: '', policy_number: '', premium: '', term: '', renewal_date: '' };
const addMonthsIso = (iso: string, m: number) => { const d = new Date(`${iso}T12:00:00`); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

export function LeadInfoTab({ account }: { account: Account }) {
  const { activeStaff, carriers } = useAppData();
  const { toast } = useFeedback();
  const { value } = useAppConfig('lead_details');
  const saved = value.byAccount[account.id];
  const details: LeadDetails = saved ?? { package_policy: false, auto: BLANK_SOLD, home: BLANK_SOLD, contact_me: false };
  const sources = useLeadSourceOptions(account.lead_source, ['Referral', 'Website', 'Walk-in', 'Google Ads', 'Facebook', 'Existing Client', 'Cold Call']);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<number>();
  const flash = () => { setStatus('saved'); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setStatus('idle'), 1800); };
  const setAccount = async (patch: Partial<Account>) => {
    setStatus('saving');
    try { await db.update('accounts', account.id, patch); flash(); } catch (e) { setStatus('idle'); toast((e as Error).message, 'error'); }
  };
  const setDetails = async (fn: (d: LeadDetails) => LeadDetails) => {
    setStatus('saving');
    try {
      const [row] = await db.list('app_config', { eq: { key: 'lead_details' } });
      const all = (row?.value as { byAccount?: Record<string, LeadDetails> } | undefined)?.byAccount ?? {};
      await saveAppConfig('lead_details', { byAccount: { ...all, [account.id]: fn(structuredClone(all[account.id] ?? details)) } });
      flash();
    } catch (e) { setStatus('idle'); toast((e as Error).message, 'error'); }
  };
  const setSold = (which: 'auto' | 'home', patch: Partial<SoldPolicy>) => void setDetails((d) => {
    const next = { ...d[which], ...patch };
    // Renewal date follows sold date + term until it is typed in.
    if (('sold_date' in patch || 'term' in patch) && next.sold_date && next.term && !patch.renewal_date) next.renewal_date = addMonthsIso(next.sold_date, next.term.startsWith('6') ? 6 : 12);
    return { ...d, [which]: next };
  });
  const lbl = 'text-[13px] text-ink-800';
  const ctl = 'h-9 w-full max-w-[160px] rounded border border-ink-300 bg-white px-2 text-[13px] outline-none focus:border-brand-500';
  const row = (label: string, control: ReactNode) => <div className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-3 min-h-[40px]"><span className={lbl}>{label}</span><div>{control}</div></div>;
  const carrierOpts = carriers.map((c) => c.name);
  const soldCol = (which: 'auto' | 'home', title: string) => {
    const v = details[which];
    return (
      <div>
        {row(`${title} Carrier`, <select aria-label={`${title} Carrier`} className={ctl} value={v.carrier} onChange={(e) => setSold(which, { carrier: e.target.value })}><option value="" />{[...new Set([v.carrier, ...carrierOpts].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}</select>)}
        {row(`${title} Sold Date`, <input aria-label={`${title} Sold Date`} type="date" className={ctl} value={v.sold_date} max={today()} onChange={(e) => setSold(which, { sold_date: e.target.value })} />)}
        {row(`${title} Policy Number`, <input aria-label={`${title} Policy Number`} className={ctl} defaultValue={v.policy_number} maxLength={30} onBlur={(e) => e.target.value !== v.policy_number && setSold(which, { policy_number: e.target.value.trim() })} />)}
        {row(`${title} Premium`, <input aria-label={`${title} Premium`} className={ctl} inputMode="decimal" defaultValue={v.premium} onBlur={(e) => { const n = e.target.value.replace(/[^\d.]/g, ''); if (n !== v.premium) setSold(which, { premium: n }); }} />)}
        {row(`${title} Term`, <select aria-label={`${title} Term`} className={ctl} value={v.term} onChange={(e) => setSold(which, { term: e.target.value })}><option value="" />{TERMS.map((t) => <option key={t}>{t}</option>)}</select>)}
        {row(`${title} Renewal Date`, <input aria-label={`${title} Renewal Date`} type="date" className={ctl} value={v.renewal_date} onChange={(e) => setSold(which, { renewal_date: e.target.value })} />)}
      </div>
    );
  };
  return (
    <div className="max-w-[1000px]" data-testid="lead-info">
      <div className="h-5 text-right text-[12px] text-ink-500">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16">
        <div>
          {row('Lead Source', <select aria-label="Lead Source" className={ctl} value={account.lead_source ?? ''} onChange={(e) => void setAccount({ lead_source: e.target.value || null })}><option value="" />{sources.map((s) => <option key={s}>{s}</option>)}</select>)}
          {row('Lead Priority', <select aria-label="Lead Priority" className={ctl} value={account.lead_priority ?? ''} onChange={(e) => void setAccount({ lead_priority: e.target.value || null })}><option value="" />{LEAD_PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>)}
          {row('Probability of Sale', <select aria-label="Probability of Sale" className={ctl} value={account.probability_of_sale ?? ''} onChange={(e) => void setAccount({ probability_of_sale: e.target.value ? Number(e.target.value) : null })}><option value="" />{PROBABILITIES.map((n) => <option key={n} value={n}>{n}%</option>)}</select>)}
        </div>
        <div>
          {row('Assigned Producer', <div className="relative max-w-[160px]"><select aria-label="Assigned Producer" className={cx(ctl, 'pr-8 uppercase')} value={account.producer ?? ''} onChange={(e) => void setAccount({ producer: e.target.value || null })}><option value="" />{[...new Set([account.producer, ...activeStaff.map((s) => s.name)].filter(Boolean) as string[])].map((n) => <option key={n}>{n}</option>)}</select><Users size={16} className="absolute right-2 top-2.5 text-ink-700 pointer-events-none" /></div>)}
          {row('Lead Status', <select aria-label="Lead Status" className={ctl} value={account.lead_status ?? ''} onChange={(e) => void setAccount({ lead_status: e.target.value || null })}><option value="" />{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>)}
        </div>
      </div>
      <h3 className="text-[14px] text-ink-900 mt-2 mb-1">Sold Policy Information</h3>
      {row('Package Policy', <input aria-label="Package Policy" type="checkbox" className="w-4 h-4 accent-[#007a78]" checked={details.package_policy} onChange={(e) => { const on = e.target.checked; void setDetails((d) => ({ ...d, package_policy: on })); }} />)}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16">{soldCol('auto', 'Auto')}{soldCol('home', 'Home')}</div>
      <h3 className="text-[14px] text-ink-900 mt-4 mb-1">Consumer Quoting Portal Information</h3>
      <label className="inline-flex items-center gap-2 text-[13px] text-ink-400"><span>&ldquo;Contact Me&rdquo; Chosen</span><input type="checkbox" className="w-4 h-4" checked={details.contact_me} disabled readOnly /></label>
      <div className="flex flex-col items-center gap-2 py-8 text-[13px] text-ink-700"><UserSearch size={34} className="text-ink-500" />No records found. Modify your search and try again.</div>
    </div>
  );
}

// ── Certificates (masters) ──

export function CertificateMastersTab({ account }: { account: Account }) {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const { value } = useAppConfig('certificate_masters');
  const masters = useMemo(() => value.byAccount[account.id] ?? [], [value, account.id]);
  const policies = useTable('policies', { eq: { account_id: account.id } });
  const docs = useTable('documents', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const acord25 = useAcordFile('25').file;
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CertificateMaster | 'new' | null>(null);
  const [issuing, setIssuing] = useState<CertificateMaster | null>(null);
  const [dataSheet, setDataSheet] = useState(false);
  const current = masters.find((m) => m.id === selected) ?? null;
  useEffect(() => { if (!current && masters[0]) setSelected(masters[0].id); }, [current, masters]);
  const certs = docs.data.filter((d) => d.category === 'Proof of Insurance' || /certificate|ACORD 2[57]/i.test(d.name));
  const save = async (fn: (list: CertificateMaster[]) => CertificateMaster[]) => {
    const [row] = await db.list('app_config', { eq: { key: 'certificate_masters' } });
    const all = (row?.value as { byAccount?: Record<string, CertificateMaster[]> } | undefined)?.byAccount ?? {};
    await saveAppConfig('certificate_masters', { byAccount: { ...all, [account.id]: fn([...(all[account.id] ?? [])]) } });
  };
  const remove = async (m: CertificateMaster) => {
    if (!(await confirm({ title: `Delete "${m.name}"?`, message: 'Certificates already issued from this master are kept.', confirmLabel: 'Delete master', danger: true }))) return;
    try { await save((l) => l.filter((x) => x.id !== m.id)); setSelected(null); toast('Certificate master deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const openDoc = async (id: string) => {
    const d = docs.data.find((x) => x.id === id); if (!d) return;
    const win = window.open('', '_blank');
    try { if (!(await openDocumentFile(d, false, win))) toast('This document has no file attached', 'error'); } catch (e) { win?.close(); toast((e as Error).message, 'error'); }
  };
  const form = (code: string) => ACORD_FORMS.find((f) => f.code === code);
  return (
    <div className="flex min-h-[calc(var(--vh100)-190px)] bg-[#f7f8fa]" data-testid="certificates">
      <aside className="w-[250px] shrink-0 border-r border-ink-200 flex flex-col">
        {masters.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-ink-800">
            <FileText size={34} className="text-ink-500 fill-ink-400" />No certificate masters have been added.
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>Add certificate master</Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto" aria-label="Certificate masters">
              {masters.map((m) => (
                <li key={m.id}><button type="button" onClick={() => setSelected(m.id)} className={cx('w-full text-left px-4 py-3 border-b border-ink-200 text-[13px]', m.id === selected ? 'bg-white border-l-4 border-l-brand-600' : 'hover:bg-white')}>
                  <div className="font-semibold text-ink-900">{m.name}</div><div className="text-[12px] text-ink-500">ACORD {m.form} · {m.policy_ids.length} polic{m.policy_ids.length === 1 ? 'y' : 'ies'}</div>
                </button></li>
              ))}
            </ul>
            <div className="p-3 border-t border-ink-200"><Button variant="primary" size="sm" className="w-full" onClick={() => setEditing('new')}>Add certificate master</Button></div>
          </>
        )}
      </aside>
      <section className="flex-1 min-w-0">
        {!current ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-[13px] text-ink-800"><Layers size={32} className="text-ink-500 fill-ink-400" />Once a certificate master has been added you can view its details here</div>
        ) : (
          <div className="p-5 space-y-4" data-testid="master-detail">
            <div className="flex flex-wrap items-start gap-3">
              <div><h2 className="text-[18px] font-semibold text-ink-900">{current.name}</h2><div className="text-[12.5px] text-ink-500">ACORD {current.form} {form(current.form)?.title ?? ''} · created {mdy(current.created_at)}{current.created_by ? ` by ${current.created_by}` : ''}</div></div>
              <div className="ml-auto flex gap-2">
                <Button onClick={() => setEditing(current)}>Edit</Button>
                <Button variant="danger" onClick={() => void remove(current)}>Delete</Button>
                <Button variant="primary" onClick={() => { setIssuing(current); setDataSheet(!acord25); }}>Issue certificate</Button>
              </div>
            </div>
            <div className={card}>
              <div className="px-4 py-2.5 border-b border-ink-100 text-[13px] font-semibold text-ink-900">Policies on this certificate</div>
              <table className="w-full text-[13px]"><tbody>
                {current.policy_ids.map((id) => policies.data.find((p) => p.id === id)).filter((p): p is Policy => !!p).map((p) => (
                  <tr key={p.id} className="border-b border-ink-100 last:border-0"><td className="px-4 py-2">{lobTitle(p)}</td><td className="px-4 py-2">{p.policy_number}</td><td className="px-4 py-2">{p.carrier}</td><td className="px-4 py-2">{mdy(p.effective_date)} – {mdy(p.expiration_date)}</td><td className={cx('px-4 py-2', p.status === 'Active' ? 'text-emerald-700' : 'text-red-600')}>{p.status}</td></tr>
                ))}
                {!current.policy_ids.some((id) => policies.data.some((p) => p.id === id)) && <tr><td className="px-4 py-3 text-ink-500">None of this master&rsquo;s policies exist any more. Edit it to choose policies.</td></tr>}
              </tbody></table>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
              <div className={cx(card, 'p-4')}><div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Default certificate holder</div><div className="whitespace-pre-wrap">{current.holder || '—'}</div></div>
              <div className={cx(card, 'p-4')}><div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Description of operations / remarks</div><div className="whitespace-pre-wrap">{current.remarks || '—'}</div></div>
            </div>
            <div className={card}>
              <div className="px-4 py-2.5 border-b border-ink-100 text-[13px] font-semibold text-ink-900">Certificates issued for this insured</div>
              {certs.length ? <ul className="divide-y divide-ink-100">{certs.map((d) => <li key={d.id} className="flex items-center gap-3 px-4 py-2 text-[13px]"><button type="button" className="flex-1 text-left hover:text-brand-700 hover:underline truncate" onClick={() => void openDoc(d.id)}>{d.name}</button><span className="text-ink-500">{mdy(d.created_at)}</span></li>)}</ul>
                : <div className="px-4 py-3 text-[13px] text-ink-500">None yet. Use Issue certificate.</div>}
            </div>
          </div>
        )}
      </section>
      {editing && (
        <MasterModal master={editing === 'new' ? null : editing} policies={policies.data} onClose={() => setEditing(null)} onSave={async (m) => {
          const isNew = editing === 'new';
          const row: CertificateMaster = isNew ? { ...m, id: uuid(), created_at: new Date().toISOString(), created_by: me?.name ?? null } : { ...(editing as CertificateMaster), ...m };
          await save((l) => (isNew ? [...l, row] : l.map((x) => (x.id === row.id ? row : x))));
          setSelected(row.id);
          toast(isNew ? 'Certificate master added' : 'Certificate master saved');
        }} />
      )}
      {issuing && acord25 && !dataSheet && <Acord25PdfModal file={acord25} initial={{ accountId: account.id, policyIds: issuing.policy_ids, holder: issuing.holder, remarks: issuing.remarks }} onClose={() => setIssuing(null)} onDataSheet={() => setDataSheet(true)} />}
      {issuing && (!acord25 || dataSheet) && form(issuing.form) && <FillModal form={form(issuing.form)!} initial={{ accountId: account.id, policyIds: issuing.policy_ids, holder: issuing.holder, remarks: issuing.remarks }} onClose={() => { setIssuing(null); setDataSheet(false); }} />}
    </div>
  );
}

function MasterModal({ master, policies, onClose, onSave }: { master: CertificateMaster | null; policies: Policy[]; onClose: () => void; onSave: (m: Pick<CertificateMaster, 'name' | 'form' | 'policy_ids' | 'holder' | 'remarks'>) => Promise<void> }) {
  const certForms = ACORD_FORMS.filter((f) => f.certificate);
  const [name, setName] = useState(master?.name ?? 'Certificate of Liability');
  const [form, setForm] = useState(master?.form ?? certForms[0]?.code ?? '25');
  const [picked, setPicked] = useState<string[]>(master?.policy_ids ?? policies.filter((p) => p.status === 'Active').map((p) => p.id));
  const [holder, setHolder] = useState(master?.holder ?? '');
  const [remarks, setRemarks] = useState(master?.remarks ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { setError('Name the master, e.g. "Certificate of Liability".'); return; }
    if (!picked.length) { setError('Choose at least one policy.'); return; }
    setBusy(true);
    try { await onSave({ name: name.trim(), form, policy_ids: picked, holder: holder.trim(), remarks: remarks.trim() }); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={master ? 'Edit certificate master' : 'Add certificate master'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>Save</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Master name" required><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Form"><Select value={form} onChange={(e) => setForm(e.target.value)} options={certForms.map((f) => ({ value: f.code, label: `ACORD ${f.code} ${f.title}` }))} /></Field>
        </div>
        <Field label="Policies" required>
          <div className="border border-ink-200 rounded divide-y divide-ink-100 max-h-[200px] overflow-y-auto">
            {policies.map((p) => <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer"><input type="checkbox" className="accent-[#007a78]" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} /><span className="flex-1">{lobTitle(p)} | {p.policy_number}</span><span className={p.status === 'Active' ? 'text-emerald-700 text-[12px]' : 'text-ink-400 text-[12px]'}>{p.status}</span></label>)}
            {!policies.length && <div className="px-3 py-2 text-[13px] text-ink-500">This insured has no policies yet.</div>}
          </div>
        </Field>
        <Field label="Default certificate holder" hint="Name and address, one per line"><Textarea rows={3} value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
        <Field label="Description of operations / remarks"><Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ── Account Activity ──

const TYPE_ICON: Record<ActivityType, { icon: typeof Mail; bg: string }> = {
  Email: { icon: Mail, bg: 'bg-[#e53935]' }, Note: { icon: FileText, bg: 'bg-[#1e88e5]' }, Call: { icon: Phone, bg: 'bg-[#43a047]' }, Task: { icon: CheckSquare, bg: 'bg-[#fb8c00]' },
  Meeting: { icon: Users, bg: 'bg-[#8e24aa]' }, 'Renewal Review': { icon: RefreshCw, bg: 'bg-[#00897b]' }, 'Follow-up': { icon: Clock, bg: 'bg-[#5e35b1]' },
};
const ACTIVITY_TYPES = Object.keys(TYPE_ICON) as ActivityType[];
const threadKey = (a: Activity) => a.subject.replace(/^(re|fw|fwd):\s*/i, '').trim().toLowerCase();
function bucket(iso: string) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return 'EARLIER THIS WEEK';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'EARLIER THIS MONTH';
  if (d.getFullYear() === now.getFullYear()) return 'EARLIER THIS YEAR';
  if (d.getFullYear() === now.getFullYear() - 1) return 'LAST YEAR';
  return String(d.getFullYear());
}
const shortDate = (iso: string) => { const d = new Date(iso); return d.getFullYear() === new Date().getFullYear() ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

export function AccountActivityTab({ account }: { account: Account }) {
  const activities = useTable('activities', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const { toast, confirm } = useFeedback();
  const [view, setView] = useState<'activities' | 'log'>('activities');
  const [q, setQ] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [statusF, setStatusF] = useState<'' | 'Open' | 'Completed'>('');
  const [mode, setMode] = useState<'discussion' | 'list'>('discussion');
  const [moving, setMoving] = useState<Set<string> | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<{ activity?: Activity } | null>(null);
  const filtered = activities.data.filter((a) => (!types.length || types.includes(a.type)) && (!statusF || (statusF === 'Open' ? a.status !== 'Completed' : a.status === 'Completed'))
    && (!q.trim() || [a.subject, a.description, a.assigned_to, a.type].some((s) => (s ?? '').toLowerCase().includes(q.trim().toLowerCase()))));
  const filtering = !!q.trim() || types.length > 0 || !!statusF;
  // Discussion view threads activities that share a subject; list view shows each one.
  const threads = useMemo(() => {
    if (mode === 'list') return filtered.map((a) => [a]);
    const m = new Map<string, Activity[]>();
    for (const a of filtered) m.set(threadKey(a), [...(m.get(threadKey(a)) ?? []), a]);
    return [...m.values()];
  }, [filtered, mode]);
  const groups = useMemo(() => {
    const g = new Map<string, Activity[][]>();
    for (const t of threads) { const b = bucket(t[0].created_at); g.set(b, [...(g.get(b) ?? []), t]); }
    return [...g.entries()];
  }, [threads]);
  const complete = async (a: Activity) => { try { await db.update('activities', a.id, { status: 'Completed', completed_at: new Date().toISOString() }); toast('Marked complete'); } catch (e) { toast((e as Error).message, 'error'); } };
  const remove = async (a: Activity) => {
    if (!(await confirm({ title: 'Delete this activity?', message: a.subject, confirmLabel: 'Delete', danger: true }))) return;
    try { await db.remove('activities', a.id); toast('Activity deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const doMove = async () => {
    if (!moving?.size || !moveTo) return;
    try { for (const id of moving) await db.update('activities', id, { account_id: moveTo, policy_id: null }); toast(`${moving.size} activit${moving.size === 1 ? 'y' : 'ies'} moved`); setMoving(null); setMoveTo(null); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div data-testid="account-activity">
      <div className="flex gap-6 border-b border-ink-200 mb-3 px-2" role="tablist" aria-label="Activity views">
        {([['activities', 'Activities'], ['log', 'System Log']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cx('px-2 pb-2 pt-1 text-[13px] font-semibold -mb-px border-b-2', view === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-700 hover:text-ink-900')}>{l}</button>)}
      </div>
      {view === 'log' ? <SystemLog account={account} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[240px]"><input aria-label="Search Activities" placeholder="Search Activities" value={q} onChange={(e) => setQ(e.target.value)} className="w-full h-9 rounded border border-ink-300 bg-white pl-3 pr-9 text-[13px] outline-none focus:border-brand-500" /><Search size={16} className="absolute right-3 top-2.5 text-ink-600" /></div>
            <div className="relative">
              <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className="inline-flex items-center gap-1.5 h-9 px-2 text-[13px] text-ink-800"><Filter size={15} /> Filters{filtering && types.length + (statusF ? 1 : 0) ? ` (${types.length + (statusF ? 1 : 0)})` : ''}</button>
              {filtersOpen && (
                <div className="absolute z-40 mt-1 w-64 bg-white border border-ink-200 rounded shadow-pop p-3 text-[13px] space-y-2">
                  <div className="font-semibold text-ink-700">Type</div>
                  {ACTIVITY_TYPES.map((t) => <label key={t} className="flex items-center gap-2"><input type="checkbox" className="accent-[#007a78]" checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />{t}</label>)}
                  <Field label="Status"><Select value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} placeholder="All" options={['Open', 'Completed']} /></Field>
                  <div className="text-right"><button type="button" className="text-brand-700 font-semibold hover:underline" onClick={() => setFiltersOpen(false)}>Done</button></div>
                </div>
              )}
            </div>
            {filtering && <button type="button" aria-label="Clear filters" onClick={() => { setQ(''); setTypes([]); setStatusF(''); }} className="w-8 h-8 grid place-items-center text-ink-700 hover:text-ink-900"><X size={17} /></button>}
            <div className="flex-1" />
            {moving ? (
              <>
                <span className="text-[13px] text-ink-600">{moving.size} selected</span>
                <Button size="sm" variant="primary" disabled={!moving.size} onClick={() => setMoveTo('')}>Move to…</Button>
                <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>Cancel</Button>
              </>
            ) : <button type="button" className={outline.replace('h-9', 'h-9')} onClick={() => setMoving(new Set())}>Move activities</button>}
            <Menu trigger={<button type="button" className={outline}>{mode === 'discussion' ? 'Discussion view' : 'List view'} <ChevronDown size={14} /></button>} items={[{ label: 'Discussion view', onClick: () => setMode('discussion') }, { label: 'List view', onClick: () => setMode('list') }]} />
            <button type="button" aria-label="New activity" title="New activity" onClick={() => setForm({})} className="w-9 h-9 grid place-items-center rounded hover:bg-ink-100 text-ink-800"><FilePlus2 size={20} /></button>
          </div>
          <div className="text-right text-[12.5px] text-ink-600 my-2" data-testid="viewing">Viewing {threads.length} of {mode === 'list' ? activities.data.length : new Set(activities.data.map(threadKey)).size}</div>
          {activities.loading && !activities.data.length && <div className="py-8 text-center text-[13px] text-ink-500">Loading activity…</div>}
          {!activities.loading && !threads.length && <div className={cx(card, 'py-10 text-center text-[13px] text-ink-500')}>{filtering ? 'No activities match. Clear the filters to see everything.' : 'No activity yet. Use the new activity icon to log a note, call, email or task.'}</div>}
          <div className="max-w-[900px] space-y-4">
            {groups.map(([label, list]) => (
              <section key={label}>
                <h4 className="text-[12.5px] font-semibold tracking-wide text-ink-600 mb-1.5">{label}</h4>
                <div className="space-y-1.5">
                  {list.map((t) => {
                    const a = t[0];
                    const I = TYPE_ICON[a.type] ?? TYPE_ICON.Note;
                    const key = t.map((x) => x.id).join('|');
                    const isOpen = expanded === key;
                    return (
                      <div key={key} className={cx(card, 'px-3 py-2')} data-testid="activity-thread">
                        <div className="flex items-start gap-3">
                          {moving && <input type="checkbox" aria-label={`Select ${a.subject}`} className="mt-2 accent-[#007a78]" checked={t.every((x) => moving.has(x.id))} onChange={(e) => { const on = e.target.checked; setMoving((s) => { const n = new Set(s); for (const x of t) { if (on) n.add(x.id); else n.delete(x.id); } return n; }); }} />}
                          <span className={cx('w-7 h-7 rounded-full grid place-items-center text-white shrink-0 mt-0.5', I.bg)}><I.icon size={15} /></span>
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : key)}>
                            <div className="text-[13.5px] font-semibold text-ink-900">{a.subject}{t.length > 1 && <span className="font-normal text-ink-600"> ({t.length})</span>}{a.status !== 'Completed' && a.type !== 'Note' && a.type !== 'Email' && <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5">{a.status}{a.due_date ? ` · due ${mdy(a.due_date)}` : ''}</span>}</div>
                            {!isOpen && a.description && <div className="text-[13px] text-ink-700 truncate">{a.description}</div>}
                          </button>
                          <span className="text-[12.5px] text-ink-600 shrink-0">{shortDate(a.created_at)}</span>
                        </div>
                        {isOpen && (
                          <ol className="mt-2 ml-10 border-l-2 border-ink-100 pl-3 space-y-2" data-testid="thread-entries">
                            {t.map((x) => (
                              <li key={x.id} className="text-[13px]">
                                <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500"><span>{x.type}</span><span>·</span><span>{new Date(x.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>{x.assigned_to && <><span>·</span><span>{x.assigned_to}</span></>}
                                  <span className="ml-auto flex gap-3">
                                    {x.status !== 'Completed' && <button type="button" className="text-brand-700 hover:underline" onClick={() => void complete(x)}>Complete</button>}
                                    <button type="button" className="text-brand-700 hover:underline" onClick={() => setForm({ activity: x })}>Edit</button>
                                    <button type="button" className="text-red-600 hover:underline" onClick={() => void remove(x)}>Delete</button>
                                  </span>
                                </div>
                                <div className="text-ink-900 whitespace-pre-wrap">{x.description || x.subject}</div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {threads.length > 0 && <div className="text-right text-[12.5px] text-ink-600 mt-2 max-w-[900px]">Viewing {threads.length} of {mode === 'list' ? activities.data.length : new Set(activities.data.map(threadKey)).size}</div>}
        </>
      )}
      {form && <ActivityFormModal activity={form.activity ?? null} defaults={{ account_id: account.id }} onClose={() => setForm(null)} />}
      {moveTo !== null && moving && (
        <Modal title="Move activities" subtitle={`${moving.size} activit${moving.size === 1 ? 'y' : 'ies'} from ${accountName(account)}`} size="sm" onClose={() => setMoveTo(null)} footer={<><Button variant="ghost" onClick={() => setMoveTo(null)}>Cancel</Button><Button variant="primary" disabled={!moveTo || moveTo === account.id} onClick={() => void doMove()}>Move</Button></>}>
          <Field label="Move to insured"><AccountPicker value={moveTo || null} onChange={(id) => setMoveTo(id ?? '')} /></Field>
        </Modal>
      )}
    </div>
  );
}

/** System log: what happened on the account, built from its records. */
function SystemLog({ account }: { account: Account }) {
  const policies = useTable('policies', { eq: { account_id: account.id } });
  const txns = useTable('policy_transactions', { eq: { account_id: account.id } });
  const quotes = useTable('quotes', { eq: { account_id: account.id } });
  const docs = useTable('documents', { eq: { account_id: account.id } });
  const messages = useTable('messages', { eq: { account_id: account.id } });
  const claims = useTable('claims', { eq: { account_id: account.id } });
  const byId = new Map(policies.data.map((p) => [p.id, p]));
  const rows = [
    { at: account.created_at, event: 'Applicant created', detail: accountName(account) },
    ...policies.data.map((p) => ({ at: p.created_at, event: 'Policy added', detail: `${lobTitle(p)} ${p.policy_number} · ${p.carrier}` })),
    ...txns.data.filter((t) => t.type !== 'New Business').map((t) => ({ at: t.created_at, event: `Policy ${t.type.toLowerCase()}`, detail: `${byId.get(t.policy_id)?.policy_number ?? ''} ${t.description ?? ''}`.trim() })),
    ...quotes.data.map((q) => ({ at: q.created_at, event: q.results?.length ? 'Quote rated' : 'Quote started', detail: `${lobShort(q.line_of_business)} · ${q.status}` })),
    ...docs.data.map((d) => ({ at: d.created_at, event: 'Document added', detail: d.name })),
    ...messages.data.map((m) => ({ at: m.created_at, event: `${m.channel === 'SMS' ? 'Text' : 'Email'} ${m.direction === 'Inbound' ? 'received' : 'sent'}`, detail: m.to_address ?? '' })),
    ...claims.data.map((c) => ({ at: c.created_at, event: 'Claim reported', detail: `${c.claim_number ?? ''} ${c.loss_type}`.trim() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className={card} data-testid="system-log">
      <table className="w-full text-[13px] border-collapse">
        <thead><tr className="text-left">{['Date / Time', 'Event', 'Details'].map((h) => <th key={h} className="px-4 py-2.5 border-b border-ink-200 font-semibold text-ink-900">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-ink-100 last:border-0"><td className="px-4 py-2 whitespace-nowrap text-ink-600"><CalendarCheck size={13} className="inline mr-1 -mt-0.5 text-ink-400" />{new Date(r.at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td><td className="px-4 py-2">{r.event}</td><td className="px-4 py-2 text-ink-700">{r.detail}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
