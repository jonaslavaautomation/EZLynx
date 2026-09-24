import { Ban, CheckCircle2, FileText, Pencil, Printer, RefreshCw, RotateCcw, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Badge, Button, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Menu, Modal, PageHeader, Panel, Select, StatCard, StatusBadge, Tabs, Textarea, useFeedback,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { createPolicy, logActivity } from '@/lib/domain';
import { accountName, addMonths, fmtDate, fmtDateTime, fmtMoney, fmtPhone, today } from '@/lib/format';
import { useRow } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, CarrierRate, Policy, Quote } from '@/lib/types';
import { ComparisonTable, CoverageMatrix, InputSummary, SimulatedNote } from './components';
import { carriersForLine, loadAccountRisk } from './data';
import { buildDefaultInput, hasSection, mergeInput, pruneInput, readInput, sectionOf, validateRisk, type QuoteInput } from './inputs';
import { bestRate, monthlyEstimate, rateQuote, sortRates } from './rating';

const LOST_REASONS = ['Price too high', 'Coverage not competitive', 'Went with another agency', 'Stayed with current carrier', 'No response from client', 'Risk ineligible', 'Other'];
const PAYMENT_PLANS = ['Paid in Full', 'Semi-Annual', 'Quarterly', 'Monthly'];

type TabKey = 'compare' | 'coverages' | 'inputs';

export function QuoteDetail({ id }: { id: string }) {
  const quote = useRow('quotes', id);
  const q = quote.data;
  const account = useRow('accounts', q?.account_id ?? null);
  const { appointedCarriers, me } = useAppData();
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<TabKey>('compare');
  const [bindRate, setBindRate] = useState<CarrierRate | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [rerating, setRerating] = useState(false);

  if (quote.loading && !q) return <LoadingBlock label="Loading quote…" />;
  if (quote.error) return <div className="max-w-xl"><ErrorBanner message={quote.error} /></div>;
  if (!q) {
    return (
      <Panel>
        <EmptyState title="Quote not found" message="It may have been deleted." action={<Button onClick={() => navigate('/quotes')}>Back to quotes</Button>} />
      </Panel>
    );
  }

  const input = readInput(q);
  const results = sortRates(q.results ?? []);
  const quoted = results.filter((r) => r.status === 'Quoted' && r.premium !== null);
  const best = bestRate(results);
  const high = quoted.length ? quoted[quoted.length - 1].premium! : null;
  const acct = account.data;
  const name = acct ? accountName(acct) : 'Account';
  const closed = q.status === 'Bound' || q.status === 'Lost';

  const rerate = async () => {
    setRerating(true);
    try {
      let inp: QuoteInput;
      if (hasSection(q)) {
        inp = mergeInput(input, buildDefaultInput({ account: acct, drivers: [], vehicles: [], properties: [] }));
      } else {
        inp = mergeInput(input, buildDefaultInput(await loadAccountRisk(q.account_id)));
      }
      // Drafts are saved without validation; rating blank/invalid inputs would produce bogus premiums.
      const invalid = Object.values(validateRisk(q.line_of_business, inp)).some(Boolean)
        || (sectionOf(q.line_of_business) === 'home' && !(Number.isFinite(inp.home?.dwelling) && inp.home!.dwelling >= 50000 && inp.home!.dwelling <= 10_000_000));
      if (invalid) {
        toast('Some rating inputs are missing or invalid — complete them before rating', 'error');
        navigate(`/quotes/new?quote=${q.id}`);
        return;
      }
      const eligible = carriersForLine(q.line_of_business, appointedCarriers);
      const chosen = eligible.filter((c) => inp.carriers.includes(c.name));
      const use = chosen.length ? chosen : eligible;
      if (!use.length) { toast(`No appointed carriers write ${q.line_of_business}`, 'error'); return; }
      await new Promise((r) => setTimeout(r, 700 + use.length * 150));
      const next = rateQuote(q.line_of_business, inp, use);
      const nb = bestRate(next);
      const stored = pruneInput(q.line_of_business, { ...inp, carriers: use.map((c) => c.name), rated_at: new Date().toISOString() });
      await db.update('quotes', q.id, { results: next, status: 'Rated', input: stored as unknown as Record<string, unknown> });
      const delta = nb && best ? nb.premium! - best.premium! : null;
      toast(nb ? `Re-rated ${use.length} carrier${use.length === 1 ? '' : 's'} — lowest ${fmtMoney(nb.premium)}${delta ? ` (${delta > 0 ? '+' : '−'}${fmtMoney(Math.abs(delta))})` : ''}` : 'Re-rated — no carriers offered terms', nb ? 'success' : 'info');
      setTab('compare');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRerating(false);
    }
  };

  const reopen = async () => {
    try {
      const rest: Record<string, unknown> = { ...input };
      delete rest.lost_reason;
      delete rest.lost_notes;
      await db.update('quotes', q.id, { status: results.length ? 'Rated' : 'Draft', input: rest as Record<string, unknown> });
      await logActivity({ account_id: q.account_id, subject: `${q.line_of_business} quote reopened`, assigned_to: me?.name ?? null });
      toast('Quote reopened');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete this quote?', message: `The ${q.line_of_business} quote for ${name} and its carrier results will be permanently deleted.${q.policy_id ? ' The bound policy is not affected.' : ''}`, confirmLabel: 'Delete quote', danger: true });
    if (!ok) return;
    try {
      await db.remove('quotes', q.id);
      toast('Quote deleted');
      navigate('/quotes', { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const selectDisabled = q.status === 'Bound' ? 'This quote is already bound' : q.status === 'Lost' ? 'Reopen the quote to bind' : null;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`${q.line_of_business} Quote`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <a href={href(`/accounts/${q.account_id}?tab=quotes`)} className="text-brand-600 hover:underline font-semibold">{name}</a>
            <StatusBadge status={q.status} />
            <span>Effective {fmtDate(q.effective_date)}</span>
            <span className="hidden sm:inline">· Created {fmtDateTime(q.created_at)}</span>
          </span>
        }
        breadcrumb={[{ label: 'Quotes', href: href('/quotes') }, { label: name, href: href(`/accounts/${q.account_id}?tab=quotes`) }]}
        actions={
          <>
            {!closed && <Button icon={<RefreshCw size={15} />} loading={rerating} onClick={rerate}>Re-rate</Button>}
            {!closed && <Button icon={<Pencil size={15} />} onClick={() => navigate(`/quotes/new?quote=${q.id}`)}>Edit</Button>}
            {quoted.length > 0 && <Button icon={<Printer size={15} />} onClick={() => setProposal(true)}>Proposal</Button>}
            {!closed && best && <Button variant="primary" icon={<Zap size={15} />} onClick={() => setBindRate(best)}>Bind lowest</Button>}
            <Menu items={[
              ...(q.status === 'Lost' ? [{ label: 'Reopen quote', icon: <RotateCcw size={14} />, onClick: reopen }] : []),
              ...(q.status !== 'Bound' && q.status !== 'Lost' ? [{ label: 'Mark as lost', icon: <Ban size={14} />, onClick: () => setLostOpen(true) }] : []),
              { label: 'New quote for account', icon: <FileText size={14} />, onClick: () => navigate(`/quotes/new?account=${q.account_id}`) },
              'divider' as const,
              { label: 'Delete quote', icon: <Trash2 size={14} />, danger: true, onClick: remove },
            ]} />
          </>
        }
      />

      {q.status === 'Bound' && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-[13px] px-3 py-2 mb-4">
          <CheckCircle2 size={16} /> Bound with <strong>{q.selected_carrier}</strong> at {fmtMoney(q.selected_premium)}
          {input.bound_at && <span className="text-emerald-700">on {fmtDate(input.bound_at)}</span>}
          {q.policy_id && <a className="ml-auto font-semibold text-emerald-800 hover:underline" href={href(`/policies/${q.policy_id}`)}>View policy →</a>}
        </div>
      )}
      {q.status === 'Lost' && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-ink-200 bg-ink-50 text-ink-700 text-[13px] px-3 py-2 mb-4">
          <Ban size={16} /> Marked lost{input.lost_reason ? <>: <strong>{input.lost_reason}</strong></> : null}{input.lost_notes ? <span className="text-ink-500"> — {input.lost_notes}</span> : null}
          <Button size="sm" className="ml-auto" icon={<RotateCcw size={13} />} onClick={reopen}>Reopen</Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Carriers quoted" value={`${quoted.length} / ${results.length}`} hint={results.length - quoted.length ? `${results.length - quoted.length} declined` : 'All carriers quoted'} />
        <StatCard label="Lowest premium" value={best ? fmtMoney(best.premium) : '—'} hint={best ? `${best.carrier} · ${best.term_months} mo` : 'Not rated yet'} tone="green" />
        <StatCard label="Price spread" value={best && high !== null ? fmtMoney(high - best.premium!) : '—'} hint={quoted.length > 1 ? `Highest ${fmtMoney(high)}` : 'Need 2+ quotes'} tone="amber" />
        <StatCard label={q.status === 'Bound' ? 'Bound premium' : 'Monthly est. (lowest)'} value={q.status === 'Bound' ? fmtMoney(q.selected_premium) : best ? fmtMoney(monthlyEstimate(best), true) : '—'} hint={input.rated_at ? `Rated ${fmtDateTime(input.rated_at)}` : undefined} tone="blue" />
      </div>

      <Panel bodyClassName="p-0">
        <Tabs className="px-2" value={tab} onChange={setTab} tabs={[
          { value: 'compare', label: 'Comparison', count: results.length },
          { value: 'coverages', label: 'Coverage matrix' },
          { value: 'inputs', label: 'Rating inputs' },
        ]} />
        <div className="p-4">
          {tab === 'compare' && (results.length ? (
            <>
              <ComparisonTable rates={results} onSelect={(r) => setBindRate(r)} selectLabel="Select & bind" selectedCarrier={q.selected_carrier} selectDisabledReason={selectDisabled} />
              <SimulatedNote className="mt-3" />
            </>
          ) : (
            <EmptyState title={q.status === 'Draft' ? 'This quote is a draft' : 'No carrier results'} message="Rate the quote to compare carriers side by side."
              action={!closed && <div className="flex gap-2 justify-center"><Button onClick={() => navigate(`/quotes/new?quote=${q.id}`)} icon={<Pencil size={15} />}>Continue editing</Button><Button variant="primary" icon={<Zap size={15} />} loading={rerating} onClick={rerate}>Rate now</Button></div>} />
          ))}
          {tab === 'coverages' && <CoverageMatrix rates={results} />}
          {tab === 'inputs' && <InputSummary line={q.line_of_business} input={input} />}
        </div>
      </Panel>

      {bindRate && acct && <BindModal quote={q} account={acct} rate={bindRate} onClose={() => setBindRate(null)} />}
      {lostOpen && <LostModal quote={q} onClose={() => setLostOpen(false)} />}
      {proposal && <ProposalView quote={q} account={acct} onClose={() => setProposal(false)} />}
    </div>
  );
}

function BindModal({ quote, account, rate, onClose }: { quote: Quote; account: Account; rate: CarrierRate; onClose: () => void }) {
  const { carriers, me } = useAppData();
  const { toast } = useFeedback();
  const carrier = carriers.find((c) => c.name === rate.carrier);
  const input = readInput(quote);
  const pif = !!(input.auto?.paid_in_full || input.home?.paid_in_full || input.renters?.paid_in_full || input.condo?.paid_in_full);
  const [effective, setEffective] = useState(quote.effective_date >= today() ? quote.effective_date : today());
  const [billing, setBilling] = useState<Policy['billing_type']>('Direct Bill');
  const [plan, setPlan] = useState(pif ? 'Paid in Full' : 'Monthly');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = useRef<Policy | null>(null);

  const submit = async () => {
    if (!effective) { setError('Effective date is required'); return; }
    if (effective < addMonths(today(), -1)) { setError('Effective date cannot be more than a month in the past'); return; }
    setError(null);
    setBusy(true);
    try {
      // If a previous attempt created the policy but a later step failed, reuse it on retry instead of
      // creating a duplicate policy (plus duplicate transaction/invoice).
      const policy = created.current ?? await createPolicy({
        account_id: quote.account_id, line_of_business: quote.line_of_business, carrier: rate.carrier, status: 'Active', effective_date: effective,
        term_months: rate.term_months, premium: rate.premium!, commission_rate: carrier?.commission_rate ?? 10, billing_type: billing, payment_plan: plan,
        source: 'Rater', producer: account.producer ?? me?.name ?? null, coverages: rate.coverages,
        notes: `Bound from comparative rater quote (${(quote.results ?? []).filter((r) => r.status === 'Quoted').length} carriers compared).`,
      });
      created.current = policy;
      await db.update('quotes', quote.id, {
        status: 'Bound', selected_carrier: rate.carrier, selected_premium: rate.premium, policy_id: policy.id,
        input: { ...input, bound_at: new Date().toISOString() } as Record<string, unknown>,
      });
      await logActivity({
        account_id: quote.account_id, policy_id: policy.id, assigned_to: me?.name ?? null,
        subject: `Bound ${quote.line_of_business} with ${rate.carrier} — ${policy.policy_number}`,
        description: `Premium ${fmtMoney(rate.premium)} for ${rate.term_months} months, ${billing}, ${plan}. Effective ${fmtDate(effective)}.`,
      });
      toast(`Policy ${policy.policy_number} created with ${rate.carrier}`);
      onClose();
      navigate(`/policies/${policy.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Bind ${quote.line_of_business} with ${rate.carrier}`} subtitle={accountName(account)} onClose={onClose} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy} onClick={submit}>Bind &amp; create policy</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 bg-ink-50 border border-ink-100 rounded p-3">
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Term premium</div><div className="text-lg font-semibold text-ink-900 tabular-nums">{fmtMoney(rate.premium)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Term</div><div className="text-[13px] text-ink-900 mt-1">{rate.term_months} months · ~{fmtMoney(monthlyEstimate(rate), true)}/mo</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Commission</div><div className="text-[13px] text-ink-900">{carrier?.commission_rate ?? 10}% · {fmtMoney(((rate.premium ?? 0) * (carrier?.commission_rate ?? 10)) / 100)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Producer</div><div className="text-[13px] text-ink-900">{account.producer ?? me?.name ?? '—'}</div></div>
        </div>
        <ErrorBanner message={error} />
        <Field label="Effective date" required>
          <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </Field>
        <div className="text-xs text-ink-400 -mt-2">Expires {effective ? fmtDate(addMonths(effective, rate.term_months)) : '—'}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing type"><Select value={billing} onChange={(e) => setBilling(e.target.value as Policy['billing_type'])} options={['Direct Bill', 'Agency Bill']} /></Field>
          <Field label="Payment plan"><Select value={plan} onChange={(e) => setPlan(e.target.value)} options={PAYMENT_PLANS} /></Field>
        </div>
        {billing === 'Agency Bill' && <div className="text-xs text-ink-500">An agency invoice for {fmtMoney(rate.premium)} will be created, due on the effective date.</div>}
        {pif && plan !== 'Paid in Full' && <div className="text-xs text-amber-700">This rate includes a paid-in-full discount; the carrier may adjust premium for installment plans.</div>}
        <SimulatedNote />
      </div>
    </Modal>
  );
}

function LostModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason) { setError('Choose a reason'); return; }
    if (reason === 'Other' && !notes.trim()) { setError('Describe the reason in the notes'); return; }
    setBusy(true);
    try {
      await db.update('quotes', quote.id, { status: 'Lost', input: { ...readInput(quote), lost_reason: reason, lost_notes: notes.trim() || undefined } as Record<string, unknown> });
      await logActivity({ account_id: quote.account_id, assigned_to: me?.name ?? null, subject: `${quote.line_of_business} quote lost — ${reason}`, description: notes.trim() || null });
      toast('Quote marked as lost', 'info');
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Mark quote as lost" onClose={onClose} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" icon={<Ban size={15} />} loading={busy} onClick={submit}>Mark lost</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Reason" required><Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Select a reason" options={LOST_REASONS} /></Field>
        <Field label="Notes" required={reason === 'Other'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Competitor, price they chose, follow-up date…" /></Field>
        <div className="text-xs text-ink-400">A note is logged to the account's activity history.</div>
      </div>
    </Modal>
  );
}

// ── Printable proposal ──

const PRINT_CSS = `
@media print {
  body > *:not(#ns-quote-proposal) { display: none !important; }
  #ns-quote-proposal { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  #ns-quote-proposal .no-print { display: none !important; }
  #ns-quote-proposal .sheet { box-shadow: none !important; border: 0 !important; max-width: none !important; margin: 0 !important; }
  @page { margin: 14mm; }
}`;

function ProposalView({ quote, account, onClose }: { quote: Quote; account: Account | null; onClose: () => void }) {
  const { settings, me } = useAppData();
  const results = sortRates(quote.results ?? []);
  const quoted = results.filter((r) => r.status === 'Quoted');
  const declined = results.filter((r) => r.status !== 'Quoted');
  const best = bestRate(results);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div id="ns-quote-proposal" className="fixed inset-0 z-[120] bg-ink-900/50 overflow-y-auto p-3 sm:p-6">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex justify-end gap-2 max-w-4xl mx-auto mb-3">
        <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>Print / Save PDF</Button>
        <Button icon={<X size={15} />} onClick={onClose}>Close</Button>
      </div>
      <div className="sheet bg-white max-w-4xl mx-auto rounded shadow-pop p-6 sm:p-10 text-ink-900">
        <div className="flex flex-wrap justify-between gap-4 border-b-2 border-brand-500 pb-4 mb-6">
          <div>
            <div className="text-xl font-bold text-brand-700">{settings?.name ?? 'Northstar Insurance Agency'}</div>
            <div className="text-xs text-ink-500 mt-1">
              {[settings?.address, [settings?.city, settings?.state].filter(Boolean).join(', '), settings?.zip].filter(Boolean).join(' · ')}
              {settings?.phone && <> · {settings.phone}</>}{settings?.email && <> · {settings.email}</>}
            </div>
            {settings?.license_number && <div className="text-xs text-ink-400">License {settings.license_number}</div>}
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Insurance Proposal</div>
            <div className="text-base font-semibold">{quote.line_of_business}</div>
            <div className="text-xs text-ink-500">Prepared {fmtDate(today())}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-[13px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Prepared for</div>
            <div className="font-semibold">{account ? accountName(account) : '—'}</div>
            {account && <div className="text-ink-600 text-xs">{[account.address, account.city, account.state, account.zip].filter(Boolean).join(', ')}</div>}
            {account?.phone && <div className="text-ink-600 text-xs">{fmtPhone(account.phone)}</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Proposed effective</div>
            <div className="font-semibold">{fmtDate(quote.effective_date)}</div>
            <div className="text-ink-600 text-xs">{best ? `${best.term_months}-month term` : ''}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Your agent</div>
            <div className="font-semibold">{account?.producer ?? me?.name ?? '—'}</div>
          </div>
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600 mb-2">Premium comparison</h2>
        <table className="w-full text-[13px] mb-6 border border-ink-100">
          <thead>
            <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
              <th className="text-left px-3 py-2">Carrier</th><th className="text-right px-3 py-2">Term premium</th><th className="text-right px-3 py-2">Est. monthly</th><th className="text-left px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {quoted.map((r) => (
              <tr key={r.carrier} className="border-t border-ink-100">
                <td className="px-3 py-2 font-semibold">{r.carrier} {best?.carrier === r.carrier && <Badge tone="teal">Best value</Badge>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.premium)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(monthlyEstimate(r), true)}</td>
                <td className="px-3 py-2 text-xs text-ink-500">{r.term_months} months{r.message ? ` · ${r.message}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600 mb-2">Coverage comparison</h2>
        <div className="border border-ink-100 mb-6"><CoverageMatrix rates={quoted} /></div>

        {declined.length > 0 && (
          <div className="text-xs text-ink-500 mb-6">
            <div className="font-semibold text-ink-600 mb-1">Also shopped (no offer):</div>
            {declined.map((r) => <div key={r.carrier}>{r.carrier} — {r.message ?? r.status}</div>)}
          </div>
        )}

        <div className="text-[11px] text-ink-400 border-t border-ink-100 pt-3 space-y-1">
          <p>This proposal is a summary for comparison only and does not bind coverage. Coverage is subject to underwriting approval and the terms, conditions and exclusions of the policy issued.</p>
          <p>Simulated rates — not bindable carrier quotes. Premiums shown were produced by the agency's rating model for illustration and may differ from final carrier pricing.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
