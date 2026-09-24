import { BarChart3, BookOpenText, Folder, Gift, LayoutDashboard, Network, Plug, Settings, SquareUser, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { accountName } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { getRecentAccountIds, onRecentChange } from '@/lib/recent';
import { href, navigate, useRoute } from '@/lib/router';
import type { Account, Driver, LineOfBusiness, Quote } from '@/lib/types';
import { REPORTS } from '@/modules/reports/registry';

/*
 * Icon rail + hover flyout menus, laid out like the navigation agency staff are trained on:
 * hover (or click/tap) an icon to open its menu; every entry links to a working screen.
 */

type Link = { label: string; to: string };
type Section = { title: string; links: Link[]; empty?: string };
type MenuKey = 'dashboard' | 'applicants' | 'documents' | 'workspace' | 'reports' | 'settings' | 'help' | 'marketplace' | 'updates';

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
  { key: 'documents', label: 'Documents', icon: Folder, paths: ['/documents', '/messages'] },
  { key: 'workspace', label: 'Agency Workspace', icon: Network, paths: ['/policies', '/activities', '/claims', '/accounting'] },
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
  documents: [
    { title: 'Documents', links: [
      { label: 'All Documents', to: '/documents' },
      { label: 'eSignature Envelopes', to: '/documents?tab=esign' },
    ] },
    { title: 'Communication', links: [
      { label: 'Text & Email Inbox', to: '/messages' },
      { label: 'Send a Message', to: '/messages?compose=1' },
    ] },
  ],
  workspace: [
    { title: 'Policies', links: [
      { label: 'All Policies', to: '/policies' },
      { label: 'Renewals Queue', to: '/policies?view=renewals' },
      { label: 'Pending Policies', to: '/policies?view=pending' },
      { label: 'Cancelled & Expired', to: '/policies?view=cancelled' },
    ] },
    { title: 'Service', links: [
      { label: 'Activities & Tasks', to: '/activities' },
      { label: 'Overdue Tasks', to: '/activities?view=overdue' },
      { label: 'Claims', to: '/claims' },
    ] },
    { title: 'Accounting', links: [
      { label: 'Receivables', to: '/accounting' },
      { label: 'Payments', to: '/accounting?tab=payments' },
      { label: 'Commissions', to: '/accounting?tab=commissions' },
    ] },
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

const REPORT_SECTIONS: Section[] = (() => {
  const groups = new Map<string, Link[]>();
  REPORTS.forEach((r) => { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group)!.push({ label: r.title, to: `/reports?report=${r.key}` }); });
  return [...groups].map(([title, links]) => ({ title, links }));
})();

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
  const sections = open === 'applicants' ? applicantSections : open === 'reports' ? REPORT_SECTIONS : open ? STATIC[open] ?? [] : [];

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
