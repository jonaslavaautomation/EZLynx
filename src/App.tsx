import { Database, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Layout, type QuickAddKind } from '@/components/Layout';
import { Logo } from '@/components/Logo';
import { Button, EmptyState, ErrorBanner, FeedbackProvider } from '@/components/ui';
import { AppDataProvider } from '@/lib/app-context';
import { db, initDb, type DbMode } from '@/lib/db';
import { navigate, useRoute } from '@/lib/router';
import { loadSampleData, startEmpty, topUpLocalSample } from '@/lib/seed';
import { AccountDetail, AccountsPage } from '@/modules/accounts';
import { CreateApplicant } from '@/modules/accounts/CreateApplicant';
import { AccountingPage } from '@/modules/accounting';
import { ActivitiesPage, ActivityFormModal } from '@/modules/activities';
import { ClaimDetail, ClaimFormModal, ClaimsPage } from '@/modules/claims';
import { Dashboard } from '@/modules/dashboard/Dashboard';
import { DocumentsPage } from '@/modules/documents';
import { HelpPage } from '@/modules/help';
import { AdminRoutes } from '@/modules/admin';
import { CommRoutes } from '@/modules/comm';
import { MarketplaceRoutes } from '@/modules/marketplace';
import { SupportRoutes } from '@/modules/support';
import { PolicyMgmtRoutes } from '@/modules/policymgmt';
import { MessagesPage } from '@/modules/messages';
import { PoliciesPage, PolicyDetail, PolicyFormModal } from '@/modules/policies';
import { QuoteDetail, QuotesPage, QuoteWizard } from '@/modules/quotes';
import { ReportsPage } from '@/modules/reports';
import { SettingsPage } from '@/modules/settings';

// Runs once per page load (StrictMode mounts effects twice; seeding must not run twice).
let bootOnce: Promise<Boot> | null = null;
function bootApp(): Promise<Boot> {
  bootOnce ??= (async (): Promise<Boot> => {
    try {
      const mode = await initDb();
      const settings = await db.list('agency_settings', { limit: 1 });
      if (settings.length) {
        if (mode === 'local') await topUpLocalSample().catch(() => { /* sample top-up is best effort */ });
        return { state: 'ready', mode };
      }
      // Browser-storage demo: seed silently so the portal is usable immediately.
      if (mode === 'local') { await loadSampleData(); return { state: 'ready', mode }; }
      return { state: 'onboarding', mode };
    } catch (e) {
      return { state: 'error', message: (e as Error).message };
    }
  })();
  return bootOnce;
}

type Boot = { state: 'loading' } | { state: 'onboarding'; mode: DbMode } | { state: 'ready'; mode: DbMode } | { state: 'error'; message: string };

function Routes() {
  const { segments, params } = useRoute();
  const [section, id] = segments;
  let page: ReactNode;
  switch (section) {
    case undefined: page = <Dashboard />; break;
    case 'accounts': page = id === 'new' ? <CreateApplicant type={params.get('type') === 'Commercial' ? 'Commercial' : 'Personal'} /> : id ? <AccountDetail id={id} /> : <AccountsPage />; break;
    case 'policies': page = id ? <PolicyDetail id={id} /> : <PoliciesPage />; break;
    case 'quotes': page = id === 'new' ? <QuoteWizard accountId={params.get('account')} line={params.get('line')} /> : id ? <QuoteDetail id={id} /> : <QuotesPage />; break;
    case 'activities': page = <ActivitiesPage />; break;
    case 'claims': page = id ? <ClaimDetail id={id} /> : <ClaimsPage />; break;
    case 'messages': page = <MessagesPage accountId={params.get('account')} />; break;
    case 'documents': page = <DocumentsPage />; break;
    case 'accounting': page = <AccountingPage />; break;
    case 'reports': page = <ReportsPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'help': page = <HelpPage />; break;
    case 'policy-mgmt': page = <PolicyMgmtRoutes segments={segments.slice(1)} />; break;
    case 'comm': page = <CommRoutes segments={segments.slice(1)} />; break;
    case 'admin': page = <AdminRoutes segments={segments.slice(1)} />; break;
    case 'support': page = <SupportRoutes segments={segments.slice(1)} />; break;
    case 'marketplace': page = <MarketplaceRoutes segments={segments.slice(1)} />; break;
    default: page = <EmptyState title="Page not found" message="That page doesn't exist." action={<Button onClick={() => navigate('/')}>Go to Workspace</Button>} />;
  }
  // Remount per path so page-local state (filters, wizards) resets between records.
  return <div key={segments.slice(0, 2).join('/')}>{page}</div>;
}

function Shell() {
  const [quick, setQuick] = useState<QuickAddKind | null>(null);
  const onQuickAdd = (k: QuickAddKind) => {
    if (k === 'quote') return navigate('/quotes/new');
    if (k === 'account' || k === 'commercial') return navigate(`/accounts/new?type=${k === 'commercial' ? 'Commercial' : 'Personal'}`);
    if (k === 'message') return navigate('/messages?compose=1');
    setQuick(k);
  };
  const close = () => setQuick(null);
  return (
    <Layout onQuickAdd={onQuickAdd}>
      <Routes />
      {quick === 'policy' && <PolicyFormModal accountId={null} onClose={close} onSaved={(p) => navigate(`/policies/${p.id}`)} />}
      {quick === 'activity' && <ActivityFormModal onClose={close} />}
      {quick === 'claim' && <ClaimFormModal onClose={close} />}
    </Layout>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); onDone(); } catch (e) { setError((e as Error).message); setBusy(null); }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-[#f8f6f6] p-4">
      <div className="w-full max-w-lg bg-white rounded-md shadow-pop border border-ink-100 p-7">
        <Logo size={44} className="mb-4" />
        <h1 className="text-xl font-semibold text-ink-900">Welcome to Northstar AMS</h1>
        <p className="text-[13px] text-ink-500 mt-1.5">Your Supabase database is connected and the AMS schema is in place, but it has no agency set up yet. How would you like to start?</p>
        <div className="mt-5 space-y-2.5">
          <ErrorBanner message={error} />
          <button disabled={!!busy} onClick={() => { setBusy('Loading sample agency…'); run(() => loadSampleData(setBusy)); }} className="w-full text-left flex gap-3 items-start border border-brand-200 bg-brand-50 hover:bg-brand-100 rounded p-3.5 disabled:opacity-60">
            <Sparkles size={18} className="text-brand-600 mt-0.5 shrink-0" />
            <span><span className="block text-[13px] font-semibold text-ink-900">Load a sample agency</span><span className="block text-xs text-ink-500">~40 demo accounts with policies, renewals, tasks, claims, messages and invoices. Good for exploring.</span></span>
          </button>
          <button disabled={!!busy} onClick={() => { setBusy('Setting up…'); run(startEmpty); }} className="w-full text-left flex gap-3 items-start border border-ink-200 hover:bg-ink-50 rounded p-3.5 disabled:opacity-60">
            <Database size={18} className="text-ink-500 mt-0.5 shrink-0" />
            <span><span className="block text-[13px] font-semibold text-ink-900">Start with an empty agency</span><span className="block text-xs text-ink-500">Creates your agency profile, one admin user and a starter carrier list. Your existing accounts are kept.</span></span>
          </button>
        </div>
        {busy && <div className="flex items-center gap-2 text-[13px] text-ink-500 mt-4"><Loader2 size={15} className="animate-spin text-brand-500" />{busy}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    bootApp().then((b) => { if (live) setBoot(b); });
    return () => { live = false; };
  }, []);

  if (boot.state === 'loading') {
    return <div className="min-h-screen grid place-items-center bg-[#f8f6f6]"><div className="flex flex-col items-center gap-3 text-[13px] text-ink-500"><Logo size={48} /><span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-brand-500" /> Loading your agency…</span></div></div>;
  }
  if (boot.state === 'error') {
    return <div className="min-h-screen grid place-items-center p-4"><div className="max-w-md w-full"><ErrorBanner message={`Could not start: ${boot.message}`} /></div></div>;
  }
  if (boot.state === 'onboarding') return <FeedbackProvider><Onboarding onDone={() => setBoot({ state: 'ready', mode: boot.mode })} /></FeedbackProvider>;

  return (
    <FeedbackProvider>
      <AppDataProvider>
        <Shell />
      </AppDataProvider>
    </FeedbackProvider>
  );
}
