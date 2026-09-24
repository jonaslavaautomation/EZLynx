import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Save, UserPlus, X, XCircle, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import {
  Button, Checkbox, EmptyState, ErrorBanner, Field, Input, LoadingBlock, PageHeader, Panel, Select, cx, useFeedback,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, addDays, fmtMoney, today } from '@/lib/format';
import { href, navigate, useRoute } from '@/lib/router';
import { US_STATES, type Account, type LineOfBusiness, type Quote } from '@/lib/types';
import { ComparisonTable, SimulatedNote, TextField } from './components';
import { carriersForLine, loadAccountRisk, saveRiskToAccount } from './data';
import {
  COMMERCIAL_QUOTE_LINES, QUOTE_LINES, buildDefaultInput, isQuoteLine, mergeInput, pruneInput, readInput, sectionOf, validateRisk,
  type AccountRisk, type Errors, type QuoteInput, type SectionKey,
} from './inputs';
import { bestRate, rateQuote, type RatedCarrier } from './rating';
import { CoverageStep, RiskStep, type SetSection } from './steps';

const STEPS = ['Applicant', 'Risk details', 'Coverages', 'Carriers', 'Results'];
const EMPTY_RISK: AccountRisk = { account: null, drivers: [], vehicles: [], properties: [] };

type Run = { id: number; results: RatedCarrier[]; order: string[]; timing: Record<string, { start: number; dur: number }>; t0: number; total: number };

/**
 * The router only remounts pages when the path changes, so `/quotes/new?quote=A` → `/quotes/new?account=B`
 * (e.g. "New quote" from the bound-quote screen, or Quick add while editing) would keep the previous
 * quote's id/state. Key the wizard on its params so each target starts fresh.
 */
export function QuoteWizard({ accountId, line }: { accountId: string | null; line: string | null }) {
  const editId = useRoute().params.get('quote');
  return <QuoteWizardInner key={`${editId ?? ''}|${accountId ?? ''}|${line ?? ''}`} editId={editId} accountId={accountId} line={line} />;
}

function QuoteWizardInner({ editId, accountId, line }: { editId: string | null; accountId: string | null; line: string | null }) {
  const { appointedCarriers, carriers, me } = useAppData();
  const { toast, confirm } = useFeedback();

  const [quoteId] = useState<string | null>(editId);
  const insertedId = useRef<string | null>(null);
  const [original, setOriginal] = useState<Quote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acctId, setAcctId] = useState<string | null>(accountId);
  const [risk, setRisk] = useState<AccountRisk>(EMPTY_RISK);
  const [lob, setLob] = useState<LineOfBusiness>(isQuoteLine(line) ? line : 'Personal Auto');
  const [effective, setEffective] = useState(today());
  const [input, setInput] = useState<QuoteInput>(() => buildDefaultInput(EMPTY_RISK));
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'rate'>(null);
  const [showProspect, setShowProspect] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const finished = useRef(0);

  // Initial load: an existing quote (edit) or a preset account.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (editId) {
          const q = await db.get('quotes', editId);
          if (!q) throw new Error('Quote not found. It may have been deleted.');
          const r = await loadAccountRisk(q.account_id);
          if (!live) return;
          setOriginal(q);
          setAcctId(q.account_id);
          setRisk(r);
          setLob(q.line_of_business);
          setEffective(q.effective_date);
          setInput(mergeInput(readInput(q), buildDefaultInput(r)));
          setMaxStep(3);
        } else if (accountId) {
          const r = await loadAccountRisk(accountId);
          if (!live) return;
          if (!r.account) { setAcctId(null); return; }
          setRisk(r);
          setInput(buildDefaultInput(r));
          if (!isQuoteLine(line) && r.account.account_type === 'Commercial') setLob('General Liability');
        }
      } catch (e) {
        if (live) setLoadError((e as Error).message);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const eligible = useMemo(() => carriersForLine(lob, appointedCarriers), [lob, appointedCarriers]);
  const notAppointed = useMemo(() => carriers.filter((c) => !c.appointed && c.lines.includes(lob)), [carriers, lob]);

  const set = useCallback(<K extends SectionKey>(key: K, patch: Partial<NonNullable<QuoteInput[K]>>) => {
    setInput((i) => ({ ...i, [key]: { ...(i[key] as object), ...patch } }));
    setDirty(true);
  }, []) as SetSection;

  const chooseAccount = async (id: string | null, account: Account | null) => {
    setAcctId(id);
    setDirty(true);
    setErrors((e) => ({ ...e, account: '' }));
    if (!id) { setRisk(EMPTY_RISK); setInput((i) => buildDefaultInput(EMPTY_RISK, i.carriers)); return; }
    try {
      const r = await loadAccountRisk(id);
      setRisk(r);
      setInput((i) => buildDefaultInput(r, i.carriers));
      if (account?.account_type === 'Commercial' && !COMMERCIAL_QUOTE_LINES.includes(lob)) setLob('General Liability');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const changeLine = (l: LineOfBusiness) => {
    setLob(l);
    setDirty(true);
    setInput((i) => ({ ...i, carriers: carriersForLine(l, appointedCarriers).map((c) => c.name) }));
    setMaxStep((m) => Math.min(m, 0));
  };

  // ── validation ──

  const validateStep = (s: number): Errors => {
    const e: Errors = {};
    if (s === 0) {
      if (!acctId) e.account = 'Choose an account or create a new prospect';
      if (!effective) e.effective = 'Required';
      else if (effective < today()) e.effective = "Effective date can't be in the past";
      else if (effective > addDays(today(), 365)) e.effective = 'Must be within the next 12 months';
    } else if (s === 1) {
      return validateRisk(lob, input);
    } else if (s === 2) {
      const key = sectionOf(lob);
      if (key === 'home') {
        const d = input.home!.dwelling;
        if (!Number.isFinite(d) || d < 50000 || d > 10_000_000) e['home.dwelling'] = '$50,000 – $10,000,000';
      }
    } else if (s === 3) {
      if (!input.carriers.some((c) => eligible.some((x) => x.name === c))) e.carriers = 'Select at least one carrier to rate';
    }
    return e;
  };

  const fail = (e: Errors) => {
    setErrors(e);
    const n = Object.values(e).filter(Boolean).length;
    if (n) toast(`Please fix ${n} highlighted field${n > 1 ? 's' : ''}`, 'error');
    return n > 0;
  };

  const goTo = (target: number) => {
    if (target <= step) { setErrors({}); setStep(target); return; }
    for (let s = step; s < target; s++) {
      const e = validateStep(s);
      if (Object.values(e).some(Boolean)) { setStep(s); fail(e); return; }
    }
    if (target === 3 && !input.carriers.some((c) => eligible.some((x) => x.name === c))) {
      setInput((i) => ({ ...i, carriers: eligible.map((c) => c.name) }));
    }
    setErrors({});
    setStep(target);
    setMaxStep((m) => Math.max(m, target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── persistence ──

  const persist = async (status: 'Draft' | 'Rated', results: RatedCarrier[]) => {
    // Saving from the wizard re-opens a Lost quote (status becomes Draft/Rated), so drop its lost reason.
    let inp = pruneInput(lob, { ...input, lost_reason: undefined, lost_notes: undefined, carriers: input.carriers.filter((c) => eligible.some((x) => x.name === c)), ...(status === 'Rated' ? { rated_at: new Date().toISOString() } : {}) });
    // Only write back to the account when the risk section is valid; a draft can hold blank or
    // half-entered drivers/vehicles that would create junk rows (or fail NOT NULL/int columns).
    const riskValid = !Object.values(validateRisk(lob, inp)).some(Boolean);
    if (inp.save_to_account && acctId && !riskValid) toast('Account records were not updated — complete the risk details first', 'info');
    if (inp.save_to_account && acctId && riskValid) {
      const saved = await saveRiskToAccount(acctId, lob, inp);
      inp = saved.input;
      setInput((i) => ({ ...i, ...inp }));
      if (saved.written) toast(`Saved ${saved.written} record${saved.written > 1 ? 's' : ''} back to the account`, 'info');
    }
    const values: Partial<Quote> = {
      account_id: acctId!, line_of_business: lob, status, effective_date: effective || today(), input: inp as unknown as Record<string, unknown>,
      results, selected_carrier: null, selected_premium: null, policy_id: null,
    };
    // Once inserted, later saves (e.g. "Retry save" after the activity log failed) update that row
    // instead of inserting a duplicate quote.
    const id = quoteId ?? insertedId.current;
    const q = id ? await db.update('quotes', id, values) : await db.insert('quotes', values);
    insertedId.current = q.id;
    return q;
  };

  const saveDraft = async () => {
    if (!acctId) { setStep(0); fail({ account: 'Choose an account before saving a draft' }); return; }
    if (original?.status === 'Rated' && original.results.length) {
      const ok = await confirm({ title: 'Save as draft?', message: 'Saving this quote as a draft clears its current carrier rates. You can re-rate it later.', confirmLabel: 'Save draft' });
      if (!ok) return;
    }
    setBusy('draft');
    try {
      const q = await persist('Draft', []);
      toast('Quote saved as draft');
      setDirty(false);
      navigate(`/quotes/${q.id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const startRating = () => {
    const selected = eligible.filter((c) => input.carriers.includes(c.name));
    const results = rateQuote(lob, input, selected);
    const timing: Run['timing'] = {};
    selected.forEach((c, i) => { timing[c.name] = { start: i * 260, dur: 900 + Math.round(Math.random() * 1300) }; });
    const total = Math.max(...Object.values(timing).map((t) => t.start + t.dur));
    setSaveError(null);
    setElapsed(0);
    setRun({ id: Date.now(), results, order: selected.map((c) => c.name), timing, t0: Date.now(), total });
  };

  const finish = useCallback(async (r: Run) => {
    setBusy('rate');
    setSaveError(null);
    try {
      const q = await persist('Rated', r.results);
      const quoted = r.results.filter((x) => x.status === 'Quoted');
      const best = bestRate(r.results);
      await logActivity({
        account_id: acctId, type: 'Note', assigned_to: me?.name ?? null,
        subject: `${lob} quote rated — ${quoted.length} of ${r.results.length} carrier${r.results.length === 1 ? '' : 's'} quoted`,
        description: best ? `Lowest: ${best.carrier} at ${fmtMoney(best.premium)} for ${best.term_months} months.` : 'No carriers offered terms.',
      });
      toast(best ? `Rated ${r.results.length} carrier${r.results.length === 1 ? '' : 's'} — lowest ${fmtMoney(best.premium)} (${best.carrier})` : 'Rating complete — no carriers offered terms', best ? 'success' : 'info');
      setDirty(false);
      navigate(`/quotes/${q.id}`, { replace: true });
    } catch (e) {
      setSaveError((e as Error).message);
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acctId, lob, input, effective, quoteId, me, eligible]);

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => {
      const el = Date.now() - run.t0;
      setElapsed(el);
      if (el >= run.total + 250) {
        clearInterval(t);
        if (finished.current !== run.id) { finished.current = run.id; void finish(run); }
      }
    }, 60);
    return () => clearInterval(t);
  }, [run, finish]);

  const rate = () => {
    for (let s = 0; s < 4; s++) {
      const e = validateStep(s);
      if (Object.values(e).some(Boolean)) { setStep(s); fail(e); return; }
    }
    setErrors({});
    setStep(4);
    setMaxStep(4);
    startRating();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = quoteId ? `/quotes/${quoteId}` : accountId ? `/accounts/${accountId}?tab=quotes` : '/quotes';
  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard this quote?', message: 'Information you entered that has not been saved will be lost.', confirmLabel: 'Discard', danger: true }))) return;
    navigate(back);
  };

  // ── render ──

  if (!loaded) return <LoadingBlock label="Loading quote…" />;
  if (loadError) return <div className="p-4 max-w-xl"><ErrorBanner message={loadError} /><div className="mt-3"><Button onClick={() => navigate('/quotes')}>Back to quotes</Button></div></div>;
  if (original?.status === 'Bound') {
    return (
      <Panel>
        <EmptyState title="This quote is already bound" message="Bound quotes can't be edited. Make changes on the policy instead, or start a new quote."
          action={<div className="flex gap-2 justify-center"><Button onClick={() => navigate(`/quotes/${original.id}`)}>View quote</Button><Button variant="primary" onClick={() => navigate(`/quotes/new?account=${original.account_id}&line=${encodeURIComponent(original.line_of_business)}`)}>New quote</Button></div>} />
      </Panel>
    );
  }

  const rating = step === 4;
  const key = sectionOf(lob);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={quoteId ? 'Edit Quote' : 'New Quote'}
        subtitle={<>{risk.account ? accountName(risk.account) : 'Comparative rater'} · {lob}</>}
        breadcrumb={[{ label: 'Quotes', href: href('/quotes') }, ...(risk.account ? [{ label: accountName(risk.account), href: href(`/accounts/${risk.account.id}?tab=quotes`) }] : [])]}
        actions={!rating && <Button variant="ghost" icon={<X size={15} />} onClick={cancel}>Cancel</Button>}
      />

      {/* Stepper */}
      <ol className="flex items-center gap-1 overflow-x-auto bg-white border border-[#e3e3e3] rounded shadow-card px-2 py-2 mb-4">
        {STEPS.map((label, i) => {
          const done = i < step || (rating && i < 4);
          const active = i === step;
          const clickable = !rating && i < 4 && i <= Math.max(maxStep, step);
          return (
            <li key={label} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="w-4 sm:w-8 h-px bg-ink-200" />}
              <button type="button" disabled={!clickable} onClick={() => goTo(i)}
                className={cx('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-transparent disabled:cursor-default', active ? 'text-brand-700' : done ? 'text-ink-700' : 'text-ink-400', clickable && !active && 'hover:bg-ink-50')}>
                <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[11px]', active ? 'bg-brand-500 text-white' : done ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')}>
                  {done ? <Check size={12} /> : i + 1}
                </span>
                <span className={cx(!active && 'hidden sm:inline')}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Panel title={STEPS[step]} actions={step === 1 && risk.account ? <span className="text-xs text-ink-400">Prefilled from account</span> : undefined}>
        {step === 0 && (
          <div className="space-y-4 max-w-3xl">
            <Field label="Account" required error={errors.account || undefined}>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 min-w-0"><AccountPicker value={acctId} onChange={chooseAccount} /></div>
                {!acctId && <Button icon={<UserPlus size={15} />} onClick={() => setShowProspect((v) => !v)}>{showProspect ? 'Hide new prospect' : 'New prospect'}</Button>}
              </div>
            </Field>
            {!acctId && showProspect && (
              <ProspectForm commercial={COMMERCIAL_QUOTE_LINES.includes(lob)} producer={me?.name ?? null}
                onCreated={(a) => { setShowProspect(false); void chooseAccount(a.id, a); toast(`Prospect ${accountName(a)} created`); }} />
            )}
            {risk.account && (
              <div className="text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2">
                {[risk.account.address, risk.account.city, risk.account.state, risk.account.zip].filter(Boolean).join(', ') || 'No address on file'}
                {' · '}{risk.drivers.length} driver{risk.drivers.length === 1 ? '' : 's'}, {risk.vehicles.length} vehicle{risk.vehicles.length === 1 ? '' : 's'}, {risk.properties.length} propert{risk.properties.length === 1 ? 'y' : 'ies'} on file
                {risk.account.producer && <> · Producer {risk.account.producer}</>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Line of business" required>
                <Select value={lob} onChange={(e) => changeLine(e.target.value as LineOfBusiness)} options={QUOTE_LINES} />
              </Field>
              <Field label="Effective date" required error={errors.effective || undefined}>
                <Input type="date" value={effective} min={today()} onChange={(e) => { setEffective(e.target.value); setDirty(true); }} />
              </Field>
            </div>
            <div className="text-xs text-ink-400">{eligible.length} appointed carrier{eligible.length === 1 ? '' : 's'} write {lob}.</div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <RiskStep line={lob} input={input} set={set} errors={errors} risk={risk} />
            {(key === 'auto' || key === 'home') && (
              <div className="border-t border-ink-100 pt-3">
                <Checkbox
                  label={key === 'auto' ? 'Save driver & vehicle changes back to the account' : 'Save property details back to the account'}
                  checked={!!input.save_to_account}
                  onChange={(v) => { setInput((i) => ({ ...i, save_to_account: v })); setDirty(true); }}
                />
                <div className="text-[11px] text-ink-400 mt-1 ml-6">Updates existing records and adds new ones when the quote is saved. Rows removed here are not deleted from the account.</div>
              </div>
            )}
          </div>
        )}

        {step === 2 && <CoverageStep line={lob} input={input} set={set} errors={errors} risk={risk} />}

        {step === 3 && (
          <div className="space-y-3">
            {eligible.length === 0 ? (
              <EmptyState title={`No appointed carriers write ${lob}`} message={<>Appoint a carrier for this line in <a className="text-brand-600 hover:underline" href={href('/settings')}>Settings</a>, or choose another line of business.</>} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13px] text-ink-600">{input.carriers.filter((c) => eligible.some((x) => x.name === c)).length} of {eligible.length} selected</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setInput((i) => ({ ...i, carriers: eligible.map((c) => c.name) })); setErrors({}); }}>Select all</Button>
                    <Button size="sm" variant="ghost" onClick={() => setInput((i) => ({ ...i, carriers: [] }))}>Clear</Button>
                  </div>
                </div>
                {errors.carriers && <div className="text-xs text-red-600">{errors.carriers}</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {eligible.map((c) => {
                    const on = input.carriers.includes(c.name);
                    return (
                      <label key={c.id} className={cx('flex items-start gap-3 border rounded p-3 cursor-pointer transition-colors', on ? 'border-brand-300 bg-brand-50/60' : 'border-ink-100 hover:border-ink-200')}>
                        <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[#dc2626]" checked={on}
                          onChange={(e) => { const v = e.target.checked; setInput((i) => ({ ...i, carriers: v ? [...i.carriers, c.name] : i.carriers.filter((x) => x !== c.name) })); setDirty(true); }} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-ink-900">{c.name}</span>
                          <span className="block text-[11px] text-ink-400">NAIC {c.naic ?? '—'} · {c.commission_rate}% commission</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {notAppointed.length > 0 && <div className="text-[11px] text-ink-400">Not appointed (not rated): {notAppointed.map((c) => c.name).join(', ')}</div>}
              </>
            )}
          </div>
        )}

        {step === 4 && run && (
          <RatingProgress run={run} elapsed={elapsed} saving={busy === 'rate'} saveError={saveError} onRetry={() => void finish(run)} onBack={() => { setRun(null); setStep(3); setBusy(null); }} />
        )}

        {!rating && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-ink-100">
            <Button variant="ghost" icon={<ArrowLeft size={15} />} disabled={step === 0} onClick={() => goTo(step - 1)}>Back</Button>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Save size={15} />} loading={busy === 'draft'} onClick={saveDraft}>Save draft</Button>
              {step < 3 && <Button variant="primary" onClick={() => goTo(step + 1)}>Next <ArrowRight size={15} /></Button>}
              {step === 3 && (
                <Button variant="primary" icon={<Zap size={15} />} disabled={eligible.length === 0} onClick={rate}>
                  Rate {input.carriers.filter((c) => eligible.some((x) => x.name === c)).length || ''} carrier{input.carriers.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </div>
        )}
        <SimulatedNote className="mt-4" />
      </Panel>
    </div>
  );
}

function RatingProgress({ run, elapsed, saving, saveError, onRetry, onBack }: { run: Run; elapsed: number; saving: boolean; saveError: string | null; onRetry: () => void; onBack: () => void }) {
  const byName = new Map(run.results.map((r) => [r.carrier, r]));
  const doneList = run.order.filter((n) => elapsed >= run.timing[n].start + run.timing[n].dur);
  const allDone = doneList.length === run.order.length;
  const finished = run.results.filter((r) => doneList.includes(r.carrier));
  return (
    <div className="space-y-4">
      <div className="text-[13px] text-ink-600">
        {allDone ? `Rating complete — ${run.results.filter((r) => r.status === 'Quoted').length} of ${run.order.length} carriers returned terms.` : `Rating ${run.order.length} carrier${run.order.length === 1 ? '' : 's'}…`}
      </div>
      <div className="space-y-2">
        {run.order.map((name) => {
          const t = run.timing[name];
          const p = Math.max(0, Math.min(1, (elapsed - t.start) / t.dur));
          const done = p >= 1;
          const r = byName.get(name);
          const phase = p <= 0 ? 'Queued' : p < 0.25 ? 'Connecting…' : p < 0.7 ? 'Submitting risk…' : 'Retrieving rate…';
          return (
            <div key={name} className="flex items-center gap-3">
              <div className="w-36 sm:w-48 shrink-0 text-[13px] font-semibold text-ink-800 truncate">{name}</div>
              <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                <div className={cx('h-full rounded-full transition-[width] duration-100', done ? (r?.status === 'Quoted' ? 'bg-brand-500' : 'bg-red-400') : 'bg-brand-300')} style={{ width: `${Math.round(p * 100)}%` }} />
              </div>
              <div className="w-28 sm:w-40 shrink-0 text-right text-xs tabular-nums">
                {!done ? <span className="text-ink-400 inline-flex items-center gap-1">{p > 0 && <Loader2 size={11} className="animate-spin" />}{phase}</span>
                  : r?.status === 'Quoted' ? <span className="text-brand-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 size={12} />{fmtMoney(r.premium)}</span>
                    : <span className="text-red-600 inline-flex items-center gap-1"><XCircle size={12} />{r?.status ?? 'Declined'}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {finished.length > 0 && <div className="border border-ink-100 rounded"><ComparisonTable rates={finished} /></div>}
      {allDone && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {saving && <span className="inline-flex items-center gap-2 text-ink-500"><Loader2 size={14} className="animate-spin" /> Saving quote…</span>}
          {saveError && (
            <>
              <ErrorBanner message={`Couldn't save the quote: ${saveError}`} />
              <Button variant="primary" onClick={onRetry}>Retry save</Button>
              <Button variant="ghost" onClick={onBack}>Back to carriers</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProspectForm({ commercial, producer, onCreated }: { commercial: boolean; producer: string | null; onCreated: (a: Account) => void }) {
  const { toast } = useFeedback();
  const [v, setV] = useState({ first_name: '', last_name: '', business_name: '', email: '', phone: '', address: '', city: '', state: 'TX', zip: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const f = (k: keyof typeof v) => (s: string) => setV((x) => ({ ...x, [k]: s }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!v.first_name.trim()) e.first_name = 'Required';
    if (!v.last_name.trim()) e.last_name = 'Required';
    if (commercial && !v.business_name.trim()) e.business_name = 'Required for commercial lines';
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email';
    if (v.phone && v.phone.replace(/\D/g, '').length !== 10) e.phone = '10-digit phone number';
    if (v.zip && !/^\d{5}$/.test(v.zip)) e.zip = '5-digit ZIP';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const a = await db.insert('accounts', {
        first_name: v.first_name.trim(), last_name: v.last_name.trim(), email: v.email.trim(), phone: v.phone.trim() || null,
        address: v.address.trim() || null, city: v.city.trim() || null, state: v.state || null, zip: v.zip || null,
        status: 'Prospect', account_type: commercial ? 'Commercial' : 'Personal', business_name: commercial ? v.business_name.trim() : null,
        policy_type: null, dob: null, marital_status: null, occupation: null, mobile_phone: null, producer, csr: null, lead_source: 'Quote', notes: null,
      });
      onCreated(a);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-brand-200 bg-brand-50/40 rounded p-3 space-y-3">
      <div className="text-[13px] font-semibold text-ink-800">New {commercial ? 'commercial' : 'personal'} prospect</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {commercial && <TextField className="col-span-2 sm:col-span-3" label="Business name" required value={v.business_name} onChange={f('business_name')} error={errors.business_name} />}
        <TextField label={commercial ? 'Contact first name' : 'First name'} required value={v.first_name} onChange={f('first_name')} error={errors.first_name} />
        <TextField label={commercial ? 'Contact last name' : 'Last name'} required value={v.last_name} onChange={f('last_name')} error={errors.last_name} />
        <TextField label="Email" type="email" value={v.email} onChange={f('email')} error={errors.email} />
        <TextField label="Phone" type="tel" value={v.phone} onChange={f('phone')} error={errors.phone} />
        <TextField className="col-span-2" label="Address" value={v.address} onChange={f('address')} />
        <TextField label="City" value={v.city} onChange={f('city')} />
        <Field label="State"><Select value={v.state} onChange={(e) => f('state')(e.target.value)} options={US_STATES} /></Field>
        <TextField label="ZIP" value={v.zip} maxLength={5} onChange={(s) => f('zip')(s.replace(/\D/g, ''))} error={errors.zip} />
      </div>
      <div className="flex justify-end">
        <Button variant="primary" icon={<UserPlus size={15} />} loading={busy} onClick={submit}>Create prospect</Button>
      </div>
    </div>
  );
}
