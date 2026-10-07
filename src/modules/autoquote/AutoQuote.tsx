import { AlertTriangle, Car, ClipboardList, Gauge, Quote as QuoteIcon, ShieldCheck, Siren, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, LoadingBlock, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { today } from '@/lib/format';
import { useRow } from '@/lib/hooks';
import { navigate, useRoute } from '@/lib/router';
import type { Account, CarrierRate, Quote } from '@/lib/types';
import { useCarrierQuoting } from '@/modules/admin/integration';
import { syncAutoRisk } from '@/modules/quotes/data';
import { useUserPreferences } from '@/modules/usersettings/data';
import { IssuesCtx, WorkflowCtx, type Ctx } from './fields';
import { STEPS, isView, newWorkflow, toAutoInput, validate, type StepKey, type View, type Workflow } from './model';
import { rateWorkflow } from './rate';
import { ResultsView, ReviewStep, SubmitView } from './review';
import { ApplicantDrawer, QuoteStepper, RecordTabs, WorkflowHeader, useHidePrefilled, useQuoteThemeDialogs, useStepNav, type StepDef } from './shell';
import { DriversStep, PolicyStep, RatingStep, applyPrefill } from './steps-a';
import { CarrierStep, CoverageStep, IncidentsStep, VehiclesStep } from './steps-b';

/* Auto quoting workflow: stepper over the applicant record, autosaved as a Draft quote, submitted to carriers for results. */

const STEP_ICONS: Record<StepKey, StepDef['icon']> = { rating: Gauge, policy: ClipboardList, drivers: User, vehicles: Car, incidents: Siren, coverage: ShieldCheck, carrier: QuoteIcon, review: AlertTriangle };
const STEP_DEFS: StepDef[] = STEPS.map((s) => ({ key: s.key, label: s.label, icon: STEP_ICONS[s.key] }));
// Draft ids created by an open workspace (its own URL update must not reload the page).
const createdHere = new Set<string>();

/** Route entry: remounts the workflow when the URL points at a different quote. */
export function AutoQuoteRoute({ accountId, quoteId }: { accountId: string; quoteId: string | null }) {
  const [key, setKey] = useState(`${accountId}:${quoteId ?? 'new'}`);
  const last = useRef({ accountId, quoteId });
  useEffect(() => {
    const prev = last.current;
    if (quoteId === prev.quoteId && accountId === prev.accountId) return;
    last.current = { accountId, quoteId };
    if (accountId !== prev.accountId || !quoteId || !createdHere.has(quoteId)) setKey(`${accountId}:${quoteId ?? 'new'}:${Date.now()}`);
  }, [accountId, quoteId]);
  return <AutoQuote key={key} accountId={accountId} quoteId={quoteId} />;
}

function AutoQuote({ accountId, quoteId }: { accountId: string; quoteId: string | null }) {
  const account = useRow('accounts', accountId);
  // Only the quote the page opened with is loaded; the id the workspace adds after its first autosave is its own.
  const openedWith = useRef(quoteId).current;
  const [quote, setQuote] = useState<Quote | null | 'loading'>(openedWith ? 'loading' : null);
  useEffect(() => {
    if (!openedWith) return;
    let live = true;
    db.get('quotes', openedWith).then((q) => { if (live) setQuote(q ?? null); }).catch(() => live && setQuote(null));
    return () => { live = false; };
  }, [openedWith]);
  if (account.loading || quote === 'loading') return <LoadingBlock label="Loading quote…" />;
  if (!account.data) return <EmptyState title="Applicant not found" message="It may have been deleted." action={<Button onClick={() => navigate('/accounts')}>Back to applicants</Button>} />;
  if (openedWith && !quote) return <EmptyState title="Quote not found" message="It may have been deleted." action={<Button onClick={() => navigate(`/accounts/${accountId}?tab=quotes`)}>Back to quotes</Button>} />;
  if (account.data.account_type === 'Commercial') return <EmptyState title="Personal auto only" message="This quoting workflow is for personal lines applicants. Use New Quote for commercial lines." action={<Button onClick={() => navigate(`/quotes/new?account=${accountId}&line=Commercial%20Auto`)}>Commercial auto quote</Button>} />;
  return <Workspace account={account.data} initial={quote as Quote | null} />;
}

function Workspace({ account, initial }: { account: Account; initial: Quote | null }) {
  const { appointedCarriers, me } = useAppData();
  const quoting = useCarrierQuoting();
  const prefs = useUserPreferences();
  const { toast } = useFeedback();
  const { params } = useRoute();
  const autoCarriers = useMemo(() => appointedCarriers.filter((c) => c.lines.includes('Personal Auto') && (!quoting.active || quoting.isReady(c.name, 'Personal Auto'))), [appointedCarriers, quoting]);
  const autoNames = useMemo(() => autoCarriers.map((c) => c.name), [autoCarriers]);

  const [w, setW] = useState<Workflow>(() => {
    const stored = (initial?.input as { workflow?: Workflow } | undefined)?.workflow;
    return stored?.v === 1 ? stored : newWorkflow(account, autoNames, prefs.submit_all_auto);
  });
  const [quoteId, setQuoteId] = useState<string | null>(initial?.id ?? null);
  const [results, setResults] = useState<CarrierRate[]>(initial?.results ?? []);
  const [status, setStatus] = useState(initial?.status ?? 'Draft');
  // Bound and lost quotes are history: view results only; requoting starts a new quote.
  const locked = status === 'Bound' || status === 'Lost';
  // Bookkeeping written by other screens (bind, mark lost) that autosave must keep.
  const keep = useRef(Object.fromEntries(Object.entries(initial?.input ?? {}).filter(([k]) => ['bound_at', 'lost_reason', 'lost_notes', 'rated_at'].includes(k))));
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hidePrefilled, toggleHidePrefilled] = useHidePrefilled();
  const dirty = useRef(false);
  const creating = useRef<Promise<string> | null>(null);

  // Carriers can load after the first render: preselect them for a brand-new quote per the user's preference.
  const seeded = useRef(!!initial);
  useEffect(() => {
    if (quoting.loading || !autoNames.length) return;
    // Carriers that aren't (or are no longer) ready to rate auto can't stay selected.
    setW((x) => {
      const carriers = x.rating.carriers.filter((c) => autoNames.includes(c));
      const seed = !seeded.current && prefs.submit_all_auto && !carriers.length ? autoNames : carriers;
      return seed.length === x.rating.carriers.length && seed.every((c, i) => c === x.rating.carriers[i]) ? x : { ...x, rating: { ...x.rating, carriers: seed } };
    });
    seeded.current = true;
  }, [autoNames, prefs.submit_all_auto, quoting.loading]);

  const up = useCallback((fn: (w: Workflow) => Workflow) => {
    if (locked) { toast(`This quote is ${status.toLowerCase()} and can't be changed. Start a new auto quote to requote.`, 'info'); return; }
    dirty.current = true;
    setW((cur) => applyPrefill(fn(cur), autoNames));
  }, [autoNames, locked, status, toast]);

  const asked: View = isView(params.get('step')) ? (params.get('step') as View) : initial?.status === 'Rated' || locked ? 'results' : 'rating';
  const view: View = locked ? 'results' : asked;
  const allIssues = useMemo(() => validate(w, autoNames), [w, autoNames]);
  const issues = useMemo(() => { const m = new Map<string, string>(); for (const i of allIssues) if (!m.has(i.field)) m.set(i.field, i.message); return m; }, [allIssues]);

  // Mark steps visited.
  useEffect(() => {
    if (STEPS.some((s) => s.key === view) && !w.visited.includes(view as StepKey)) setW((x) => ({ ...x, visited: [...x.visited, view as StepKey] }));
  }, [view, w.visited]);

  const go = useStepNav(view);

  // ── Autosave (Draft quote) ──
  const payload = useCallback((x: Workflow, extra?: Partial<Quote>) => ({
    account_id: account.id, line_of_business: 'Personal Auto' as const, effective_date: x.policy.effective || today(),
    input: { ...keep.current, v: 1, carriers: x.rating.carriers, auto: toAutoInput(x, account.zip ?? ''), workflow: x, ...(extra?.status === 'Rated' ? { rated_at: new Date().toISOString() } : {}) },
    ...extra,
  }), [account.id, account.zip]);

  const ensureQuote = useCallback(async (x: Workflow) => {
    if (quoteId) return quoteId;
    creating.current ??= db.insert('quotes', { ...payload(x), status: 'Draft', results: [], selected_carrier: null, selected_premium: null, policy_id: null }).then((q) => {
      setQuoteId(q.id);
      createdHere.add(q.id);
      const p = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      navigate(`/accounts/${account.id}/auto-quote/${q.id}${p.toString() ? `?${p}` : ''}`, { replace: true });
      return q.id;
    }, (e) => { creating.current = null; throw e; });
    return creating.current;
  }, [quoteId, payload, account.id]);

  // Drivers and vehicles are saved to the insured as they are entered (not only when the quote is submitted).
  // Serialized so two autosaves never insert the same driver twice; new row ids are written back into the quote.
  const riskChain = useRef<Promise<unknown>>(Promise.resolve());
  const syncRisk = useCallback((x: Workflow) => {
    const run = riskChain.current.catch(() => {}).then(async () => {
      const auto = toAutoInput({ ...x, drivers: x.drivers.map((d) => ({ ...d, rated: 'Rated' as const })) }, account.zip ?? '');
      const year = new Map(x.vehicles.map((v) => [v.key, v.year]));
      const ids = await syncAutoRisk(account.id, auto, { vehicle: (k) => /^\d{4}$/.test((year.get(k) ?? '').trim()) });
      const missing = (r: { key: string; id: string | null }) => !r.id && ids.has(r.key);
      if (!x.drivers.some(missing) && !x.vehicles.some(missing)) return;
      dirty.current = true; // store the new ids on the quote with the next autosave
      setW((cur) => ({
        ...cur,
        drivers: cur.drivers.map((d) => (d.id ? d : { ...d, id: ids.get(d.key) ?? null })),
        vehicles: cur.vehicles.map((v) => (v.id ? v : { ...v, id: ids.get(v.key) ?? null })),
      }));
    });
    riskChain.current = run;
    return run;
  }, [account.id, account.zip]);

  const save = useCallback(async (x: Workflow) => {
    dirty.current = false;
    setSaving('saving');
    try {
      const id = await ensureQuote(x);
      // Carrier results describe the quote as submitted; once it changes they must be requested again.
      const stale = status === 'Rated';
      await db.update('quotes', id, { effective_date: x.policy.effective || today(), input: payload(x).input, ...(stale ? { status: 'Draft' as const, results: [] } : {}) });
      if (stale) { setStatus('Draft'); setResults([]); }
      await syncRisk(x);
      setSaving('saved');
    } catch (e) { setSaving('error'); toast(`Autosave failed: ${(e as Error).message}`, 'error'); }
  }, [ensureQuote, payload, status, toast, syncRisk]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(w), 700);
    return () => clearTimeout(t);
  }, [w, save]);

  // Leaving the page right after an edit still saves it.
  const latest = useRef({ w, save });
  latest.current = { w, save };
  useEffect(() => () => { if (dirty.current) void latest.current.save(latest.current.w); }, []);

  // ── Submit ──
  const submit = async (carriers: string[], saveBack: boolean, onProgress: (c: string, s: 'rating' | 'done') => void) => {
    if (locked) throw new Error(`This quote is ${status.toLowerCase()}.`);
    const use = autoCarriers.filter((c) => carriers.includes(c.name));
    if (!use.length) throw new Error('None of the selected carriers are available to rate Personal Auto. Check Carrier Quoting Setup.');
    // Visible per-carrier progress while the (instant) rater runs.
    for (const c of use) { onProgress(c.name, 'rating'); await new Promise((r) => setTimeout(r, 450 + Math.round(Math.random() * 450))); onProgress(c.name, 'done'); }
    const { results: rated, alt } = rateWorkflow(w, use, account.zip ?? '', autoNames);
    let next: Workflow = { ...w, submitted_at: new Date().toISOString(), alt_results: alt, rating: { ...w.rating, carriers: w.rating.carriers } };
    if (saveBack) {
      await riskChain.current.catch(() => {}); // let a running autosave finish writing drivers/vehicles first
      const ids = await syncAutoRisk(account.id, toAutoInput(next, account.zip ?? ''), { vehicle: () => true });
      next = { ...next, drivers: next.drivers.map((d) => ({ ...d, id: ids.get(d.key) ?? d.id })), vehicles: next.vehicles.map((v) => ({ ...v, id: ids.get(v.key) ?? v.id })) };
    }
    const primary = next.drivers.find((d) => d.primary);
    if (primary?.ssn_last4 && primary.ssn_last4 !== account.ssn_last4) await db.update('accounts', account.id, { ssn_last4: primary.ssn_last4 });
    const id = await ensureQuote(next);
    await db.update('quotes', id, { ...payload(next, { status: 'Rated' }), status: 'Rated', results: rated });
    dirty.current = false;
    setW(next);
    setResults(rated);
    setStatus('Rated');
    const quoted = rated.filter((r) => r.status === 'Quoted').length;
    await logActivity({ account_id: account.id, subject: `Personal Auto quote submitted to ${use.length} carrier${use.length > 1 ? 's' : ''}`, description: `${quoted} quoted${alt.length ? `, ${alt.length} alternate option${alt.length > 1 ? 's' : ''}` : ''}.`, assigned_to: me?.name ?? null }).catch(() => {});
    toast(`Quote successfully submitted to ${use.length} carrier${use.length > 1 ? 's' : ''}`);
    go('results');
  };

  useQuoteThemeDialogs();

  const ctx: Ctx = { w, up, issues, allIssues, account, autoCarriers, hidePrefilled, go };
  const stepStatus = (k: StepKey) => {
    if (k === 'review') return allIssues.length ? 'warn' : 'ok';
    return allIssues.some((i) => i.step === k) ? 'warn' : 'ok';
  };

  return (
    <WorkflowCtx.Provider value={ctx}>
      <IssuesCtx.Provider value={issues}>
      <div className="theme-quote -mx-5 -mt-4 flex min-h-[calc(var(--vh100)-104px)]">
        <ApplicantDrawer account={account} />
        <div className="flex-1 min-w-0 bg-[#f7f7f7]">
          <RecordTabs accountId={account.id} />
          <WorkflowHeader icon={Car} title="Auto" saving={saving} hidePrefilled={hidePrefilled} onTogglePrefilled={toggleHidePrefilled} />
          <div className="p-4">
            {locked && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">This quote is <b>{status}</b>{status === 'Bound' && initial?.selected_carrier ? ` with ${initial.selected_carrier}` : ''}. It is view only; start a new auto quote from the applicant to requote.</div>}
            {!locked && status === 'Draft' && w.submitted_at && view === 'review' && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">The quote changed after it was submitted. Submit it to carriers again for current results.</div>}
            {view !== 'submit' && view !== 'results' && <QuoteStepper steps={STEP_DEFS} view={view} status={(k) => stepStatus(k as StepKey)} visited={w.visited} onGo={go} />}
            <div className="bg-white/0">
              {view === 'rating' && <RatingStep />}
              {view === 'policy' && <PolicyStep />}
              {view === 'drivers' && <DriversStep />}
              {view === 'vehicles' && <VehiclesStep />}
              {view === 'incidents' && <IncidentsStep />}
              {view === 'coverage' && <CoverageStep />}
              {view === 'carrier' && <CarrierStep />}
              {view === 'review' && <ReviewStep />}
              {view === 'submit' && <SubmitView onSubmit={submit} />}
              {view === 'results' && (results.length
                ? <ResultsView quoteId={quoteId} results={results} alt={w.alt_results ?? []} />
                : <EmptyState title="No results yet" message="Submit the quote to carriers to see results." action={<Button onClick={() => go('review')}>Review quote</Button>} />)}
            </div>
          </div>
        </div>
      </div>
      </IssuesCtx.Provider>
    </WorkflowCtx.Provider>
  );
}
