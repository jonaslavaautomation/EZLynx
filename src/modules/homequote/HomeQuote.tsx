import { AlertTriangle, ClipboardList, FileText, Gauge, Home, Quote as QuoteIcon, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, LoadingBlock, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { today } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { navigate, useRoute } from '@/lib/router';
import type { Account, Property, Quote } from '@/lib/types';
import { useCarrierQuoting } from '@/modules/admin/integration';
import { IssuesCtx } from '@/modules/autoquote/fields';
import { ApplicantDrawer, QuoteStepper, RecordTabs, WorkflowHeader, useHidePrefilled, useQuoteThemeDialogs, useStepNav, type StepDef } from '@/modules/autoquote/shell';
import { saveRiskToAccount } from '@/modules/quotes/data';
import { useUserPreferences } from '@/modules/usersettings/data';
import { HomeCtxValue, type HomeCtx } from './ctx';
import { STEPS, applyPrefill, isView, newHomeWorkflow, toHomeInput, validate, type HomeWorkflow, type Rated, type StepKey, type View } from './model';
import { rateHomeWorkflow } from './rate';
import { ResultsView, SubmitView, ValidStep } from './review';
import { CarrierStep, CoverageStep, DwellingStep, EndorsementsStep, PolicyStep, RatingStep } from './steps';

/* Home quoting workflow: same stepper, drawer and autosave model as the auto workflow, for Homeowners. */

const STEP_ICONS: Record<StepKey, StepDef['icon']> = { rating: Gauge, policy: ClipboardList, dwelling: Home, coverage: ShieldCheck, endorsements: FileText, carrier: QuoteIcon, review: AlertTriangle };
const STEP_DEFS: StepDef[] = STEPS.map((s) => ({ key: s.key, label: s.label, icon: STEP_ICONS[s.key] }));

/** The part of the workflow that affects premiums (post-result notes like broker fees don't invalidate results). */
const ratingSig = (w: HomeWorkflow) => {
  const { broker_fees: _b, dismissed: _d, visited: _v, submitted_at: _s, ...rest } = w;
  void _b; void _d; void _v; void _s;
  return JSON.stringify(rest);
};

const createdHere = new Set<string>();

export function HomeQuoteRoute({ accountId, quoteId }: { accountId: string; quoteId: string | null }) {
  const [key, setKey] = useState(`${accountId}:${quoteId ?? 'new'}`);
  const last = useRef({ accountId, quoteId });
  useEffect(() => {
    const prev = last.current;
    if (quoteId === prev.quoteId && accountId === prev.accountId) return;
    last.current = { accountId, quoteId };
    if (accountId !== prev.accountId || !quoteId || !createdHere.has(quoteId)) setKey(`${accountId}:${quoteId ?? 'new'}:${Date.now()}`);
  }, [accountId, quoteId]);
  return <HomeQuote key={key} accountId={accountId} quoteId={quoteId} />;
}

function HomeQuote({ accountId, quoteId }: { accountId: string; quoteId: string | null }) {
  const account = useRow('accounts', accountId);
  const properties = useTable('properties', { eq: { account_id: accountId }, order: { column: 'created_at' } });
  const openedWith = useRef(quoteId).current;
  const [quote, setQuote] = useState<Quote | null | 'loading'>(openedWith ? 'loading' : null);
  useEffect(() => {
    if (!openedWith) return;
    let live = true;
    db.get('quotes', openedWith).then((q) => { if (live) setQuote(q ?? null); }).catch(() => live && setQuote(null));
    return () => { live = false; };
  }, [openedWith]);
  if (account.loading || quote === 'loading' || (properties.loading && !properties.data.length)) return <LoadingBlock label="Loading quote…" />;
  if (!account.data) return <EmptyState title="Applicant not found" message="It may have been deleted." action={<Button onClick={() => navigate('/accounts')}>Back to applicants</Button>} />;
  if (openedWith && !quote) return <EmptyState title="Quote not found" message="It may have been deleted." action={<Button onClick={() => navigate(`/accounts/${accountId}?tab=quotes`)}>Back to quotes</Button>} />;
  if (account.data.account_type === 'Commercial') return <EmptyState title="Personal lines only" message="This quoting workflow is for personal lines applicants. Use New Quote for commercial property." action={<Button onClick={() => navigate(`/quotes/new?account=${accountId}&line=BOP`)}>Commercial quote</Button>} />;
  const a = account.data;
  const property = properties.data.find((p) => a.address && p.address?.toLowerCase() === a.address.toLowerCase()) ?? properties.data[0] ?? null;
  return <Workspace account={a} property={property} initial={quote as Quote | null} />;
}

function Workspace({ account, property, initial }: { account: Account; property: Property | null; initial: Quote | null }) {
  const { appointedCarriers, me } = useAppData();
  const quoting = useCarrierQuoting();
  const prefs = useUserPreferences();
  const { toast } = useFeedback();
  const { params } = useRoute();
  const homeCarriers = useMemo(() => appointedCarriers.filter((c) => c.lines.includes('Homeowners') && (!quoting.active || quoting.isReady(c.name, 'Homeowners'))), [appointedCarriers, quoting]);
  const homeNames = useMemo(() => homeCarriers.map((c) => c.name), [homeCarriers]);

  const [w, setW] = useState<HomeWorkflow>(() => {
    const stored = (initial?.input as { workflow?: HomeWorkflow } | undefined)?.workflow;
    return stored?.kind === 'home' ? stored : newHomeWorkflow(account, property, homeNames, prefs.submit_all_home);
  });
  const [quoteId, setQuoteId] = useState<string | null>(initial?.id ?? null);
  const [results, setResults] = useState<Rated[]>((initial?.results ?? []) as Rated[]);
  const [status, setStatus] = useState(initial?.status ?? 'Draft');
  const locked = status === 'Bound' || status === 'Lost';
  const keep = useRef(Object.fromEntries(Object.entries(initial?.input ?? {}).filter(([k]) => ['bound_at', 'lost_reason', 'lost_notes', 'rated_at'].includes(k))));
  const ratedSig = useRef(initial?.status === 'Rated' ? ratingSig(w) : null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hidePrefilled, toggleHidePrefilled] = useHidePrefilled();
  const dirty = useRef(false);
  const creating = useRef<Promise<string> | null>(null);

  const seeded = useRef(!!initial);
  useEffect(() => {
    if (quoting.loading || !homeNames.length) return;
    setW((x) => {
      const carriers = x.rating.carriers.filter((c) => homeNames.includes(c));
      const seed = !seeded.current && prefs.submit_all_home && !carriers.length ? homeNames : carriers;
      return seed.length === x.rating.carriers.length && seed.every((c, i) => c === x.rating.carriers[i]) ? x : { ...x, rating: { ...x.rating, carriers: seed } };
    });
    seeded.current = true;
  }, [homeNames, prefs.submit_all_home, quoting.loading]);

  const up = useCallback((fn: (w: HomeWorkflow) => HomeWorkflow) => {
    if (locked) { toast(`This quote is ${status.toLowerCase()} and can't be changed. Start a new home quote to requote.`, 'info'); return; }
    dirty.current = true;
    setW((cur) => applyPrefill(fn(cur), homeNames));
  }, [homeNames, locked, status, toast]);

  const asked: View = isView(params.get('step')) ? (params.get('step') as View) : initial?.status === 'Rated' || locked ? 'results' : 'rating';
  const view: View = locked ? 'results' : asked;
  const allIssues = useMemo(() => validate(w, homeNames), [w, homeNames]);
  const issues = useMemo(() => { const m = new Map<string, string>(); for (const i of allIssues) if (!m.has(i.field)) m.set(i.field, i.message); return m; }, [allIssues]);

  useEffect(() => {
    if (STEPS.some((s) => s.key === view) && !w.visited.includes(view as StepKey)) setW((x) => ({ ...x, visited: [...x.visited, view as StepKey] }));
  }, [view, w.visited]);

  const go = useStepNav(view);
  useQuoteThemeDialogs();

  const payload = useCallback((x: HomeWorkflow, extra?: Partial<Quote>) => ({
    account_id: account.id, line_of_business: 'Homeowners' as const, effective_date: x.policy.effective || today(),
    input: { ...keep.current, v: 1, carriers: x.rating.carriers, home: toHomeInput(x, account, property?.id ?? null), workflow: x, ...(extra?.status === 'Rated' ? { rated_at: new Date().toISOString() } : {}) },
    ...extra,
  }), [account, property]);

  const ensureQuote = useCallback(async (x: HomeWorkflow) => {
    if (quoteId) return quoteId;
    creating.current ??= db.insert('quotes', { ...payload(x), status: 'Draft', results: [], selected_carrier: null, selected_premium: null, policy_id: null }).then((q) => {
      setQuoteId(q.id);
      createdHere.add(q.id);
      const p = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      navigate(`/accounts/${account.id}/home-quote/${q.id}${p.toString() ? `?${p}` : ''}`, { replace: true });
      return q.id;
    }, (e) => { creating.current = null; throw e; });
    return creating.current;
  }, [quoteId, payload, account.id]);

  const save = useCallback(async (x: HomeWorkflow) => {
    dirty.current = false;
    setSaving('saving');
    try {
      const id = await ensureQuote(x);
      // Results describe the quote as submitted: a change that affects premiums means requesting them again.
      const stale = status === 'Rated' && ratedSig.current !== ratingSig(x);
      await db.update('quotes', id, { effective_date: x.policy.effective || today(), input: payload(x).input, ...(stale ? { status: 'Draft' as const, results: [] } : {}) });
      if (stale) { setStatus('Draft'); setResults([]); ratedSig.current = null; }
      setSaving('saved');
    } catch (e) { setSaving('error'); toast(`Autosave failed: ${(e as Error).message}`, 'error'); }
  }, [ensureQuote, payload, status, toast]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(w), 700);
    return () => clearTimeout(t);
  }, [w, save]);
  const latest = useRef({ w, save });
  latest.current = { w, save };
  useEffect(() => () => { if (dirty.current) void latest.current.save(latest.current.w); }, []);

  const submit = async (carriers: string[], saveBack: boolean, onProgress: (c: string, s: 'rating' | 'done') => void) => {
    if (locked) throw new Error(`This quote is ${status.toLowerCase()}.`);
    const use = homeCarriers.filter((c) => carriers.includes(c.name));
    if (!use.length) throw new Error('None of the selected carriers are available to rate Homeowners. Check Carrier Quoting Setup.');
    for (const c of use) { onProgress(c.name, 'rating'); await new Promise((r) => setTimeout(r, 450 + Math.round(Math.random() * 450))); onProgress(c.name, 'done'); }
    const rated = rateHomeWorkflow(w, use, account, homeNames);
    const next: HomeWorkflow = { ...w, submitted_at: new Date().toISOString() };
    if (saveBack) await saveRiskToAccount(account.id, 'Homeowners', { v: 1, carriers, home: toHomeInput(next, account, property?.id ?? null) });
    const id = await ensureQuote(next);
    await db.update('quotes', id, { ...payload(next, { status: 'Rated' }), status: 'Rated', results: rated });
    dirty.current = false;
    ratedSig.current = ratingSig(next);
    setW(next);
    setResults(rated);
    setStatus('Rated');
    const quoted = rated.filter((r) => r.status === 'Quoted').length;
    await logActivity({ account_id: account.id, subject: `Homeowners quote submitted to ${use.length} carrier${use.length > 1 ? 's' : ''}`, description: `${quoted} quoted.`, assigned_to: me?.name ?? null }).catch(() => {});
    toast(`Quote successfully submitted to ${use.length} carrier${use.length > 1 ? 's' : ''}`);
    go('results');
  };

  const ctx: HomeCtx = { w, up, issues, allIssues, account, property, homeCarriers, hidePrefilled, go };
  const stepStatus = (k: string) => (k === 'review' ? (allIssues.length ? 'warn' : 'ok') : allIssues.some((i) => i.step === k) ? 'warn' : 'ok');

  return (
    <HomeCtxValue.Provider value={ctx}>
      <IssuesCtx.Provider value={issues}>
        <div className="theme-quote -mx-5 -mt-4 flex min-h-[calc(var(--vh100)-104px)]">
          <ApplicantDrawer account={account} />
          <div className="flex-1 min-w-0 bg-[#f7f7f7]">
            <RecordTabs accountId={account.id} />
            <WorkflowHeader icon={Home} title="Home" saving={saving} hidePrefilled={hidePrefilled} onTogglePrefilled={toggleHidePrefilled} />
            <div className="p-4">
              {locked && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">This quote is <b>{status}</b>{status === 'Bound' && initial?.selected_carrier ? ` with ${initial.selected_carrier}` : ''}. It is view only; start a new home quote from the applicant to requote.</div>}
              {!locked && status === 'Draft' && w.submitted_at && view === 'review' && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">The quote changed after it was submitted. Submit it to carriers again for current results.</div>}
              {view !== 'submit' && view !== 'results' && <QuoteStepper steps={STEP_DEFS} view={view} status={stepStatus} visited={w.visited} onGo={go} />}
              {view === 'rating' && <RatingStep />}
              {view === 'policy' && <PolicyStep />}
              {view === 'dwelling' && <DwellingStep />}
              {view === 'coverage' && <CoverageStep />}
              {view === 'endorsements' && <EndorsementsStep />}
              {view === 'carrier' && <CarrierStep />}
              {view === 'review' && <ValidStep />}
              {view === 'submit' && <SubmitView onSubmit={submit} />}
              {view === 'results' && (results.length
                ? <ResultsView quoteId={quoteId} results={results} />
                : <EmptyState title="No results yet" message="Submit the quote to carriers to see results." action={<Button onClick={() => go('review')}>Review quote</Button>} />)}
            </div>
          </div>
        </div>
      </IssuesCtx.Provider>
    </HomeCtxValue.Provider>
  );
}
