import {
  AlertTriangle, Bell, Building2, Calculator, CalendarClock, ClipboardList, Database, FileSignature,
  FolderOpen, HelpCircle, Loader2, Menu as MenuIcon, MessageSquare, Plus, Search, ShieldAlert, User, UserPlus, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
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
  useEffect(() => { setMobileOpen(false); }, [route.path]);

  return (
    <div className="app-shell">
      <TopBar onMenu={() => setMobileOpen(true)} onQuickAdd={onQuickAdd} />
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

function TopBar({ onMenu, onQuickAdd }: { onMenu: () => void; onQuickAdd: (k: QuickAddKind) => void }) {
  const { me } = useAppData();
  return (
    <header className="topbar">
      <a className="brand-lockup" href={href('/')} aria-label="Workspace home"><Logo size={30} /></a>
      <button className="mobile-menu" aria-label="Open navigation" onClick={onMenu}><MenuIcon size={20} /></button>
      <GlobalSearch />
      <div className="top-actions">
        <button className="cta-button" onClick={() => onQuickAdd('quote')}><Calculator size={16} /> <span className="hidden sm:inline">Quick Quote</span></button>
        <QuickAddMenu onPick={onQuickAdd} />
        <a className="top-icon hide-sm" href={href('/activities')} aria-label="My activities" title="My activities"><ClipboardList size={20} /></a>
        <NotificationsMenu />
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

type Alert = { id: string; icon: ReactNode; title: string; detail: string; to: string; tone: 'red' | 'amber' | 'teal' | 'purple' };

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
    if (overdue.length) out.push({ id: 'overdue', icon: <AlertTriangle size={15} />, title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, detail: overdue.slice(0, 2).map((a) => a.subject).join(' · '), to: '/activities?view=overdue', tone: 'red' });
    const dueToday = mine.filter((a) => daysUntil(a.due_date) === 0);
    if (dueToday.length) out.push({ id: 'today', icon: <CalendarClock size={15} />, title: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`, detail: dueToday.slice(0, 2).map((a) => a.subject).join(' · '), to: '/activities?view=today', tone: 'amber' });
    const soon = policies.data.filter((p) => { const d = daysUntil(p.expiration_date); return d !== null && d >= 0 && d <= Math.min(30, settings?.renewal_reminder_days ?? 60); });
    if (soon.length) out.push({ id: 'renewals', icon: <FolderOpen size={15} />, title: `${soon.length} polic${soon.length > 1 ? 'ies' : 'y'} renewing within 30 days`, detail: soon.slice(0, 2).map((p) => `${names.get(p.account_id) ?? ''} ${p.line_of_business}`).join(' · '), to: '/policies?view=renewals', tone: 'teal' });
    messages.data.slice(0, 5).forEach((m) => out.push({ id: m.id, icon: <MessageSquare size={15} />, title: `New text from ${names.get(m.account_id) ?? 'a client'}`, detail: m.body, to: `/messages?account=${m.account_id}`, tone: 'purple' }));
    docs.data.slice(0, 3).forEach((d) => out.push({ id: d.id, icon: <FileSignature size={15} />, title: 'eSignature declined', detail: `${d.name} · ${names.get(d.account_id ?? '') ?? ''}`, to: '/documents?tab=esign', tone: 'red' }));
    return out;
  }, [activities.data, policies.data, messages.data, docs.data, names, me, settings]);
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const alerts = useAlerts();
  const tone = { red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', teal: 'bg-brand-50 text-brand-600', purple: 'bg-violet-50 text-violet-600' };
  return (
    <div className="relative" ref={ref}>
      <button className="top-icon notification" aria-label={`Notifications (${alerts.length})`} title="Notifications" onClick={() => setOpen(!open)}>
        <Bell size={20} />{alerts.length > 0 && <i>{alerts.length > 9 ? '9+' : alerts.length}</i>}
      </button>
      {open && (
        <div className="top-pop w-80 right-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100">
            <span className="text-[13px] font-semibold text-ink-900">Notifications</span>
            <span className="text-xs text-ink-400">{alerts.length} alert{alerts.length === 1 ? '' : 's'}</span>
          </div>
          {alerts.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-ink-400">You're all caught up.</div>}
          <div className="max-h-96 overflow-y-auto">
            {alerts.map((a) => (
              <a key={a.id} href={href(a.to)} onClick={() => setOpen(false)} className="flex gap-2.5 px-3 py-2.5 hover:bg-ink-50 border-b border-ink-50 last:border-0">
                <span className={cx('w-7 h-7 rounded-full grid place-items-center shrink-0', tone[a.tone])}>{a.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink-900">{a.title}</span>
                  <span className="block text-xs text-ink-400 truncate">{a.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
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
