import {
  AlertTriangle, Bell, Check, ListFilter, Building2, Calculator, CalendarClock, ClipboardList, Database, FileSignature,
  FolderOpen, HelpCircle, Loader2, Menu as MenuIcon, MessageSquare, Plus, Search, ShieldAlert, User, UserPlus, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo, Wordmark } from '@/components/Logo';
import { SideNav } from '@/components/SideNav';
import { AutomationTicker } from '@/modules/admin';
import { SupportChatHost } from '@/modules/support';
import { Avatar, cx } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, daysUntil, fmtDate, fmtPhone } from '@/lib/format';
import { useDebounced, useTable } from '@/lib/hooks';
import { href, navigate, useRoute } from '@/lib/router';
import type { Account, Policy } from '@/lib/types';

export function Layout({ children, onQuickAdd }: { children: ReactNode; onQuickAdd: (kind: QuickAddKind) => void }) {
  const route = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [route.path]);

  return (
    <div className={cx('app-shell', notifOpen && 'notif-open')}>
      <TopBar onMenu={() => setMobileOpen(true)} onQuickAdd={onQuickAdd} notifOpen={notifOpen} onToggleNotif={() => setNotifOpen((v) => !v)} />
      {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      <SideNav mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">{children}</main>
      <SupportChatHost />
      <AutomationTicker />
      <StatusFooter />
    </div>
  );
}

function StatusFooter() {
  const { mode, settings } = useAppData();
  return (
    <footer>
      <span>{settings?.name ?? 'Northstar AMS'} · Agency Management System</span>
      <span className="flex items-center gap-1.5">
        <Database size={11} />
        {mode === 'supabase' ? 'Connected to Supabase' : <>Browser storage (demo mode) · <a href={href('/settings?tab=data')}>Connect Supabase</a></>}
      </span>
    </footer>
  );
}

// ── Top bar ──

export type QuickAddKind = 'account' | 'commercial' | 'quote' | 'policy' | 'activity' | 'claim' | 'message';

function TopBar({ onMenu, onQuickAdd, notifOpen, onToggleNotif }: { onMenu: () => void; onQuickAdd: (k: QuickAddKind) => void; notifOpen: boolean; onToggleNotif: () => void }) {
  const { me } = useAppData();
  return (
    <header className="topbar">
      <a className="brand-lockup" href={href('/')} aria-label="Workspace home"><Logo size={32} /><Wordmark height={17} className="brand-wordmark" /></a>
      <button className="mobile-menu" aria-label="Open navigation" onClick={onMenu}><MenuIcon size={20} /></button>
      <GlobalSearch />
      <div className="top-actions">
        <button className="cta-button" onClick={() => onQuickAdd('quote')}><Calculator size={16} /> <span className="hidden sm:inline">Quick Quote</span></button>
        <QuickAddMenu onPick={onQuickAdd} />
        <a className="top-icon hide-sm" href={href('/activities')} aria-label="My activities" title="My activities"><ClipboardList size={20} /></a>
        <NotificationsButton open={notifOpen} onToggle={onToggleNotif} />
        <a className="top-icon hide-sm" href={href('/help')} aria-label="Help & training" title="Help & training"><HelpCircle size={20} /></a>
        <a className="avatar-link" href={href('/settings?tab=agency')} title={me ? `Acting as ${me.name} (${me.role})` : 'Choose user'}>
          <Avatar name={me?.name ?? '?'} color={me?.color} size={30} />
        </a>
      </div>
    </header>
  );
}

function useOutside(ref: React.RefObject<HTMLElement>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ref, open, close]);
}

function QuickAddMenu({ onPick }: { onPick: (k: QuickAddKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const items: { kind: QuickAddKind; label: string; icon: ReactNode }[] = [
    { kind: 'account', label: 'Personal account', icon: <UserPlus size={15} /> },
    { kind: 'commercial', label: 'Commercial account', icon: <Building2 size={15} /> },
    { kind: 'quote', label: 'Quote', icon: <Calculator size={15} /> },
    { kind: 'policy', label: 'Policy', icon: <FolderOpen size={15} /> },
    { kind: 'activity', label: 'Activity / task', icon: <CalendarClock size={15} /> },
    { kind: 'claim', label: 'Claim (FNOL)', icon: <ShieldAlert size={15} /> },
    { kind: 'message', label: 'Text message', icon: <MessageSquare size={15} /> },
  ];
  return (
    <div className="relative" ref={ref}>
      <button className="top-icon" aria-label="Create new" title="Create new" onClick={() => setOpen(!open)}><Plus size={21} /></button>
      {open && (
        <div className="top-pop w-56">
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Create new</div>
          {items.map((it) => (
            <button key={it.kind} onClick={() => { setOpen(false); onPick(it.kind); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-800 hover:bg-brand-50 bg-transparent text-left">
              <span className="text-brand-600">{it.icon}</span>{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notifications: derived alerts ──

type AlertKind = 'Tasks' | 'Renewals' | 'Messages' | 'eSignature';
type Alert = { id: string; kind: AlertKind; icon: ReactNode; title: string; detail: string; to: string; tone: 'red' | 'amber' | 'teal' | 'purple' };

export function useAlerts(): Alert[] {
  const { me, settings } = useAppData();
  // Same notion of 'open' as the Activities queue (anything not Completed), so counts match the linked views.
  const activities = useTable('activities', { in: { column: 'status', values: ['Open', 'In Progress'] } });
  const policies = useTable('policies', { eq: { status: 'Active' } });
  const messages = useTable('messages', { eq: { read: false, direction: 'Inbound' } });
  const docs = useTable('documents', { eq: { esign_status: 'Declined' } });
  const accounts = useTable('accounts', {});
  const names = useMemo(() => new Map(accounts.data.map((a) => [a.id, accountName(a)])), [accounts.data]);

  return useMemo(() => {
    const out: Alert[] = [];
    const mine = activities.data.filter((a) => !me || a.assigned_to === me.name);
    const overdue = mine.filter((a) => (daysUntil(a.due_date) ?? 1) < 0);
    if (overdue.length) out.push({ id: 'overdue', kind: 'Tasks', icon: <AlertTriangle size={15} />, title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, detail: overdue.slice(0, 2).map((a) => a.subject).join(' · '), to: '/activities?view=overdue', tone: 'red' });
    const dueToday = mine.filter((a) => daysUntil(a.due_date) === 0);
    if (dueToday.length) out.push({ id: 'today', kind: 'Tasks', icon: <CalendarClock size={15} />, title: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`, detail: dueToday.slice(0, 2).map((a) => a.subject).join(' · '), to: '/activities?view=today', tone: 'amber' });
    const soon = policies.data.filter((p) => { const d = daysUntil(p.expiration_date); return d !== null && d >= 0 && d <= Math.min(30, settings?.renewal_reminder_days ?? 60); });
    if (soon.length) out.push({ id: 'renewals', kind: 'Renewals', icon: <FolderOpen size={15} />, title: `${soon.length} polic${soon.length > 1 ? 'ies' : 'y'} renewing within 30 days`, detail: soon.slice(0, 2).map((p) => `${names.get(p.account_id) ?? ''} ${p.line_of_business}`).join(' · '), to: '/policies?view=renewals', tone: 'teal' });
    messages.data.slice(0, 5).forEach((m) => out.push({ id: m.id, kind: 'Messages', icon: <MessageSquare size={15} />, title: `New text from ${names.get(m.account_id) ?? 'a client'}`, detail: m.body, to: `/messages?account=${m.account_id}`, tone: 'purple' }));
    docs.data.slice(0, 3).forEach((d) => out.push({ id: d.id, kind: 'eSignature', icon: <FileSignature size={15} />, title: 'eSignature declined', detail: `${d.name} · ${names.get(d.account_id ?? '') ?? ''}`, to: '/documents?tab=esign', tone: 'red' }));
    return out;
  }, [activities.data, policies.data, messages.data, docs.data, names, me, settings]);
}

const READ_KEY = 'northstar-ams:read-alerts';
function readIds(): string[] {
  try { const v = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Bell button: shows the unread count and toggles the docked Notifications panel. */
function NotificationsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const alerts = useAlerts();
  const [read] = useReadAlerts();
  const unread = alerts.filter((a) => !read.includes(a.id)).length;
  return (
    <button className={cx('top-icon notification', open && 'text-white')} aria-label={`Notifications (${unread} unread)`} aria-expanded={open} title="Notifications" onClick={onToggle}>
      <Bell size={20} />{unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
    </button>
  );
}

// Read state is per browser; it survives reloads and is shared between the button and the panel.
const readListeners = new Set<() => void>();
function useReadAlerts() {
  const [ids, setIds] = useState(readIds);
  useEffect(() => { const fn = () => setIds(readIds()); readListeners.add(fn); return () => { readListeners.delete(fn); }; }, []);
  const update = (next: string[]) => {
    try { localStorage.setItem(READ_KEY, JSON.stringify(next.slice(-500))); } catch { /* storage unavailable */ }
    readListeners.forEach((fn) => fn());
  };
  return [ids, update] as const;
}

/** Docked right-hand Notifications panel with filters and read / unread state. */
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const alerts = useAlerts();
  const [read, setRead] = useReadAlerts();
  const [showRead, setShowRead] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kinds, setKinds] = useState<AlertKind[]>([]);
  const tone = { red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', teal: 'bg-brand-50 text-brand-600', purple: 'bg-violet-50 text-violet-600' };
  const visible = alerts.filter((a) => (showRead || !read.includes(a.id)) && (!kinds.length || kinds.includes(a.kind)));
  const markRead = (id: string) => setRead([...read.filter((x) => x !== id), id]);
  const markUnread = (id: string) => setRead(read.filter((x) => x !== id));
  const unreadVisible = visible.filter((a) => !read.includes(a.id));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside className="notif-panel" aria-label="Notifications">
      <div className="flex items-center justify-between h-[34px] px-2.5 bg-[#263238] text-white">
        <span className="text-[13px] font-semibold">Notifications</span>
        <button type="button" aria-label="Close notifications" onClick={onClose} className="bg-transparent text-white"><X size={20} /></button>
      </div>
      <div className="flex items-center justify-between h-[50px] px-2.5 border-b border-ink-200">
        <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen} className="inline-flex items-center gap-2 bg-transparent text-[13px] font-semibold text-ink-900">
          <ListFilter size={16} /> Filters{kinds.length ? ` (${kinds.length})` : ''}
        </button>
        <button type="button" onClick={() => setShowRead(!showRead)} className="bg-transparent text-[13px] font-semibold text-brand-600">{showRead ? 'Hide read' : 'Show read'}</button>
      </div>
      {filtersOpen && (
        <div className="flex flex-wrap gap-1.5 px-2.5 py-2.5 border-b border-ink-100">
          {(['Tasks', 'Renewals', 'Messages', 'eSignature'] as AlertKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
              className={cx('h-7 px-2.5 rounded-full border text-xs font-semibold', kinds.includes(k) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-200 text-ink-700')}>{k}</button>
          ))}
          {kinds.length > 0 && <button type="button" onClick={() => setKinds([])} className="h-7 px-2 bg-transparent text-xs text-ink-500 underline">Clear</button>}
        </div>
      )}
      {unreadVisible.length > 1 && (
        <div className="flex justify-end px-2.5 pt-2"><button type="button" onClick={() => setRead([...new Set([...read, ...unreadVisible.map((a) => a.id)])])} className="bg-transparent text-xs font-semibold text-brand-600">Mark all read</button></div>
      )}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-2 text-[13px] text-ink-800">
            <Bell size={34} className="text-ink-500 fill-ink-500" />
            No notifications found.
          </div>
        ) : visible.map((a) => {
          const isRead = read.includes(a.id);
          return (
            <div key={a.id} className={cx('group flex gap-2.5 px-3 py-3 border-b border-ink-50', isRead ? 'bg-white opacity-70' : 'bg-brand-50/40')}>
              <span className={cx('w-7 h-7 rounded-full grid place-items-center shrink-0', tone[a.tone])}>{a.icon}</span>
              <a href={href(a.to)} onClick={() => markRead(a.id)} className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink-900">{a.title}</span>
                <span className="block text-xs text-ink-500 line-clamp-2">{a.detail}</span>
              </a>
              <button type="button" onClick={() => (isRead ? markUnread(a.id) : markRead(a.id))} title={isRead ? 'Mark unread' : 'Mark read'} aria-label={isRead ? 'Mark unread' : 'Mark read'} className="self-start bg-transparent text-ink-400 hover:text-ink-800">
                {isRead ? <Bell size={14} /> : <Check size={14} />}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ── Global search: accounts + policies ──

type Hit = { kind: 'account'; row: Account } | { kind: 'policy'; row: Policy; account?: Account };

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const debounced = useDebounced(q, 220);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useOutside(ref, open, () => setOpen(false));

  // "/" focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = debounced.trim();
    if (!term) { setHits([]); setLoading(false); return; }
    let live = true;
    setLoading(true);
    Promise.all([
      db.search('accounts', ['first_name', 'last_name', 'business_name', 'email', 'phone', 'mobile_phone', 'city'], term, 8),
      db.search('policies', ['policy_number', 'carrier'], term, 6),
      // "Sarah Mitchell" — match first + last name together
      term.includes(' ') ? db.search('accounts', ['last_name'], term.split(/\s+/).pop()!, 20) : Promise.resolve([] as Account[]),
    ]).then(async ([accts, pols, byLast]) => {
      const lower = term.toLowerCase();
      const full = byLast.filter((a) => `${a.first_name} ${a.last_name}`.toLowerCase().includes(lower));
      const allAccts = [...new Map([...full, ...accts].map((a) => [a.id, a])).values()].slice(0, 8);
      const ids = [...new Set(pols.map((p) => p.account_id))];
      const owners = ids.length ? await db.list('accounts', { in: { column: 'id', values: ids } }) : [];
      if (!live) return;
      setHits([
        ...allAccts.map((row) => ({ kind: 'account' as const, row })),
        ...pols.map((row) => ({ kind: 'policy' as const, row, account: owners.find((o) => o.id === row.account_id) })),
      ]);
      setCursor(0);
    }).catch(() => { if (live) setHits([]); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [debounced]);

  const go = (h: Hit) => {
    navigate(h.kind === 'account' ? `/accounts/${h.row.id}` : `/policies/${h.row.id}`);
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') {
      // Only jump to a hit if the results belong to what's typed now (not a stale, still-loading query).
      if (hits[cursor] && !loading && debounced === q) go(hits[cursor]);
      else if (q.trim()) { navigate(`/accounts?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
    }
  };

  const accountHits = hits.filter((h) => h.kind === 'account');
  const policyHits = hits.filter((h) => h.kind === 'policy');

  return (
    <div className="search-area" ref={ref}>
      <Search size={18} className="search-icon-left" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search accounts, policies, phone, email…  ( / )"
        className="search-input"
        aria-label="Global search"
      />
      {q && <button className="search-clear" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear search"><X size={16} /></button>}
      {open && q.trim() && (
        <div className="search-dropdown">
          <div className="search-dropdown-header">
            <span>{loading ? 'Searching…' : `${hits.length} result${hits.length === 1 ? '' : 's'} for "${q.trim()}"`}</span>
            <a href={href(`/accounts?q=${encodeURIComponent(q.trim())}`)} onClick={() => setOpen(false)}>View all accounts</a>
          </div>
          {loading && hits.length === 0 && <div className="search-loading"><Loader2 size={22} className="spin" /><span>Searching…</span></div>}
          {!loading && hits.length === 0 && <div className="search-empty"><User size={28} /><span>No matches. Press Enter to search all accounts.</span></div>}
          <div className="search-results">
            {accountHits.length > 0 && <div className="search-group">Accounts</div>}
            {accountHits.map((h) => {
              const a = h.row as Account;
              const i = hits.indexOf(h);
              return (
                <button key={a.id} className={cx('account-result', i === cursor && 'cursor')} onMouseEnter={() => setCursor(i)} onClick={() => go(h)}>
                  <div className="account-avatar">{a.account_type === 'Commercial' ? <Building2 size={16} /> : `${a.first_name[0] ?? ''}${a.last_name[0] ?? ''}`}</div>
                  <div className="account-info">
                    <div className="account-name">{accountName(a)}</div>
                    <div className="account-details">
                      <span className="account-email">{a.email}</span>
                      {a.phone && <span className="account-phone">{fmtPhone(a.phone)}</span>}
                    </div>
                    <div className="account-meta">
                      {a.account_type && <span className="account-tag">{a.account_type}</span>}
                      {a.status && <span className={`account-status ${a.status.toLowerCase()}`}>{a.status}</span>}
                      {a.city && a.state && <span className="account-location">{a.city}, {a.state}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            {policyHits.length > 0 && <div className="search-group">Policies</div>}
            {policyHits.map((h) => {
              const p = h.row as Policy;
              const i = hits.indexOf(h);
              return (
                <button key={p.id} className={cx('account-result', i === cursor && 'cursor')} onMouseEnter={() => setCursor(i)} onClick={() => go(h)}>
                  <div className="account-avatar policy"><FolderOpen size={16} /></div>
                  <div className="account-info">
                    <div className="account-name">{p.policy_number} · {p.line_of_business}</div>
                    <div className="account-details">
                      <span className="account-email">{h.kind === 'policy' && h.account ? accountName(h.account) : ''}</span>
                      <span className="account-phone">{p.carrier} · exp {fmtDate(p.expiration_date)}</span>
                    </div>
                    <div className="account-meta"><span className={`account-status ${p.status.toLowerCase()}`}>{p.status}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
