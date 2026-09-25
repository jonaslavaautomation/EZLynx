import { BarChart3, BookOpenText, Folder, Gift, HelpCircle, LayoutDashboard, Network, Plug, Settings, SquareUser, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { cx } from '@/components/ui';
import { accountName } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { getRecentAccountIds, onRecentChange } from '@/lib/recent';
import { appZoom } from '@/lib/zoom';
import { href, navigate, useRoute } from '@/lib/router';
import type { Account, AccountContact, Driver, LineOfBusiness, Quote } from '@/lib/types';

/*
 * Icon rail + hover flyout menus, laid out like the navigation agency staff are trained on:
 * hover (or click/tap) an icon to open its menu; every entry links to a working screen.
 */

type Link = { label: string; to: string };
/** `chat` renders the Support flyout's "? Chat" button next to the section header. */
type Section = { title: string; links: Link[]; empty?: string; action?: 'chat' };

/** Opens the support chat panel (mounted once in the app shell by the Support module). */
export const OPEN_CHAT_EVENT = 'northstar:open-support-chat';
type MenuKey = 'dashboard' | 'applicants' | 'policy' | 'communication' | 'reports' | 'settings' | 'help' | 'marketplace' | 'updates';

/** Bump when the What's New page gets new entries; shows the badge until the user opens it. */
export const UPDATES_VERSION = '2026-09-24';
const UPDATES_KEY = 'northstar-ams:seen-updates';

const LINE_SHORT: Partial<Record<LineOfBusiness, string>> = {
  'Personal Auto': 'Auto', Homeowners: 'Home', 'Dwelling Fire': 'Dwelling', 'Commercial Auto': 'Comm Auto', 'General Liability': 'GL',
  'Workers Comp': 'WC', 'Commercial Property': 'Comm Property',
};

const MENU: { key: MenuKey; label: string; icon: LucideIcon; paths: string[] }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, paths: ['/'] },
  { key: 'applicants', label: 'Applicants', icon: SquareUser, paths: ['/accounts', '/quotes'] },
  { key: 'policy', label: 'Policy & Commissions', icon: Folder, paths: ['/policy-mgmt', '/policies', '/activities', '/claims', '/accounting', '/documents'] },
  { key: 'communication', label: 'Communication Center', icon: Network, paths: ['/comm', '/messages'] },
  { key: 'reports', label: 'Reports', icon: BarChart3, paths: ['/reports'] },
  { key: 'settings', label: 'Settings', icon: Settings, paths: ['/admin', '/settings'] },
  { key: 'help', label: 'Support', icon: BookOpenText, paths: ['/support', '/help'] },
  { key: 'marketplace', label: 'Marketplace', icon: Plug, paths: ['/marketplace'] },
  { key: 'updates', label: "What's New", icon: Gift, paths: ['/whats-new'] },
];

const STATIC: Partial<Record<MenuKey, Section[]>> = {
  dashboard: [{
    title: 'Dashboard',
    links: [
      { label: 'Home Page', to: '/' },
      { label: 'Agency Activity', to: '/activities?view=all' },
      { label: 'Agency Tasks', to: '/activities' },
      { label: 'Agency Performance', to: '/reports?report=production' },
      { label: 'Directory', to: '/settings?tab=users' },
    ],
  }],
  // Policy management: transaction history, rewrites (replacing a policy with a new one), claim payments and
  // reserves, and ACORD forms. Commissions: carrier statements are entered and reconciled, then split among the
  // Service Team (the producers/CSRs who are paid or tracked) according to Service Team Rules.
  policy: [
    { title: 'Policy Mgmt', links: [
      { label: 'Policy Transactions', to: '/policy-mgmt/transactions' },
      { label: 'Policy Rewrites', to: '/policy-mgmt/rewrites' },
      { label: 'Claim Transactions', to: '/policy-mgmt/claim-transactions' },
      { label: 'ACORD Library', to: '/policy-mgmt/acord' },
    ] },
    { title: 'Commissions', links: [
      { label: 'Statements', to: '/policy-mgmt/statements' },
      { label: 'Service Team Rules', to: '/policy-mgmt/rules' },
      { label: 'Manage Service Team', to: '/policy-mgmt/team' },
      { label: 'Reports', to: '/reports?category=commission' },
    ] },
    // Not in the reference menu; keeps the agency-wide lists one hover away.
    { title: 'Workspace', links: [
      { label: 'All Policies', to: '/policies' },
      { label: 'Renewals Queue', to: '/policies?view=renewals' },
      { label: 'Activities & Tasks', to: '/activities' },
      { label: 'Claims', to: '/claims' },
      { label: 'Accounting', to: '/accounting' },
      { label: 'Documents', to: '/documents' },
    ] },
  ],
  // Communication Center: bulk email campaigns sent to saved Recipient Lists, minus the Suppression List
  // (unsubscribes and bounces); two-way texting with its own opt-out list and templates; a postal mail log;
  // and reusable eSignature templates.
  communication: [
    { title: 'Email Campaigns', links: [
      { label: 'Dashboard', to: '/comm' },
      { label: 'New Campaign', to: '/comm/campaigns/new' },
      { label: 'Campaigns', to: '/comm/campaigns' },
      { label: 'Recipient List', to: '/comm/lists' },
      { label: 'Suppression List', to: '/comm/suppression?channel=Email' },
      { label: 'Settings', to: '/comm/settings' },
    ] },
    { title: 'Voice and Text', links: [
      { label: 'Calls and Messages', to: '/messages' },
      { label: 'Suppression List', to: '/comm/suppression?channel=SMS' },
      { label: 'Text Templates', to: '/comm/templates' },
    ] },
    { title: 'Postal Mail', links: [{ label: 'Mailbox', to: '/comm/mailbox' }] },
    { title: 'eSignature', links: [{ label: 'eSignature Templates', to: '/comm/esign-templates' }] },
  ],
  // Reports 5.0: favorite, schedule (daily/weekly/monthly) and share saved reports; browse by category.
  reports: [
    { title: 'Reports 5.0', links: [
      { label: 'Favorite Reports', to: '/reports?view=favorites' },
      { label: 'Scheduled Reports', to: '/reports?view=scheduled' },
      { label: 'Shared Reports', to: '/reports?view=shared' },
    ] },
    { title: 'Categories', links: [
      { label: 'All Categories', to: '/reports?view=all' },
      { label: 'Activity', to: '/reports?category=activity' },
      { label: 'Applicant', to: '/reports?category=applicant' },
      { label: 'Book of Business', to: '/reports?category=book-of-business' },
      { label: 'Claim', to: '/reports?category=claim' },
      { label: 'Commission', to: '/reports?category=commission' },
      { label: 'Policy Coverage', to: '/reports?category=policy-coverage' },
      { label: 'Policy Transaction', to: '/reports?category=policy-transaction' },
      { label: 'Quote', to: '/reports?category=quote' },
    ] },
    { title: 'Reports', links: [
      { label: 'All Reports', to: '/reports?view=all' },
      { label: 'Saved Reports', to: '/reports?view=saved' },
      { label: 'Scheduled Reports', to: '/reports?view=scheduled' },
    ] },
    { title: 'Report Categories', links: [
      { label: 'Activity', to: '/reports?category=activity' },
      { label: 'Agency Management', to: '/reports?category=agency-management' },
      { label: 'Applicant', to: '/reports?category=applicant' },
      { label: 'Book of Business', to: '/reports?category=book-of-business' },
      { label: 'Claims', to: '/reports?category=claim' },
      { label: 'Commission', to: '/reports?category=commission' },
      { label: 'Policy Management', to: '/reports?category=policy-management' },
      { label: 'Quote', to: '/reports?category=quote' },
      { label: 'Retention Center', to: '/reports?category=retention' },
      { label: 'Sales Center', to: '/reports?category=sales' },
      { label: 'Data Export', to: '/reports?report=data-export' },
    ] },
    { title: 'Help', links: [{ label: 'Instructions', to: '/help?section=reports' }] },
  ],
  // Settings (admin): agency-wide configuration. Labels drive filters and Automation Center triggers; lead sources
  // can be hidden but not renamed once added; each carrier needs a saved login under Carrier Quoting Setup before
  // it can return quotes in the rater.
  settings: [
    { title: 'Agency Management', links: [
      { label: 'Activity Settings', to: '/admin/activity' },
      { label: 'Automation Center', to: '/admin/automation' },
      { label: 'Certificate Settings', to: '/admin/certificates' },
      { label: 'Plugins', to: '/admin/plugins' },
      { label: 'Manage Email Subscriptions', to: '/admin/email-subscriptions' },
      { label: 'Manage Labels', to: '/admin/labels' },
      { label: 'Manage Lead Sources', to: '/admin/lead-sources' },
    ] },
    { title: 'Carriers and Lines of Business', links: [
      { label: 'Manage Billing Companies', to: '/admin/billing-companies' },
      { label: 'Manage Carriers/Markets', to: '/settings?tab=carriers' },
      { label: 'Manage Departments', to: '/admin/departments' },
      { label: 'Manage Lines of Business', to: '/admin/lines' },
    ] },
    { title: 'Rating', links: [{ label: 'Carrier Quoting Setup', to: '/admin/carrier-quoting' }] },
    { title: 'Templates', links: [
      { label: 'Manage Form Templates', to: '/admin/form-templates' },
      { label: 'Proposal / SOI Templates', to: '/admin/proposal-templates' },
    ] },
    { title: 'Administration', links: [{ label: 'Product Usage Report', to: '/admin/usage' }] },
    // Not in the reference menu; keeps agency profile, users and data tools reachable.
    { title: 'Agency', links: [
      { label: 'Agency Profile', to: '/settings?tab=agency' },
      { label: 'Users', to: '/settings?tab=users' },
      { label: 'Data & Integrations', to: '/settings?tab=data' },
    ] },
  ],
  // Support: knowledge base + tickets (Solution Center), carrier contacts, product news, training with progress
  // tracking, and API documentation for this system's data endpoints.
  help: [
    { title: 'Support', action: 'chat', links: [
      { label: 'Solution Center', to: '/support' },
      { label: 'Carrier Library', to: '/support/carriers' },
    ] },
    { title: 'Product News & Updates', links: [
      { label: "What's New?", to: '/support/whats-new' },
      { label: 'Product Blog', to: '/support/blog' },
    ] },
    { title: 'Training', links: [
      { label: 'Agency University', to: '/support/university' },
      { label: 'Knowledge Base', to: '/support/kb' },
      { label: 'Instructor-Led Trainings', to: '/support/instructor-led' },
    ] },
    { title: 'API Documentation', links: [
      { label: 'Platform API', to: '/support/api' },
      { label: 'Policy API', to: '/support/api/policy' },
      { label: 'Discussion API', to: '/support/api/discussion' },
      { label: 'Applicant API', to: '/support/api/applicant' },
      { label: 'Connect Web Services API', to: '/support/api/web-services' },
    ] },
  ],
  // Marketplace: an integration store — browse partners and activate them; My Integrations manages active ones.
  marketplace: [{
    title: 'Marketplace',
    links: [
      { label: 'Home', to: '/marketplace' },
      { label: 'My Integrations', to: '/marketplace/mine' },
    ],
  }],
  updates: [{
    title: "What's New",
    links: [
      { label: 'Latest Updates', to: '/support/whats-new' },
      { label: 'Agency University', to: '/support/university' },
    ],
  }],
};

function readSeen() {
  try { return localStorage.getItem(UPDATES_KEY) === UPDATES_VERSION; } catch { return true; }
}

/** Household label: "Robert & Linda Feinholz" when there is a co-applicant (or a spouse driver). */
function householdName(a: Account, drivers: Driver[], contacts: AccountContact[]) {
  if (a.account_type === 'Commercial') return accountName(a);
  const spouse = contacts.find((c) => c.account_id === a.id && c.is_secondary) ?? drivers.find((d) => d.account_id === a.id && d.relationship === 'Spouse');
  if (!spouse) return accountName(a);
  return spouse.last_name === a.last_name ? `${a.first_name} & ${spouse.first_name} ${a.last_name}` : `${accountName(a)} & ${spouse.first_name} ${spouse.last_name}`;
}

function useApplicantSections(enabled: boolean): Section[] {
  const [recentIds, setRecentIds] = useState(getRecentAccountIds);
  useEffect(() => onRecentChange(() => setRecentIds(getRecentAccountIds())), []);

  const recent = useTable('accounts', enabled && recentIds.length ? { in: { column: 'id', values: recentIds } } : null);
  // Nothing viewed yet: fall back to the newest applicants so the list is never empty.
  const newest = useTable('accounts', enabled && !recentIds.length ? { order: { column: 'created_at', ascending: false }, limit: 10 } : null);
  const shown = recentIds.length ? recentIds.map((id) => recent.data.find((a) => a.id === id)).filter((a): a is Account => !!a) : newest.data;
  const drivers = useTable('drivers', enabled && shown.length ? { in: { column: 'account_id', values: shown.map((a) => a.id) } } : null);
  const contacts = useTable('account_contacts', enabled && shown.length ? { in: { column: 'account_id', values: shown.map((a) => a.id) } } : null);
  const quotes = useTable('quotes', enabled ? { order: { column: 'created_at', ascending: false }, limit: 5 } : null);
  const quoteOwners = useTable('accounts', enabled && quotes.data.length ? { in: { column: 'id', values: [...new Set(quotes.data.map((q) => q.account_id))] } } : null);

  return useMemo(() => {
    const owner = (q: Quote) => quoteOwners.data.find((a) => a.id === q.account_id);
    const quoteLabel = (q: Quote) => {
      const a = owner(q);
      const who = !a ? 'Unknown' : a.account_type === 'Commercial' && a.business_name ? a.business_name : `${a.last_name}, ${a.first_name}`;
      return `${who} (${LINE_SHORT[q.line_of_business] ?? q.line_of_business})`;
    };
    return [
      { title: 'Applicants', links: [
        { label: 'Create New Applicant', to: '/accounts/new?type=Personal' },
        { label: 'Create Commercial Applicant', to: '/accounts/new?type=Commercial' },
        { label: 'List Applicants', to: '/accounts' },
        { label: 'Search Applicants', to: '/accounts?focus=search' },
        { label: 'Completed Quotes', to: '/quotes?status=Rated' },
        { label: 'Import', to: '/accounts?import=1' },
        { label: 'Submission Center', to: '/quotes?group=commercial' },
      ] },
      { title: 'Recent Applicants', empty: 'No applicants yet', links: shown.map((a) => ({ label: householdName(a, drivers.data, contacts.data), to: `/accounts/${a.id}` })) },
      { title: 'Recent Quotes', empty: 'No quotes yet', links: quotes.data.map((q) => ({ label: quoteLabel(q), to: `/quotes/${q.id}` })) },
    ];
  }, [shown, drivers.data, contacts.data, quotes.data, quoteOwners.data]);
}

export function SideNav({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  const { path } = useRoute();
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const [seenUpdates, setSeenUpdates] = useState(readSeen);
  const closeTimer = useRef<number>();
  const openTimer = useRef<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  // A click after hovering should keep the menu open; only a second click (or leaving) closes it.
  const openedBy = useRef<'hover' | 'click'>('hover');
  const applicantSections = useApplicantSections(open === 'applicants');

  const clearTimers = () => { window.clearTimeout(closeTimer.current); window.clearTimeout(openTimer.current); };
  const scheduleClose = () => { clearTimers(); closeTimer.current = window.setTimeout(() => { setOpen(null); setTip(null); }, 250); };
  const show = (key: MenuKey, by: 'hover' | 'click' = 'hover') => {
    openedBy.current = by;
    setOpen(key);
    if (key === 'updates' && !seenUpdates) {
      try { localStorage.setItem(UPDATES_KEY, UPDATES_VERSION); } catch { /* ignore */ }
      setSeenUpdates(true);
    }
  };

  useEffect(() => { setOpen(null); setTip(null); }, [path]);
  useEffect(() => () => clearTimers(), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const activeKey = MENU.find((m) => m.paths.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/'))))?.key;
  const sections = open === 'applicants' ? applicantSections : open ? STATIC[open] ?? [] : [];

  const go = (to: string) => {
    setOpen(null);
    setTip(null);
    onNavigate();
    navigate(to);
  };

  return (
    <div ref={rootRef} onMouseLeave={scheduleClose} onMouseEnter={() => window.clearTimeout(closeTimer.current)}>
      <aside className={cx('sidebar', mobileOpen && 'mobile-open')} aria-label="Main navigation">
        <a href={href('/')} className="rail-logo" aria-label="Workspace home" onClick={() => onNavigate()}><Logo size={34} /></a>
        <nav>
          {MENU.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={cx('nav-item', (open === key || (!open && activeKey === key)) && 'selected')}
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={open === key}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setTip({ label, top: (r.top + r.height / 2) / appZoom() });
                clearTimers();
                // Switch instantly between menus; small delay before the first one so passing the mouse over doesn't flash it.
                if (open) show(key);
                else openTimer.current = window.setTimeout(() => show(key), 120);
              }}
              onMouseLeave={() => { window.clearTimeout(openTimer.current); setTip(null); }}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ label, top: (r.top + r.height / 2) / appZoom() }); }}
              onBlur={() => setTip(null)}
              onClick={() => {
                clearTimers();
                if (open === key && openedBy.current === 'click') setOpen(null);
                else show(key, 'click');
              }}
            >
              <Icon size={22} strokeWidth={open === key || activeKey === key ? 2.3 : 1.9} />
              {key === 'updates' && !seenUpdates && <span className="nav-badge" aria-label="New updates">!</span>}
            </button>
          ))}
        </nav>
      </aside>

      {open && (
        <div className={cx('nav-flyout', mobileOpen && 'mobile-open')} role="menu" aria-label={MENU.find((m) => m.key === open)?.label}>
          {sections.map((s) => (
            <section key={s.title}>
              <h3 className={cx(s.action && 'nav-flyout-head')}>
                {s.title}
                {s.action === 'chat' && (
                  <button type="button" className="nav-chat" onClick={() => { setOpen(null); setTip(null); onNavigate(); window.dispatchEvent(new Event(OPEN_CHAT_EVENT)); }}>
                    <HelpCircle size={13} /> Chat
                  </button>
                )}
              </h3>
              {s.links.length === 0 && s.empty && <p className="nav-flyout-empty">{s.empty}</p>}
              {s.links.map((l) => (
                <a
                  key={l.to + l.label}
                  role="menuitem"
                  href={href(l.to)}
                  title={l.label}
                  onClick={(e) => { e.preventDefault(); go(l.to); }}
                >
                  {l.label}
                </a>
              ))}
            </section>
          ))}
        </div>
      )}

      {tip && <div className="nav-tooltip" style={{ top: tip.top }}>{tip.label}</div>}
    </div>
  );
}
