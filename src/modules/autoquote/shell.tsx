import {
  AlertTriangle, Briefcase, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, IdCard, Loader2, Mail, MessageSquare, Plug, Share2, Star,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { accountName, fmtDate, fmtPhone } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, setParam } from '@/lib/router';
import type { Account } from '@/lib/types';

/* Screen furniture shared by the Auto and Home quoting workflows: applicant drawer, record tabs, stepper, header. */

const DRAWER_KEY = 'northstar-ams:aq-drawer';
const HIDE_KEY = 'northstar-ams:aq-hide-prefilled';
const FAV_KEY = 'northstar-ams:favorite-accounts';
export const readLs = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const writeLs = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Step navigation that can land on (scroll to, focus and flash) a specific field — used by Fix / Edit links. */
export function useStepNav(view: string) {
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
  return go;
}

/** Dialogs render in a portal: give them the quoting workflow's teal theme while it's open. */
export function useQuoteThemeDialogs() {
  useEffect(() => { document.body.classList.add('theme-quote-dialogs'); return () => document.body.classList.remove('theme-quote-dialogs'); }, []);
}

export function useHidePrefilled() {
  const [hide, setHide] = useState(readLs(HIDE_KEY) !== '0');
  return [hide, () => { setHide(!hide); writeLs(HIDE_KEY, hide ? '0' : '1'); }] as const;
}

export function WorkflowHeader({ icon: Icon, title, saving, hidePrefilled, onTogglePrefilled }: {
  icon: LucideIcon; title: string; saving: 'idle' | 'saving' | 'saved' | 'error'; hidePrefilled: boolean; onTogglePrefilled: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-[#f0f1f3] border-b border-ink-200">
      <Icon size={28} className="text-ink-500" />
      <h1 className="text-[19px] text-ink-900">{title}</h1>
      <span className="text-[11px] text-ink-400 ml-2" aria-live="polite">
        {saving === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span> : saving === 'saved' ? 'Draft saved' : saving === 'error' ? 'Not saved' : ''}
      </span>
      <div className="flex-1" />
      <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-800 cursor-pointer">
        <button type="button" role="switch" aria-checked={hidePrefilled} aria-label="Hide Prefilled Answers" onClick={onTogglePrefilled}
          className={cx('relative w-8 h-4 rounded-full transition-colors', hidePrefilled ? 'bg-[#ce93d8]' : 'bg-ink-300')}>
          <span className={cx('absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-sm grid place-items-center shadow transition-all', hidePrefilled ? 'left-[14px] bg-[#7b1fa2] text-white' : 'left-[-2px] bg-ink-500')}>{hidePrefilled && <Check size={12} strokeWidth={3} />}</span>
        </button>
        Hide Prefilled Answers
      </label>
    </div>
  );
}

export type StepDef = { key: string; label: string; icon: LucideIcon };

/** Horizontal step tracker: active step teal, others gray with a green check (complete) or amber triangle (missing items). */
export function QuoteStepper({ steps, view, status, visited, onGo }: {
  steps: StepDef[]; view: string; status: (k: string) => 'ok' | 'warn'; visited: string[]; onGo: (k: string) => void;
}) {
  const lastKey = steps[steps.length - 1]?.key;
  return (
    <nav aria-label="Quote steps" className="bg-white border border-ink-200 rounded shadow-card px-2 sm:px-6 py-3 mb-5 overflow-x-auto">
      <ol className="relative flex justify-between" style={{ minWidth: steps.length * 92 }}>
        <span className="absolute left-10 right-10 top-[22px] h-px bg-ink-200" aria-hidden />
        {steps.map((s) => {
          const active = view === s.key;
          const st = status(s.key);
          const last = s.key === lastKey;
          const Icon = last && st === 'ok' ? Check : last ? AlertTriangle : s.icon;
          const label = last ? (st === 'ok' ? 'Valid' : 'Invalid') : s.label;
          return (
            <li key={s.key} className="relative z-10 flex flex-col items-center w-24">
              <button type="button" onClick={() => onGo(s.key)} aria-current={active ? 'step' : undefined} aria-label={label}
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

/** The applicant record's tabs (also shown above the quoting workflows, where Quotes is active). */
export const RECORD_TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'policies', label: 'Policies' }, { key: 'details', label: 'Details' }, { key: 'quotes', label: 'Quotes' },
  { key: 'lead', label: 'Lead Info' }, { key: 'documents', label: 'Documents' }, { key: 'certificates', label: 'Certificates' }, { key: 'activities', label: 'Activity' },
  { key: 'billing', label: 'Invoices' }, { key: 'claims', label: 'Claims' }, { key: 'messages', label: 'Messages' },
] as const;
export type RecordTab = (typeof RECORD_TABS)[number]['key'];

export function RecordTabs({ accountId, active = 'quotes' }: { accountId: string; active?: RecordTab }) {
  return (
    <div className="flex gap-0 overflow-x-auto bg-white border-b border-ink-200 px-2" role="tablist" aria-label="Applicant record">
      {RECORD_TABS.map((t) => {
        const on = t.key === active;
        return (
          <a key={t.key} role="tab" aria-selected={on} href={href(`/accounts/${accountId}${t.key === 'overview' ? '' : `?tab=${t.key}`}`)}
            className={cx('px-5 py-3 text-[13px] font-semibold tracking-wide whitespace-nowrap border-b-2 transition-colors', on ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-600 hover:text-ink-900 hover:bg-ink-50')}>{t.label}</a>
        );
      })}
    </div>
  );
}

// ── Applicant drawer ──

const RESEARCH: { key: string; label: string; url: (q: string, a: Account) => string }[] = [
  { key: 'map', label: 'Map', url: (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed` },
  { key: 'zillow', label: 'Zillow', url: (q) => `https://www.zillow.com/homes/${encodeURIComponent(q)}_rb/` },
  { key: 'earth', label: 'Google Earth', url: (q) => `https://earth.google.com/web/search/${encodeURIComponent(q)}` },
  { key: 'search', label: 'Google Search', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { key: 'assessor', label: 'County Assessor', url: (_q, a) => `https://www.google.com/search?q=${encodeURIComponent(`${a.city ?? ''} ${a.state ?? ''} county assessor property search`)}` },
];

export function ApplicantDrawer({ account: a }: { account: Account }) {
  const [open, setOpen] = useState(readLs(DRAWER_KEY) !== '0');
  const [fav, setFav] = useState(() => (readLs(FAV_KEY) ?? '').split(',').includes(a.id));
  const { settings } = useAppData();
  const { toast } = useFeedback();
  const quotes = useTable('quotes', { eq: { account_id: a.id } });
  const contacts = useTable('account_contacts', { eq: { account_id: a.id } });
  const drivers = useTable('drivers', { eq: { account_id: a.id } });
  // Co-applicant: the secondary contact, else a spouse on the driver list.
  const coContact = contacts.data.find((c) => c.is_secondary);
  const coDriver = drivers.data.find((d) => d.relationship === 'Spouse');
  const co = a.account_type === 'Commercial' ? null : coContact
    ? { name: `${coContact.first_name} ${coContact.last_name}`.trim(), first: coContact.first_name, last: coContact.last_name, relationship: coContact.relationship ?? 'Co-Applicant', email: coContact.email, phone: coContact.mobile_phone ?? coContact.phone }
    : coDriver ? { name: `${coDriver.first_name} ${coDriver.last_name}`, first: coDriver.first_name, last: coDriver.last_name, relationship: 'Spouse', email: null, phone: null } : null;
  const title = co ? (co.last === a.last_name ? `${a.first_name} & ${co.first} ${a.last_name}` : `${a.first_name} ${a.last_name} & ${co.name}`) : accountName(a);
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
        <div className="text-[14px] font-semibold text-brand-700 [writing-mode:vertical-rl] rotate-180 mb-6 whitespace-nowrap">{title}</div>
        <div className="flex flex-col items-center gap-4 mt-auto mb-4">{icons}</div>
        <button type="button" aria-label="Expand applicant panel" onClick={toggle} className="text-ink-600 hover:text-ink-900"><ChevronRight size={16} /></button>
      </aside>
    );
  }
  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-ink-200 px-3 py-3 text-[11.5px] text-ink-800 flex flex-col">
      <a href={href(`/accounts/${a.id}`)} className="text-[18px] font-bold uppercase text-brand-600 hover:underline leading-tight" data-testid="applicant-title">{title}</a>
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
          <ResearchLinks account={a} address={addr} className="mt-2 flex flex-col gap-2" />
        )}
      </div>
      <div className="mt-4">
        <div className="text-[13px] font-semibold text-ink-900">Applicant</div>
        <div>{a.first_name} {a.last_name}</div>
        <a href={`mailto:${a.email}`} className="text-brand-700 hover:underline break-all">{a.email}</a>
        {(a.mobile_phone || a.phone) && <div><span className="font-semibold">{a.mobile_phone ? 'Mobile' : 'Phone'}:</span> <a href={`tel:${a.mobile_phone || a.phone}`} className="text-brand-700 hover:underline">{fmtPhone(a.mobile_phone || a.phone)}</a></div>}
      </div>
      {co && (
        <div className="mt-4" data-testid="co-applicant">
          <div className="text-[13px] font-semibold text-ink-900">Co-Applicant</div>
          <div>{co.name.toUpperCase()}</div>
          <div className="text-ink-600">({co.relationship})</div>
          {co.email ? <a href={`mailto:${co.email}`} className="text-brand-700 hover:underline break-all">{co.email}</a> : <div className="text-ink-600">No email available</div>}
          {co.phone && <div><span className="font-semibold">Mobile:</span> {fmtPhone(co.phone)}</div>}
        </div>
      )}
      <div className="mt-4">
        <div className="text-[13px] font-semibold text-ink-900">Connected Apps</div>
        <div className="text-ink-600">Quickly access integrations related to this applicant.</div>
        <a href={href('/marketplace/mine')} className="mt-2 flex items-center justify-center gap-1.5 h-8 rounded border border-ink-300 text-brand-700 font-semibold hover:bg-brand-50"><Plug size={13} /> Integrations</a>
      </div>
      <button type="button" aria-label="Collapse applicant panel" onClick={toggle} className="mt-auto self-end pt-4 text-ink-600 hover:text-ink-900"><ChevronLeft size={16} /></button>
    </aside>
  );
}

/** Map / Zillow / Google Earth / Google Search / County Assessor links, each opening a preview with the property on file. */
export function ResearchLinks({ account: a, address, className }: { account: Account; address: string; className?: string }) {
  const [research, setResearch] = useState<(typeof RESEARCH)[number] | null>(null);
  const properties = useTable('properties', { eq: { account_id: a.id } });
  const addr = address;
  return (
    <>
      <div className={className}>
        {RESEARCH.map((r) => <button key={r.key} type="button" onClick={() => setResearch(r)} className="text-left text-brand-700 hover:underline inline-flex items-center gap-1">{r.label} <ExternalLink size={11} /></button>)}
      </div>
      {research && renderModal()}
    </>
  );

  function renderModal() {
    if (!research) return null;
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
  }
}
