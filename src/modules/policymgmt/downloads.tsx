import { ChevronDown, ChevronUp, CloudDownload, Download, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, ErrorBanner, Field, Menu, Modal, PageHeader, Select, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import {
  createAccountFromDownload, isCommercialLine, receiveNow, rematch, removeDownloads, resolveDownload, suggestAccounts,
  type DownloadTxn, type DownloadTxnType,
} from '@/lib/downloads';
import { accountName, downloadCsv, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, setParam, useRoute } from '@/lib/router';
import type { Account, Policy } from '@/lib/types';
import { useAppConfig } from '@/modules/admin/config';

/*
 * Policy Downloads (EZLynx: Management System → Policy Transactions → Matched / Unmatched).
 * Carrier transactions arrive daily; matched ones are already applied, unmatched ones are worked here.
 */

const TYPES: DownloadTxnType[] = ['New Business', 'Renewal', 'Policy Change', 'Cancellation', 'Reinstatement', 'Non-Renewal', 'Claim'];
const TYPE_TONE: Record<DownloadTxnType, string> = {
  'New Business': 'bg-emerald-50 text-emerald-800 border-emerald-200', Renewal: 'bg-teal-50 text-teal-800 border-teal-200', 'Policy Change': 'bg-sky-50 text-sky-800 border-sky-200',
  Cancellation: 'bg-red-50 text-red-700 border-red-200', Reinstatement: 'bg-violet-50 text-violet-800 border-violet-200', 'Non-Renewal': 'bg-amber-50 text-amber-800 border-amber-200', Claim: 'bg-ink-100 text-ink-800 border-ink-200',
};
const RANGES = [{ value: '1', label: 'Last 24 hours' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: 'all', label: 'All' }];
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' });
const mdy = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${Number(m)}/${Number(dd)}/${y}`; };
const insuredName = (t: DownloadTxn) => t.insured.business_name || `${t.insured.first_name} ${t.insured.last_name}`.trim();
const METHOD_LABEL: Record<string, string> = { Policy: 'Policy #, LOB & NAIC', Account: 'Name, DOB/SSN & ZIP', Phone: 'Phone number', EIN: 'EIN', Company: 'Company name', Manual: 'Matched manually', Created: 'Created from download' };

export function DownloadsPage() {
  const { params } = useRoute();
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const { value } = useAppConfig('carrier_downloads');
  const accounts = useTable('accounts', {});
  const policies = useTable('policies', {});
  const view = (params.get('view') ?? 'unmatched') as 'unmatched' | 'matched' | 'all';
  const kind = params.get('kind') === 'claim' ? 'claim' : 'policy';
  const type = (params.get('type') ?? '') as DownloadTxnType | '';
  const range = params.get('range') ?? (view === 'unmatched' ? 'all' : '7');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState<DownloadTxn | null>(null);

  const items = value.items;
  const ofKind = items.filter((t) => t.kind === kind);
  const inRange = (t: DownloadTxn) => range === 'all' || Date.now() - new Date(t.received_at).getTime() <= Number(range) * 86400000;
  const rows = useMemo(() => ofKind
    .filter((t) => (view === 'all' ? true : view === 'matched' ? t.status === 'Matched' : t.status === 'Unmatched'))
    .filter((t) => !type || t.type === type).filter(inRange)
    .filter((t) => !q.trim() || [insuredName(t), t.policy_number, t.carrier, t.claim?.claim_number].some((s) => (s ?? '').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => b.received_at.localeCompare(a.received_at)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ofKind, view, type, range, q]);
  const last24 = items.filter((t) => Date.now() - new Date(t.received_at).getTime() <= 86400000);
  const unmatchedCount = (k: 'policy' | 'claim') => items.filter((t) => t.kind === k && t.status === 'Unmatched').length;
  const accountById = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try { toast(await fn()); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  const doRematch = (ids: string[] | 'all') => run('rematch', async () => { const n = await rematch(ids, me?.name ?? null); return n ? `${n} download${n === 1 ? '' : 's'} matched` : 'No new matches found. Match them manually or create the account.'; });
  const doDelete = async (ids: string[]) => {
    if (!(await confirm({ title: `Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`, message: 'Deleted downloads are not applied to any policy. Ask the carrier to resend if needed.', confirmLabel: 'Delete', danger: true }))) return;
    await run('delete', async () => { const n = await removeDownloads(ids); setPicked(new Set()); setSelecting(false); return `${n} transaction${n === 1 ? '' : 's'} removed`; });
  };
  const exportCsv = () => downloadCsv(`downloads-${view}-${today()}.csv`, rows.map((t) => ({
    'Received': stamp(t.received_at), 'Carrier Name': t.carrier, 'Transaction': t.type, 'Applicant Name': t.account_id ? accountName(accountById.get(t.account_id)) : '', 'Name on Policy': insuredName(t),
    'Policy Number': t.policy_number, 'LOB': t.line_of_business, 'Effective': t.effective_date, 'Premium': t.premium, 'Change': t.premium_change, 'Status': t.status, 'Matched By': t.match_method ?? '',
  })));
  const tab = (k: typeof view, label: string, n?: number) => (
    <button type="button" role="tab" aria-selected={view === k} onClick={() => { setParam('view', k); setOpen(null); }} className={cx('px-4 py-2.5 text-[13px] font-semibold -mb-px border-b-2', view === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-600 hover:text-ink-900')}>
      {label}{n !== undefined && <span className={cx('ml-1.5 inline-grid place-items-center min-w-[20px] h-5 px-1 rounded-full text-[11px]', n ? 'bg-red-600 text-white' : 'bg-ink-100 text-ink-600')}>{n}</span>}
    </button>
  );
  const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-ink-700 border-b border-ink-200';
  const td = 'px-3 py-2.5 text-[13px] text-ink-800 border-b border-ink-100';

  return (
    <div>
      <PageHeader title="Policy Downloads" icon={<CloudDownload size={20} />} subtitle="Carrier downloads received daily: matched transactions are applied automatically; unmatched ones need you"
        actions={<Button icon={<CloudDownload size={14} />} loading={busy === 'receive'} onClick={() => void run('receive', async () => { const n = await receiveNow(me?.name ?? null); return `${n} transactions received from the carriers`; })}>Receive downloads now</Button>} />
      <div className="mb-4 rounded border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-ink-800 flex flex-wrap gap-x-6 gap-y-1" data-testid="daily-summary">
        <span><b>Daily Download:</b> {last24.length} transaction{last24.length === 1 ? '' : 's'} received in the past 24 hours</span>
        <span>{last24.filter((t) => t.status === 'Matched').length} matched automatically</span>
        <span className={unmatchedCount('policy') + unmatchedCount('claim') ? 'text-red-700 font-semibold' : ''}>{unmatchedCount('policy') + unmatchedCount('claim')} unmatched waiting</span>
        <span className="text-ink-500">Last download: {value.last_run ? mdy(value.last_run) : 'not yet'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded border border-ink-300 overflow-hidden text-[13px]" role="group" aria-label="Download type">
          {(['policy', 'claim'] as const).map((k) => <button key={k} type="button" onClick={() => { setParam('kind', k === 'policy' ? null : k); setParam('type', null); }} className={cx('px-3 h-9', kind === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-ink-50')}>{k === 'policy' ? 'Policy Downloads' : 'Claims Downloads'} ({unmatchedCount(k)})</button>)}
        </div>
      </div>
      <div className="bg-white border border-ink-200 rounded shadow-card">
        <div className="flex flex-wrap items-center gap-2 px-3 border-b border-ink-200" role="tablist" aria-label="Download status">
          {tab('unmatched', 'Unmatched', ofKind.filter((t) => t.status === 'Unmatched').length)}{tab('matched', 'Matched')}{tab('all', 'All')}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative w-full sm:w-64"><input aria-label="Search downloads" placeholder="Search name, policy # or carrier" value={q} onChange={(e) => setQ(e.target.value)} className="w-full h-9 rounded border border-ink-300 bg-white pl-3 pr-9 text-[13px] outline-none focus:border-brand-500" /><Search size={15} className="absolute right-3 top-2.5 text-ink-500" /></div>
          {kind === 'policy' && <div className="w-full sm:w-48"><Select aria-label="Transaction type" value={type} onChange={(e) => setParam('type', e.target.value || null)} placeholder="All transactions" options={TYPES.filter((x) => x !== 'Claim')} /></div>}
          <div className="w-full sm:w-40"><Select aria-label="Received" value={range} onChange={(e) => setParam('range', e.target.value)} options={RANGES} /></div>
          <div className="flex-1" />
          {view === 'unmatched' && <Button icon={<RefreshCw size={14} />} loading={busy === 'rematch'} disabled={!rows.length} onClick={() => void doRematch(rows.map((r) => r.id))}>Rematch</Button>}
          {selecting
            ? <><span className="text-[13px] text-ink-600">{picked.size} selected</span><Button variant="danger" icon={<Trash2 size={14} />} disabled={!picked.size} onClick={() => void doDelete([...picked])}>Remove Selected Transactions</Button><Button variant="ghost" onClick={() => { setSelecting(false); setPicked(new Set()); }}>Cancel</Button></>
            : <Menu trigger={<Button>Actions <ChevronDown size={14} /></Button>} items={[
              { label: 'Select Transactions to Remove', disabled: view !== 'unmatched' || !rows.length, onClick: () => setSelecting(true) },
              { label: 'Export to Excel', icon: <Download size={14} />, disabled: !rows.length, onClick: exportCsv },
            ]} />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse" aria-label="Downloads">
            <thead><tr>
              {selecting && <th className={cx(th, 'w-10')} />}
              <th className={th}>Received</th><th className={th}>Transaction</th><th className={th}>Carrier</th><th className={th}>{kind === 'claim' ? 'Claim / Policy #' : 'Policy #'}</th><th className={th}>LOB</th>
              <th className={th}>Name on Policy</th><th className={th}>Effective</th><th className={cx(th, 'text-right')}>{kind === 'claim' ? 'Paid' : 'Premium'}</th><th className={th}>Applicant</th><th className={cx(th, 'w-10')} />
            </tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-[13px] text-ink-500">{view === 'unmatched' ? 'No unmatched downloads. Every transaction has been matched to an applicant.' : 'No downloads in this range.'}</td></tr>}
              {rows.map((t) => {
                const isOpen = open === t.id;
                const a = t.account_id ? accountById.get(t.account_id) : undefined;
                return [
                  <tr key={t.id} className={cx('hover:bg-[#f7f9fb] cursor-pointer', t.status === 'Unmatched' && 'bg-red-50/30')} data-testid="download-row" onClick={() => setOpen(isOpen ? null : t.id)}>
                    {selecting && <td className={td} onClick={(e) => e.stopPropagation()}>{t.status === 'Unmatched' && <input type="checkbox" aria-label={`Select ${t.policy_number}`} className="accent-[#007a78]" checked={picked.has(t.id)} onChange={(e) => { const on = e.target.checked; setPicked((s) => { const n = new Set(s); if (on) n.add(t.id); else n.delete(t.id); return n; }); }} />}</td>}
                    <td className={cx(td, 'whitespace-nowrap')}>{stamp(t.received_at)}</td>
                    <td className={td}><span className={cx('inline-flex items-center h-[22px] px-2 rounded border text-[12px] font-medium whitespace-nowrap', TYPE_TONE[t.type])}>{t.kind === 'claim' ? `Claim · ${t.claim?.status}` : t.type}</span></td>
                    <td className={td}>{t.carrier}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{t.kind === 'claim' ? <>{t.claim?.claim_number}<div className="text-[11px] text-ink-500">{t.policy_number}</div></> : t.policy_number}</td>
                    <td className={td}>{t.line_of_business}</td>
                    <td className={cx(td, 'uppercase')}>{insuredName(t)}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{mdy(t.effective_date)}</td>
                    <td className={cx(td, 'text-right tabular-nums whitespace-nowrap')}>{t.kind === 'claim' ? (t.claim?.amount_paid != null ? fmtMoney(t.claim.amount_paid, true) : '—') : t.type === 'Policy Change' || t.type === 'Cancellation' || t.type === 'Reinstatement' ? `${t.premium_change >= 0 ? '+' : '−'}${fmtMoney(Math.abs(t.premium_change), true)}` : fmtMoney(t.premium, true)}</td>
                    <td className={td}>{t.status === 'Matched' && a ? <a href={href(`/accounts/${a.id}`)} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{accountName(a)}</a> : <span className="text-red-700 font-semibold">Unmatched</span>}</td>
                    <td className={td}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                  </tr>,
                  isOpen && <tr key={`${t.id}-x`}><td colSpan={11} className="bg-[#f7f9fb] border-b border-ink-200 px-4 py-4">
                    {t.status === 'Matched' ? <MatchedDetail t={t} account={a} /> : <UnmatchedDetail t={t} accounts={accounts.data} policies={policies.data} busy={busy} onRematch={() => void doRematch([t.id])} onDelete={() => void doDelete([t.id])} onCreate={() => setCreating(t)} onDone={() => setOpen(null)} />}
                  </td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
      {creating && <CreateFromDownload t={creating} onClose={() => setCreating(null)} onDone={() => { setCreating(null); setOpen(null); }} />}
    </div>
  );
}

function InsuredFacts({ t }: { t: DownloadTxn }) {
  const i = t.insured;
  const rows: [string, string | null][] = [['Name on policy', insuredName(t)], ['Address', [i.address, i.city, i.state, i.zip].filter(Boolean).join(', ')], ['Date of birth', i.dob], ['SSN (last 4)', i.ssn_last4 ? `***-**-${i.ssn_last4}` : null], ['EIN', i.ein], ['Phone', i.phone], ['Email', i.email]];
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
      {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-500">{k}</dt><dd className="text-ink-900">{v}</dd></div>)}
      <dt className="text-ink-500">Transaction</dt><dd className="text-ink-900">{t.type}{t.description ? ` · ${t.description}` : ''}</dd>
      <dt className="text-ink-500">Term</dt><dd className="text-ink-900">{mdy(t.effective_date)} – {mdy(t.expiration_date)}</dd>
    </dl>
  );
}

function MatchedDetail({ t, account }: { t: DownloadTxn; account?: Account }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="matched-detail">
      <div><div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Download</div><InsuredFacts t={t} /></div>
      <div className="text-[13px] space-y-1">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Applied</div>
        <div>Matched to <b>{account ? accountName(account) : 'an applicant'}</b> by <b>{METHOD_LABEL[t.match_method ?? ''] ?? t.match_method}</b></div>
        {t.note && <div className="text-ink-700">{t.note}</div>}
        <div className="text-ink-500">{t.processed_at ? `${stamp(t.processed_at)} · ${t.processed_by ?? 'System'}` : ''}</div>
        <div className="flex gap-3 pt-1">{account && <a className="text-brand-700 hover:underline" href={href(`/accounts/${account.id}`)}>Open applicant</a>}{account && t.policy_id && <a className="text-brand-700 hover:underline" href={href(`/accounts/${account.id}/policy/${t.policy_id}`)}>Open policy</a>}</div>
      </div>
    </div>
  );
}

function UnmatchedDetail({ t, accounts, policies, busy, onRematch, onDelete, onCreate, onDone }: {
  t: DownloadTxn; accounts: Account[]; policies: Policy[]; busy: string | null; onRematch: () => void; onDelete: () => void; onCreate: () => void; onDone: () => void;
}) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Account[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const suggested = useMemo(() => suggestAccounts(t, accounts), [t, accounts]);
  const list = results ?? suggested;
  const search = async () => {
    if (!term.trim()) { setResults(null); return; }
    setResults(await db.search('accounts', ['first_name', 'last_name', 'business_name', 'email', 'phone', 'mobile_phone', 'address', 'zip'], term.trim(), 15));
  };
  const resolve = async (a: Account, p: Policy | null, key: string) => {
    setWorking(key);
    try { const r = await resolveDownload(t.id, a, p, 'Manual', me?.name ?? null); toast(`Matched to ${accountName(a)}. ${r.note}`); onDone(); } catch (e) { toast((e as Error).message, 'error'); setWorking(null); }
  };
  const needsPolicy = t.kind === 'policy' && t.type !== 'New Business';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6" data-testid="unmatched-detail">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Download from {t.carrier}</div>
        <InsuredFacts t={t} />
        <p className="text-[12px] text-ink-500 mt-3">No applicant matched on policy #, line and NAIC, on {isCommercialLine(t.line_of_business) ? 'EIN or company name' : 'name, date of birth/SSN and ZIP'}, or on a unique phone number.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" icon={<RefreshCw size={13} />} loading={busy === 'rematch'} onClick={onRematch}>Rematch</Button>
          <Button size="sm" variant="primary" onClick={onCreate}>Create new account and policy</Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={onDelete}>Delete Transaction</Button>
        </div>
      </div>
      <div>
        <div className="flex gap-2 mb-2">
          <input aria-label="Search applicants" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} placeholder="Search applicants by name, phone, address or ZIP" className="flex-1 h-9 rounded border border-ink-300 bg-white px-3 text-[13px] outline-none focus:border-brand-500" />
          <Button size="sm" icon={<Search size={13} />} onClick={() => void search()}>Search</Button>
        </div>
        <div className="text-[12px] text-ink-500 mb-1">{results ? `${results.length} result${results.length === 1 ? '' : 's'}` : suggested.length ? 'Possible matches' : 'No likely matches. Search, or create a new account.'}</div>
        <div className="space-y-2">
          {list.map((a) => {
            const pols = policies.filter((p) => p.account_id === a.id);
            const same = pols.filter((p) => p.line_of_business === t.line_of_business);
            return (
              <div key={a.id} className="bg-white border border-ink-200 rounded p-3" data-testid="match-candidate">
                <div className="flex flex-wrap items-baseline gap-2"><a href={href(`/accounts/${a.id}`)} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline uppercase">{accountName(a)}</a><span className="text-[12px] text-ink-500">{[a.address, a.city, a.state, a.zip].filter(Boolean).join(', ')}{a.dob ? ` · DOB ${mdy(a.dob)}` : ''}{a.mobile_phone || a.phone ? ` · ${a.mobile_phone || a.phone}` : ''}</span></div>
                <ul className="mt-2 divide-y divide-ink-100 text-[13px]">
                  {(needsPolicy ? same : pols).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="flex-1">{p.line_of_business} · {p.policy_number} · {p.carrier} <span className="text-ink-500">({p.status})</span></span>
                      <Button size="sm" variant="primary" loading={working === p.id} onClick={() => void resolve(a, p, p.id)}>Match</Button>
                    </li>
                  ))}
                  {needsPolicy && !same.length && <li className="py-1.5 text-ink-500">No {t.line_of_business} policy on this applicant.</li>}
                </ul>
                <div className="mt-2"><Button size="sm" loading={working === `create-${a.id}`} onClick={() => void resolve(a, null, `create-${a.id}`)}>Create policy on this applicant</Button></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateFromDownload({ t, onClose, onDone }: { t: DownloadTxn; onClose: () => void; onDone: () => void }) {
  const { activeStaff, me } = useAppData();
  const { toast } = useFeedback();
  const [commercial, setCommercial] = useState(isCommercialLine(t.line_of_business) || !!t.insured.business_name);
  const [producer, setProducer] = useState(me?.name ?? '');
  const [csr, setCsr] = useState(activeStaff.find((s) => s.role === 'CSR')?.name ?? me?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = async () => {
    setBusy(true); setError(null);
    try {
      const a = await createAccountFromDownload(t, { commercial, producer: producer || null, csr: csr || null });
      const r = await resolveDownload(t.id, a, null, 'Created', me?.name ?? null);
      toast(`${accountName(a)} created. ${r.note}`);
      onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const names = activeStaff.map((s) => s.name);
  return (
    <Modal title="Create new account and policy from transaction" subtitle={`${t.type} · ${t.carrier} · ${t.policy_number}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void next()}>Next</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="flex gap-4 text-[13px]" role="radiogroup" aria-label="Lines">
          <label className="inline-flex items-center gap-1.5"><input type="radio" className="accent-[#007a78]" checked={!commercial} onChange={() => setCommercial(false)} /> Personal Lines</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" className="accent-[#007a78]" checked={commercial} onChange={() => setCommercial(true)} /> Commercial Lines</label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Assigned producer"><Select value={producer} onChange={(e) => setProducer(e.target.value)} options={names} /></Field>
          <Field label="CSR"><Select value={csr} onChange={(e) => setCsr(e.target.value)} options={names} /></Field>
        </div>
        <div className="rounded border border-ink-200 bg-ink-50 p-3"><InsuredFacts t={t} /></div>
        <p className="text-[12px] text-ink-500">The applicant is created from the carrier&rsquo;s information, the policy is added, and this download is marked matched. Complete the applicant&rsquo;s details afterwards.</p>
      </div>
    </Modal>
  );
}

