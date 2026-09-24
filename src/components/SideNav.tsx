import { BarChart3, BookOpenText, Folder, Gift, LayoutDashboard, Network, Plug, Settings, SquareUser, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { accountName } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { getRecentAccountIds, onRecentChange } from '@/lib/recent';
import { href, navigate, useRoute } from '@/lib/router';
import type { Account, Driver, LineOfBusiness, Quote } from '@/lib/types';

/*
 * Icon rail + hover flyout menus, laid out like the navigation agency staff are trained on:
 * hover (or click/tap) an icon to open its menu; every entry links to a working screen.
 */

type Link = { label: string; to: string };
type Section = { title: string; links: Link[]; empty?: string };
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
  { key: 'settings', label: 'Settings', icon: Settings, paths: ['/settings'] },
  { key: 'help', label: 'Help & Training', icon: BookOpenText, paths: ['/help'] },
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
  settings: [{
    title: 'Settings',
    links: [
      { label: 'Agency Profile', to: '/settings?tab=agency' },
      { label: 'Users', to: '/settings?tab=users' },
      { label: 'Carriers', to: '/settings?tab=carriers' },
      { label: 'Data & Integrations', to: '/settings?tab=data' },
    ],
  }],
  help: [{
    title: 'Help & Training',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'Getting Started', to: '/help?section=getting-started' },
      { label: 'Navigating the System', to: '/help?section=navigation' },
      { label: 'Quoting Walkthrough', to: '/help?section=quoting' },
      { label: 'Servicing Policies', to: '/help?section=servicing' },
      { label: 'Glossary', to: '/help?section=glossary' },
    ],
  }],
  marketplace: [{
    title: 'Marketplace',
    links: [
      { label: 'Browse Integrations', to: '/help?section=marketplace' },
      { label: 'Carrier Downloads', to: '/settings?tab=data' },
      { label: 'Carrier Appointments', to: '/settings?tab=carriers' },
    ],
  }],
  updates: [{
    title: "What's New",
    links: [
      { label: 'Latest Updates', to: '/help?section=whats-new' },
      { label: 'Training: Quoting Walkthrough', to: '/help?section=quoting' },
    ],
  }],
};

function readSeen() {
  try { return localStorage.getItem(UPDATES_KEY) === UPDATES_VERSION; } catch { return true; }
}

/** Household label: "Robert & Linda Feinholz" when a spouse with the same last name is a driver. */
function householdName(a: Account, drivers: Driver[]) {
  if (a.account_type === 'Commercial') return accountName(a);
  const spouse = drivers.find((d) => d.account_id === a.id && d.relationship === 'Spouse');
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
        { label: 'Create New Applicant', to: '/accounts?new=Personal' },
        { label: 'Create Commercial Applicant', to: '/accounts?new=Commercial' },
        { label: 'List Applicants', to: '/accounts' },
        { label: 'Search Applicants', to: '/accounts?focus=search' },
        { label: 'Completed Quotes', to: '/quotes?status=Rated' },
        { label: 'Import', to: '/accounts?import=1' },
        { label: 'Submission Center', to: '/quotes?group=commercial' },
      ] },
      { title: 'Recent Applicants', empty: 'No applicants yet', links: shown.map((a) => ({ label: householdName(a, drivers.data), to: `/accounts/${a.id}` })) },
      { title: 'Recent Quotes', empty: 'No quotes yet', links: quotes.data.map((q) => ({ label: quoteLabel(q), to: `/quotes/${q.id}` })) },
    ];
  }, [shown, drivers.data, quotes.data, quoteOwners.data]);
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
                setTip({ label, top: r.top + r.height / 2 });
                clearTimers();
                // Switch instantly between menus; small delay before the first one so passing the mouse over doesn't flash it.
                if (open) show(key);
                else openTimer.current = window.setTimeout(() => show(key), 120);
              }}
              onMouseLeave={() => { window.clearTimeout(openTimer.current); setTip(null); }}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ label, top: r.top + r.height / 2 }); }}
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
              <h3>{s.title}</h3>
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
