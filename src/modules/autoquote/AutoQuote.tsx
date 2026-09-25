import {
  AlertTriangle, Briefcase, Car, Check, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, FileText, Gauge, IdCard, Loader2, Mail, MessageSquare, Plug,
  Quote as QuoteIcon, Share2, ShieldCheck, Siren, Star, User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, LoadingBlock, Modal, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtDate, fmtPhone, today } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import type { Account, CarrierRate, Quote } from '@/lib/types';
import { useCarrierQuoting } from '@/modules/admin/integration';
import { saveRiskToAccount } from '@/modules/quotes/data';
import { useUserPreferences } from '@/modules/usersettings/data';
import { WorkflowCtx, useWf, type Ctx } from './fields';
import { STEPS, isView, newWorkflow, toAutoInput, validate, type StepKey, type View, type Workflow } from './model';
import { rateWorkflow } from './rate';
import { ResultsView, ReviewStep, SubmitView } from './review';
import { DriversStep, PolicyStep, RatingStep, applyPrefill } from './steps-a';
import { CarrierStep, CoverageStep, IncidentsStep, VehiclesStep } from './steps-b';

/* Auto quoting workflow: stepper over the applicant record, autosaved as a Draft quote, submitted to carriers for results. */

const STEP_ICONS: Record<StepKey, typeof Gauge> = { rating: Gauge, policy: ClipboardList, drivers: User, vehicles: Car, incidents: Siren, coverage: ShieldCheck, carrier: QuoteIcon, review: AlertTriangle };
const DRAWER_KEY = 'northstar-ams:aq-drawer';
const HIDE_KEY = 'northstar-ams:aq-hide-prefilled';
const FAV_KEY = 'northstar-ams:favorite-accounts';
const readLs = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLs = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

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
  const [hidePrefilled, setHidePrefilled] = useState(readLs(HIDE_KEY) !== '0');
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

  const pendingFocus = useRef<string | null>(null);
  const go = useCallback((to: string, field?: string) => {
    pendingFocus.current = field ?? null;
    setParam('step', to);
    if (!field) window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const field = pendingFocus.current;
    if (!field) return;
    pendingFocus.current = null;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
      el.classList.add('aq-flash');
      setTimeout(() => el.classList.remove('aq-flash'), 1600);
    }, 60);
    return () => clearTimeout(t);
  }, [view]);

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

  const save = useCallback(async (x: Workflow) => {
    dirty.current = false;
    setSaving('saving');
    try {
      const id = await ensureQuote(x);
      // Carrier results describe the quote as submitted; once it changes they must be requested again.
      const stale = status === 'Rated';
      await db.update('quotes', id, { effective_date: x.policy.effective || today(), input: payload(x).input, ...(stale ? { status: 'Draft' as const, results: [] } : {}) });
      if (stale) { setStatus('Draft'); setResults([]); }
      setSaving('saved');
    } catch (e) { setSaving('error'); toast(`Autosave failed: ${(e as Error).message}`, 'error'); }
  }, [ensureQuote, payload, status, toast]);

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
      const saved = await saveRiskToAccount(account.id, 'Personal Auto', { v: 1, carriers, auto: toAutoInput(next, account.zip ?? '') });
      const ids = new Map([...(saved.input.auto?.drivers ?? []), ...(saved.input.auto?.vehicles ?? [])].map((r) => [r.key, r.id]));
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

  // Dialogs render in a portal: give them the workflow's teal theme while it's open.
  useEffect(() => { document.body.classList.add('theme-quote-dialogs'); return () => document.body.classList.remove('theme-quote-dialogs'); }, []);

  const ctx: Ctx = { w, up, issues, allIssues, account, autoCarriers, hidePrefilled, go };
  const stepStatus = (k: StepKey) => {
    if (k === 'review') return allIssues.length ? 'warn' : 'ok';
    return allIssues.some((i) => i.step === k) ? 'warn' : 'ok';
  };

  return (
    <WorkflowCtx.Provider value={ctx}>
      <div className="theme-quote -mx-5 -mt-4 flex min-h-[calc(var(--vh100)-104px)]">
        <ApplicantDrawer account={account} />
        <div className="flex-1 min-w-0 bg-[#f7f7f7]">
          <RecordTabs accountId={account.id} />
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#f0eded] border-b border-ink-200">
            <Car size={28} className="text-ink-500" />
            <h1 className="text-[19px] text-ink-900">Auto</h1>
            <span className="text-[11px] text-ink-400 ml-2" aria-live="polite">
              {saving === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span> : saving === 'saved' ? 'Draft saved' : saving === 'error' ? 'Not saved' : ''}
            </span>
            <div className="flex-1" />
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-800 cursor-pointer">
              <button type="button" role="switch" aria-checked={hidePrefilled} aria-label="Hide Prefilled Answers" onClick={() => { setHidePrefilled(!hidePrefilled); writeLs(HIDE_KEY, hidePrefilled ? '0' : '1'); }}
                className={cx('relative w-8 h-4 rounded-full transition-colors', hidePrefilled ? 'bg-[#ce93d8]' : 'bg-ink-300')}>
                <span className={cx('absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-sm grid place-items-center shadow transition-all', hidePrefilled ? 'left-[14px] bg-[#7b1fa2] text-white' : 'left-[-2px] bg-ink-500')}>{hidePrefilled && <Check size={12} strokeWidth={3} />}</span>
              </button>
              Hide Prefilled Answers
            </label>
          </div>
          <div className="p-4">
            {locked && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">This quote is <b>{status}</b>{status === 'Bound' && initial?.selected_carrier ? ` with ${initial.selected_carrier}` : ''}. It is view only; start a new auto quote from the applicant to requote.</div>}
            {!locked && status === 'Draft' && w.submitted_at && view === 'review' && <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">The quote changed after it was submitted. Submit it to carriers again for current results.</div>}
            {view !== 'submit' && view !== 'results' && <Stepper view={view} status={stepStatus} visited={w.visited} />}
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
    </WorkflowCtx.Provider>
  );
}

function Stepper({ view, status, visited }: { view: View; status: (k: StepKey) => 'ok' | 'warn'; visited: StepKey[] }) {
  const { go } = useWf();
  return (
    <nav aria-label="Quote steps" className="bg-white border border-ink-200 rounded shadow-card px-2 sm:px-6 py-3 mb-5 overflow-x-auto">
      <ol className="relative flex justify-between min-w-[720px]">
        <span className="absolute left-10 right-10 top-[22px] h-px bg-ink-200" aria-hidden />
        {STEPS.map((s) => {
          const Icon = s.key === 'review' && status('review') === 'ok' ? Check : STEP_ICONS[s.key];
          const active = view === s.key;
          const st = status(s.key);
          const last = s.key === 'review';
          const label = last ? (st === 'ok' ? 'Valid' : 'Invalid') : s.label;
          return (
            <li key={s.key} className="relative z-10 flex flex-col items-center w-24">
              <button type="button" onClick={() => go(s.key)} aria-current={active ? 'step' : undefined} aria-label={label}
                className={cx('relative w-11 h-11 rounded-full grid place-items-center text-white transition-colors',
                  last ? (st === 'ok' ? 'bg-[#00875a]' : 'bg-[#f5a623]') : active ? 'bg-brand-600' : 'bg-[#78909c] hover:bg-[#607d8b]')}>
                <Icon size={20} />
                {!active && !last && (visited.includes(s.key) || st === 'warn') && (
                  <span className={cx('absolute -top-1 -right-1 w-[18px] h-[18px] grid place-items-center', st === 'ok' && 'rounded-full border-2 border-white bg-[#00875a]')}>
                    {st === 'ok' ? <Check size={10} strokeWidth={3} /> : <AlertTriangle size={17} className="text-white fill-[#f5a623] drop-shadow" strokeWidth={2.2} />}
                  </span>
                )}
              </button>
              <span className={cx('mt-2 text-[12px] font-medium text-center', active ? 'text-ink-900' : 'text-ink-700')}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RecordTabs({ accountId }: { accountId: string }) {
  const tabs: [string, string][] = [
    ['Overview', ''], ['Policies', 'policies'], ['Details', 'household'], ['Quotes', 'quotes'], ['Lead Info', 'overview'],
    ['Documents', 'documents'], ['Certificates', 'certificates'], ['Activity', 'activities'], ['Invoices', 'billing'],
  ];
  return (
    <div className="flex gap-0 overflow-x-auto bg-white border-b border-ink-200 px-2">
      {tabs.map(([label, tab]) => {
        const to = tab === 'certificates' ? '/policy-mgmt/acord' : `/accounts/${accountId}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`;
        const active = label === 'Quotes';
        return (
          <a key={label} href={href(to)} className={cx('px-4 py-2.5 text-[12.5px] font-semibold tracking-wide whitespace-nowrap border-b-2', active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-600 hover:text-ink-900')}>{label}</a>
        );
      })}
    </div>
  );
}

// ── Applicant drawer ──

const RESEARCH: { key: string; label: string; url: (q: string, a: Account) => string; embed?: boolean }[] = [
  { key: 'map', label: 'Map', url: (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`, embed: true },
  { key: 'zillow', label: 'Zillow', url: (q) => `https://www.zillow.com/homes/${encodeURIComponent(q)}_rb/` },
  { key: 'earth', label: 'Google Earth', url: (q) => `https://earth.google.com/web/search/${encodeURIComponent(q)}` },
  { key: 'search', label: 'Google Search', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { key: 'assessor', label: 'County Assessor', url: (_q, a) => `https://www.google.com/search?q=${encodeURIComponent(`${a.city ?? ''} ${a.state ?? ''} county assessor property search`)}` },
];

function ApplicantDrawer({ account: a }: { account: Account }) {
  const [open, setOpen] = useState(readLs(DRAWER_KEY) !== '0');
  const [research, setResearch] = useState<(typeof RESEARCH)[number] | null>(null);
  const properties = useTable('properties', { eq: { account_id: a.id } });
  const [fav, setFav] = useState(() => (readLs(FAV_KEY) ?? '').split(',').includes(a.id));
  const { settings } = useAppData();
  const { toast } = useFeedback();
  const quotes = useTable('quotes', { eq: { account_id: a.id } });
  const openQuotes = quotes.data.filter((q) => q.status === 'Draft' || q.status === 'Rated').length;
  const addr = [a.address, a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const toggle = () => { setOpen(!open); writeLs(DRAWER_KEY, open ? '0' : '1'); };
  const toggleFav = () => {
    const list = (readLs(FAV_KEY) ?? '').split(',').filter(Boolean);
    const next = fav ? list.filter((x) => x !== a.id) : [...list, a.id];
    writeLs(FAV_KEY, next.join(','));
    setFav(!fav);
    toast(fav ? 'Removed from favorites' : 'Added to favorites', 'info');
  };
  const share = () => navigator.clipboard?.writeText(window.location.href).then(() => toast('Link copied', 'info'), () => toast('Copy failed', 'error'));
  const icons = (
    <>
      <button type="button" aria-label={fav ? 'Remove favorite' : 'Add favorite'} onClick={toggleFav}><Star size={18} className={fav ? 'text-amber-400 fill-amber-400' : 'text-amber-400'} /></button>
      <a aria-label="Email" href={`mailto:${a.email}`}><Mail size={18} /></a>
      <a aria-label="Text message" href={href(`/accounts/${a.id}?tab=messages`)}><MessageSquare size={18} /></a>
      <a aria-label="Documents" href={href(`/accounts/${a.id}?tab=documents`)}><FileText size={18} /></a>
      <a aria-label="Edit applicant" href={href(`/accounts/${a.id}/edit`)}><IdCard size={18} /></a>
      <a aria-label="Quotes" href={href(`/accounts/${a.id}?tab=quotes`)} className="relative"><Briefcase size={18} />{openQuotes > 0 && <span className="absolute -top-2 -right-2 min-w-[15px] h-[15px] rounded-full bg-purple-600 text-white text-[9px] grid place-items-center px-0.5">{openQuotes}</span>}</a>
      <button type="button" aria-label="Copy link" onClick={share}><Share2 size={18} /></button>
    </>
  );
  if (!open) {
    return (
      <aside className="w-[34px] shrink-0 bg-white border-r border-ink-200 flex flex-col items-center py-3 text-ink-800">
        <div className="text-[14px] font-semibold text-brand-700 [writing-mode:vertical-rl] rotate-180 mb-6 whitespace-nowrap">{accountName(a)}</div>
        <div className="flex flex-col items-center gap-4 mt-auto mb-4">{icons}</div>
        <button type="button" aria-label="Expand applicant panel" onClick={toggle} className="text-ink-600 hover:text-ink-900"><ChevronRight size={16} /></button>
      </aside>
    );
  }
  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-ink-200 px-3 py-3 text-[11.5px] text-ink-800 flex flex-col">
      <a href={href(`/accounts/${a.id}`)} className="text-[18px] font-semibold text-brand-700 hover:underline leading-tight">{accountName(a)}</a>
      <div className="grid grid-cols-4 gap-3 mt-3 text-ink-800 place-items-start">{icons}</div>
      <dl className="mt-4 space-y-0.5">
        <div><dt className="inline font-semibold">Type: </dt><dd className="inline">{a.status ?? 'Unknown'}</dd></div>
        <div><dt className="inline font-semibold">Since: </dt><dd className="inline">{fmtDate(a.customer_since ?? a.created_at)}</dd></div>
        <div><dt className="inline font-semibold">Assigned Producer: </dt><dd className="inline">{a.producer ?? 'Unassigned'}</dd></div>
        <div><dt className="inline font-semibold">CSR: </dt><dd className="inline">{a.csr ?? 'Unassigned'}</dd></div>
        <div><dt className="inline font-semibold">Agency: </dt><dd className="inline">{settings?.name ?? '—'}</dd></div>
      </dl>
      <div className="mt-4">
        <div className="text-[13px] font-semibold text-ink-900">Address</div>
        {addr ? <div className="mt-0.5 leading-snug">{a.address}<br />{[a.city?.toUpperCase(), [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div> : <div className="text-ink-400">No address on file</div>}
        {addr && (
          <div className="mt-2 flex flex-col gap-2">
            {RESEARCH.map((r) => <button key={r.key} type="button" onClick={() => setResearch(r)} className="text-left text-brand-700 hover:underline inline-flex items-center gap-1">{r.label} <ExternalLink size={11} /></button>)}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-[13px] font-semibold text-ink-900">Applicant</div>
        <div>{a.first_name} {a.last_name}</div>
        <a href={`mailto:${a.email}`} className="text-brand-700 hover:underline break-all">{a.email}</a>
        {(a.mobile_phone || a.phone) && <div><span className="font-semibold">{a.mobile_phone ? 'Mobile' : 'Phone'}:</span> <a href={`tel:${a.mobile_phone || a.phone}`} className="text-brand-700 hover:underline">{fmtPhone(a.mobile_phone || a.phone)}</a></div>}
      </div>
      <div className="mt-4">
        <div className="text-[13px] font-semibold text-ink-900">Connected Apps</div>
        <div className="text-ink-600">Quickly access integrations related to this applicant.</div>
        <a href={href('/marketplace/mine')} className="mt-2 flex items-center justify-center gap-1.5 h-8 rounded border border-ink-300 text-brand-700 font-semibold hover:bg-brand-50"><Plug size={13} /> Integrations</a>
      </div>
      <button type="button" aria-label="Collapse applicant panel" onClick={toggle} className="mt-auto self-end pt-4 text-ink-600 hover:text-ink-900"><ChevronLeft size={16} /></button>
      {research && (() => {
        // Most research sites refuse to load inside another page, so the preview shows the map and the property on
        // file, and the button opens the site itself in a new tab.
        const home = properties.data.find((p) => p.address && addr.toLowerCase().includes(p.address.toLowerCase())) ?? properties.data[0];
        const site = research.key === 'map' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : research.url(addr, a);
        const facts: [string, string | number | null | undefined][] = home ? [
          ['Year built', home.year_built], ['Square feet', home.square_feet?.toLocaleString('en-US')], ['Construction', home.construction],
          ['Roof', [home.roof_type, home.roof_year].filter(Boolean).join(', ')], ['Protection class', home.protection_class], ['Dwelling value', home.dwelling_value ? `$${Number(home.dwelling_value).toLocaleString('en-US')}` : null],
        ] : [];
        return (
          <Modal title={research.label} subtitle={addr} size="lg" onClose={() => setResearch(null)} footer={<>
            <a href={site} target="_blank" rel="noopener noreferrer" className="mr-auto"><Button variant="primary" icon={<ExternalLink size={14} />}>Open {research.label === 'Map' ? 'Google Maps' : research.label}</Button></a>
            <Button onClick={() => setResearch(null)}>Close</Button>
          </>}>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-4">
              <iframe title={`Map of ${addr}`} src={RESEARCH[0].url(addr, a)} className="w-full h-[380px] rounded border border-ink-200" loading="lazy" referrerPolicy="no-referrer" />
              <div className="text-[13px]">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Property on file</div>
                {facts.length ? (
                  <dl className="space-y-1">{facts.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-ink-500">{k}</dt><dd className="text-ink-900 text-right">{v || '—'}</dd></div>)}</dl>
                ) : <p className="text-ink-500">No property details on file for this applicant. Add them under Details.</p>}
                <p className="text-[11.5px] text-ink-400 mt-4">{research.key === 'map' ? 'Street map from Google Maps.' : `${research.label} opens in a new tab with this address.`}</p>
              </div>
            </div>
          </Modal>
        );
      })()}
    </aside>
  );
}
