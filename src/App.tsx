import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  KeyRound,
  LifeBuoy,
  Loader2,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Phone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type Account } from '@/lib/supabase';

const navItems = [
  { icon: Grid2X2, label: 'Workspace' },
  { icon: BriefcaseBusiness, label: 'Accounts' },
  { icon: FolderOpen, label: 'Policies' },
  { icon: ClipboardList, label: 'Activities' },
  { icon: BarChart3, label: 'Reports' },
  { icon: Settings, label: 'Settings' },
  { icon: KeyRound, label: 'Access' },
  { icon: BookOpen, label: 'Library' },
  { icon: MessageSquare, label: 'Messages' },
  { icon: BriefcaseBusiness, label: 'Workflows' },
  { icon: FilePlus2, label: 'Documents' },
];

function StatRow({ label, value }: { label: string; value: string }) {
  return <div className="stat-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Card({ title, children, className = '', action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={`card ${className}`}><div className="card-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}

function SearchDropdown({ query, onClose }: { query: string; onClose: () => void }) {
  const [results, setResults] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,city.ilike.%${query}%`)
        .limit(10);

      if (!error && data) setResults(data as Account[]);
      setLoading(false);
      setSearched(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-dropdown">
      <div className="search-dropdown-header">
        <span>{loading ? 'Searching…' : searched ? `${results.length} result${results.length === 1 ? '' : 's'} for "${query}"` : 'Type to search accounts'}</span>
        <button onClick={onClose} aria-label="Close search"><X size={16} /></button>
      </div>
      {loading && <div className="search-loading"><Loader2 size={22} className="spin" /><span>Searching accounts…</span></div>}
      {!loading && searched && results.length === 0 && (
        <div className="search-empty"><User size={28} /><span>No accounts found for "{query}"</span></div>
      )}
      {!loading && results.length > 0 && (
        <div className="search-results">
          {results.map((acct) => (
            <div key={acct.id} className="account-result">
              <div className="account-avatar">{acct.first_name[0]}{acct.last_name[0]}</div>
              <div className="account-info">
                <div className="account-name">{acct.first_name} {acct.last_name}</div>
                <div className="account-details">
                  <span className="account-email">{acct.email}</span>
                  {acct.phone && <span className="account-phone"><Phone size={11} /> {acct.phone}</span>}
                </div>
                <div className="account-meta">
                  {acct.policy_type && <span className="account-tag">{acct.policy_type}</span>}
                  {acct.status && <span className={`account-status ${acct.status.toLowerCase()}`}>{acct.status}</span>}
                  {acct.city && acct.state && <span className="account-location"><MapPin size={11} /> {acct.city}, {acct.state}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [activeNav, setActiveNav] = useState('Workspace');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [banner, setBanner] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (value.trim()) setSearchActive(true);
    else setSearchActive(false);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchActive(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={22} strokeWidth={2.2} /></div></div>
        <div className="search-area" ref={searchRef}>
          <button className="mobile-menu" aria-label="Open navigation"><Menu size={20} /></button>
          <Search size={18} className="search-icon-left" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery.trim() && setSearchActive(true)}
            placeholder="Search accounts, policies, contacts…"
            className="search-input"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => { setSearchQuery(''); setSearchActive(false); }} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          {searchActive && <SearchDropdown query={searchQuery} onClose={() => setSearchActive(false)} />}
        </div>
        <div className="top-actions">
          <button className="eva-button"><Sparkles size={16} /> AI</button>
          <button className="avatar">MN</button>
          <button className="top-icon" aria-label="Add"><FilePlus2 size={20} /></button>
          <button className="top-icon" aria-label="Menu"><ClipboardList size={20} /></button>
          <button className="top-icon notification" aria-label="Notifications"><Bell size={20} /><i /></button>
          <button className="top-icon" aria-label="Help"><LifeBuoy size={20} /></button>
          <button className="top-icon" aria-label="Settings"><Settings size={20} /></button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-top"><button className="collapse" aria-label="Collapse sidebar"><PanelLeft size={20} /></button></div>
        <nav>{navItems.map(({ icon: Icon, label }) => <button key={label} className={`nav-item ${activeNav === label ? 'selected' : ''}`} onClick={() => setActiveNav(label)} title={label}><Icon size={22} strokeWidth={activeNav === label ? 2.3 : 1.8} /></button>)}</nav>
        <div className="sidebar-bottom"><button className="nav-item" title="More"><MoreHorizontal size={22} /></button></div>
      </aside>

      <main className="main-content">
        <div className="dashboard-grid">
          <div className="promo-wrap">
            <button className="carousel-arrow left" onClick={() => setBanner((banner + 2) % 3)} aria-label="Previous promotion"><ArrowLeft size={20} /></button>
            <div className="promo-card">
              <div className="promo-image" />
              <div className="promo-copy"><span className="promo-kicker">NORTHSTAR ACADEMY</span><h1>Root<br /><em>Quote smarter.</em><br />Bind faster.</h1><button className="learn-button">Learn more <ArrowRight size={16} /></button></div>
              <div className="promo-dots">{[0, 1, 2, 3, 4, 5].map((dot) => <span key={dot} className={banner === dot % 3 ? 'active' : ''} />)}</div>
            </div>
            <button className="carousel-arrow right" onClick={() => setBanner((banner + 1) % 3)} aria-label="Next promotion"><ArrowRight size={20} /></button>
          </div>
          <Card title="Need Help Getting Started?" className="help-card"><p className="teal-intro">Product News & Updates</p><a>Solution Center</a><a>Training & Learning</a><a>Submit a Support Ticket</a><button className="ask-button"><Sparkles size={16} /> Ask EVA</button></Card>
          <Card title="Text Messages" className="text-card"><StatRow label="Sent / Received" value="74,361" /><StatRow label="Unresolved" value="5" /></Card>
          <Card title="EZLynx Carrier Integration" className="carrier-card"><p>Log in to your carrier sites directly from EZLynx.</p><button className="extension-button">Add Extension</button></Card>
          <Card title="Policy Downloads" className="policy-card" action={<RefreshCw size={20} className="muted-icon" />}><p className="card-note">(Last 7 Days) - updated 29 minutes ago</p><StatRow label="Cancellations" value="10" /><StatRow label="Renewals" value="45" /><StatRow label="New Policies" value="3" /><StatRow label="Non-Renewals" value="-" /><StatRow label="Matched" value="91" /></Card>
          <Card title="Free Training: Transitioning to Reports 5.0" className="training-card"><div className="training-copy"><span>FREE TRAINING:</span><strong>Transitioning to Reports 5.0</strong><p>Join our free Friday webinars to make the move from old Reports to new Reports.</p></div><div className="training-image" /><button className="text-link">Register Now</button></Card>
          <Card title="Alerts" className="alerts-card"><StatRow label="New" value="-" /><StatRow label="All Alerts" value="-" /></Card>
          <Card title="eSignature" className="esign-card"><StatRow label="Completed" value="5,633" /><StatRow label="Pending" value="14" /><StatRow label="Canceled" value="202" /><StatRow label="Declined" value="6" /><StatRow label="Expired" value="372" /><StatRow label="Failed" value="-" /><StatRow label="All Envelopes" value="6,227" /></Card>
        </div>
      </main>
      <footer><span>Northstar AMS · Workspace</span><span>All systems operational · <a>Support center</a></span></footer>
    </div>
  );
}

export default App;
