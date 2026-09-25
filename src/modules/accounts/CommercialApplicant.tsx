import { AlertTriangle, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, LoadingBlock, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { fmtPhone, parseDate, toISODate, today } from '@/lib/format';
import { href, navigate } from '@/lib/router';
import { US_STATES, type Account, type AccountAddress, type AccountContact } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { useLabels, useLeadSourceOptions } from '@/modules/admin/integration';
import { LEAD_SOURCES } from '@/modules/accounts/AccountFormModal';
import { AssignUserModal, OField, OInput, OSelect, TextBtn, inputCls, type Level } from '@/modules/accounts/applicant-fields';
import { natureOfBusiness, searchNaics, type NaicsClass } from '@/modules/accounts/naics';
import { APPLICANT_TYPES, LANGUAGES } from '@/modules/accounts/personal-options';

/*
 * Commercial Applicant — business details page for creating (or editing) a commercial customer.
 * Business Name and the primary address (Address, City, State, Postal Code) are required to proceed; the
 * NAICS search fills the business classification used by submissions. "Create submission" saves and opens a
 * commercial quote for the business.
 */

const LEGAL_ENTITY_TYPES = ['Corporation', 'S Corporation', 'LLC', 'Partnership', 'Limited Partnership', 'Sole Proprietor', 'Joint Venture', 'Trust', 'Non-Profit', 'Government Entity', 'Other'];
const ADDRESS_TYPES_CL = ['Business', 'Mailing', 'Billing', 'Location', 'Garaging', 'Previous'];
const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Hot'];
const PROBABILITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => ({ value: String(n), label: `${n}%` }));
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Quoting', 'Proposal Sent', 'Negotiating', 'Won', 'Lost', 'Unresponsive'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i;
const digits = (s: string) => s.replace(/\D/g, '');
const n = (s: string) => s.trim() || null;
const intOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Math.max(0, Math.round(Number(s))));

type Addr = {
  key: string; id?: string; address_type: string; street: string; unit: string; street2: string; city: string; state: string; county: string;
  zip: string; zip_suffix: string; years: string; months: string; is_primary: boolean; open: boolean;
};
type Contact = {
  key: string; id?: string; first_name: string; last_name: string; title: string; email: string; phone: string;
  is_primary: boolean; is_secondary: boolean; client_center: boolean;
};

const newAddr = (primary: boolean, state = ''): Addr => ({
  key: uuid(), address_type: primary ? 'Business' : 'Mailing', street: '', unit: '', street2: '', city: '', state, county: '', zip: '', zip_suffix: '',
  years: '', months: '', is_primary: primary, open: true,
});
const newContact = (primary: boolean): Contact => ({ key: uuid(), first_name: '', last_name: '', title: '', email: '', phone: '', is_primary: primary, is_secondary: false, client_center: false });

/** Collapsible section card with a status icon and caret. */
function Section({ title, status, open, onToggle, summary, children, inset }: { title: string; status?: 'proceed' | 'rating' | 'ok'; open: boolean; onToggle: () => void; summary?: string; children: ReactNode; inset?: boolean }) {
  const icon = status === 'proceed' ? <AlertTriangle size={20} className="text-red-600 fill-red-100" /> : status === 'rating' ? <AlertTriangle size={20} className="text-amber-500 fill-amber-100" /> : status === 'ok' ? <CheckCircle2 size={20} className="text-white fill-emerald-600" /> : null;
  return (
    <section className={cx('bg-white rounded', inset ? 'border border-ink-200' : 'shadow-card border border-ink-100')}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center gap-2 px-6 py-4 bg-transparent text-left">
        {icon}
        <span className="text-[15px] font-medium text-ink-900">{title}</span>
        <span className="flex-1 text-center text-[14px] text-ink-600 truncate">{summary}</span>
        {open ? <ChevronUp size={18} className="text-ink-600" /> : <ChevronDown size={18} className="text-ink-600" />}
      </button>
      {open && <div className="px-4 sm:px-6 pb-6">{children}</div>}
    </section>
  );
}

function MapPanel({ query }: { query: string }) {
  // Interactive Google map (zoom / pan); shows the whole United States until an address is entered.
  const q = query || 'United States';
  return (
    <div className="min-h-[300px] h-full rounded overflow-hidden border border-ink-100 bg-ink-50">
      <iframe title={query ? `Map of ${query}` : 'Map of the United States'} className="w-full h-full min-h-[300px] border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
        src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${query ? 15 : 4}&output=embed`} />
    </div>
  );
}

/** NAICS search styled as an outlined field with a search icon. */
function NaicsSearch({ onPick }: { onPick: (c: NaicsClass) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchNaics(q), [q]);
  return (
    <div className="relative max-w-[744px]">
      <OField label="NAICS Code" filled={!!q} action={<Search size={20} className="absolute right-3 pointer-events-none text-ink-700" />}>
        <input aria-label="NAICS Code search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} className={cx(inputCls, 'pr-10')} />
      </OField>
      <div className="text-[12px] text-ink-800 mt-1 ml-3">This will auto-fill the classifications fields below</div>
      {open && q.trim() && (
        <div className="absolute z-30 left-0 right-0 top-11 bg-white border border-ink-100 rounded shadow-pop max-h-72 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400">No classes match. Try a broader word or a code.</div>}
          {results.map((c) => (
            <button key={c.naics} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setQ(''); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 bg-transparent border-b border-ink-50 last:border-0">
              <div className="text-[13px] font-semibold text-ink-900">{c.title}</div>
              <div className="text-[11px] text-ink-400">NAICS {c.naics} · SIC {c.sic} · {natureOfBusiness(c.naics)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommercialApplicant({ accountId }: { accountId?: string }) {
  const editing = !!accountId;
  const { me } = useAppData();
  const { toast } = useFeedback();
  const labels = useLabels();
  const [loaded, setLoaded] = useState(!editing);
  const [open, setOpen] = useState({ business: true, lead: true });
  const [labelMenu, setLabelMenu] = useState(false);
  const [assign, setAssign] = useState<'producer' | 'csr' | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // Id of the account once it exists, so a retry after a later step fails updates it instead of inserting another.
  const savedId = useRef<string | null>(accountId ?? null);
  const [f, setF] = useState({
    business_name: '', email: '', phone: '', phone_ext: '', fax: '', website: '', legal_entity_type: '', customer_since: today(), tax_id: '', gl_code: '',
    account_name: '', applicant_type: 'Prospect/Lead', date_business_started: '', preferred_language: 'English', vip: false, labels: [] as string[],
    naics_code: '', sic_code: '', nature_of_business: '', naics_description: '', operations_description: '',
    lead_source: '', lead_priority: '', probability_of_sale: '', lead_status: '', producer: me?.name ?? null as string | null, csr: me?.name ?? null as string | null,
  });
  const [addrs, setAddrs] = useState<Addr[]>([newAddr(true)]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [removedAddrIds, setRemovedAddrIds] = useState<string[]>([]);
  const [removedContactIds, setRemovedContactIds] = useState<string[]>([]);
  const leadSources = useLeadSourceOptions(f.lead_source, LEAD_SOURCES);
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    (async () => {
      const [a, ad, cs] = await Promise.all([
        db.get('accounts', accountId),
        db.list('account_addresses', { eq: { account_id: accountId }, order: { column: 'created_at' } }),
        db.list('account_contacts', { eq: { account_id: accountId }, order: { column: 'created_at' } }),
      ]);
      if (!live || !a) { setLoaded(true); return; }
      setF({
        business_name: a.business_name ?? '', email: a.email ?? '', phone: a.phone ?? '', phone_ext: a.phone_ext ?? '', fax: a.fax ?? '', website: a.website ?? '',
        legal_entity_type: a.legal_entity_type ?? '', customer_since: a.customer_since ?? toISODate(parseDate(a.created_at) ?? new Date()), tax_id: a.tax_id ?? '', gl_code: a.gl_code ?? '',
        account_name: a.account_name ?? '', applicant_type: APPLICANT_TYPES.find((t) => t.status === a.status)?.label ?? 'Prospect/Lead',
        date_business_started: a.date_business_started ?? '', preferred_language: a.preferred_language ?? 'English', vip: a.vip ?? false, labels: a.labels ?? [],
        naics_code: a.naics_code ?? '', sic_code: a.sic_code ?? '', nature_of_business: a.nature_of_business ?? '', naics_description: a.naics_description ?? '',
        operations_description: a.operations_description ?? '', lead_source: a.lead_source ?? '', lead_priority: a.lead_priority ?? '',
        probability_of_sale: a.probability_of_sale?.toString() ?? '', lead_status: a.lead_status ?? '', producer: a.producer, csr: a.csr,
      });
      const toAddr = (x: AccountAddress): Addr => ({
        key: uuid(), id: x.id, address_type: x.address_type, street: x.street, unit: x.unit ?? '', street2: x.street2 ?? '', city: x.city ?? '', state: x.state ?? '',
        county: x.county ?? '', zip: x.zip ?? '', zip_suffix: x.zip_suffix ?? '', years: x.years_at_address?.toString() ?? '', months: x.months_at_address?.toString() ?? '',
        is_primary: x.is_primary, open: x.is_primary,
      });
      setAddrs(ad.length ? ad.map(toAddr) : [{ ...newAddr(true, a.state ?? ''), street: a.address ?? '', city: a.city ?? '', zip: a.zip ?? '' }]);
      setContacts(cs.map((c: AccountContact) => ({
        key: uuid(), id: c.id, first_name: c.first_name, last_name: c.last_name, title: c.title ?? '', email: c.email ?? '', phone: c.phone ?? '',
        is_primary: c.is_primary, is_secondary: c.is_secondary, client_center: c.client_center_access,
      })));
      setLoaded(true);
    })().catch(() => setLoaded(true));
    return () => { live = false; };
  }, [accountId]);

  const primary = addrs.find((a) => a.is_primary) ?? addrs[0];
  const setAddr = (key: string, patch: Partial<Addr>) => setAddrs((l) => l.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const issues = useMemo(() => {
    const m: Record<string, { level: Level; message: string }> = {};
    const proceed = (k: string, message: string) => { m[k] = { level: 'proceed', message }; };
    if (!f.business_name.trim()) proceed('business_name', 'Business name is required to proceed');
    if (!primary?.state) proceed('state', 'Address State is required to proceed');
    if (f.email && !EMAIL_RE.test(f.email.trim())) proceed('email', 'Enter a valid email address');
    if (f.phone && digits(f.phone).length !== 10) proceed('phone', 'Enter a 10-digit phone number');
    if (f.fax && digits(f.fax).length !== 10) proceed('fax', 'Enter a 10-digit fax number');
    if (f.website && !URL_RE.test(f.website.trim())) proceed('website', 'Enter a valid website address');
    if (f.tax_id && digits(f.tax_id).length !== 9) proceed('tax_id', 'Tax ID (FEIN) must be 9 digits');
    if (f.date_business_started && f.date_business_started > today()) proceed('date_business_started', 'Date cannot be in the future');
    addrs.forEach((a) => {
      if (!a.street.trim()) proceed(`a.${a.key}.street`, 'Address Line #1 is required to proceed');
      if (!a.city.trim()) proceed(`a.${a.key}.city`, 'City is required to proceed');
      if (!a.state) proceed(`a.${a.key}.state`, 'State is required to proceed');
      if (!/^\d{5}$/.test(a.zip)) proceed(`a.${a.key}.zip`, 'Postal code is required to proceed');
      if (a.zip_suffix && !/^\d{4}$/.test(a.zip_suffix)) proceed(`a.${a.key}.zip_suffix`, '4 digits');
    });
    contacts.forEach((c) => {
      if (!c.first_name.trim() || !c.last_name.trim()) proceed(`c.${c.key}`, 'Contact first and last name are required to proceed');
      if (c.email && !EMAIL_RE.test(c.email.trim())) proceed(`c.${c.key}.email`, 'Enter a valid email address');
      if (c.client_center && !c.email.trim()) proceed(`c.${c.key}.email`, 'Client Center access needs an email');
    });
    return m;
  }, [f, primary, addrs, contacts]);
  const err = (k: string) => issues[k];
  const businessIssues = ['business_name', 'state', 'email', 'phone', 'fax', 'website', 'tax_id', 'date_business_started'].some((k) => issues[k]);
  const addrStatus = (a: Addr) => (Object.keys(issues).some((k) => k.startsWith(`a.${a.key}.`)) ? 'rating' : 'ok');
  const anyIssue = Object.keys(issues).length > 0;

  const save = async (then: 'overview' | 'submission') => {
    if (saving.current) return;
    if (anyIssue) {
      toast('Fix the fields marked in red before saving.', 'error');
      setOpen({ business: true, lead: true });
      setAddrs((l) => l.map((a) => (Object.keys(issues).some((k) => k.startsWith(`a.${a.key}.`)) ? { ...a, open: true } : a)));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const pc = contacts.find((c) => c.is_primary);
      const payload: Partial<Account> = {
        account_type: 'Commercial', status: APPLICANT_TYPES.find((t) => t.label === f.applicant_type)?.status ?? 'Prospect',
        business_name: f.business_name.trim(), first_name: pc?.first_name.trim() || f.business_name.trim(), last_name: pc?.last_name.trim() ?? '',
        email: f.email.trim(), phone: n(fmtPhone(f.phone)), phone_ext: n(f.phone_ext), fax: n(fmtPhone(f.fax)), website: n(f.website),
        legal_entity_type: n(f.legal_entity_type), customer_since: n(f.customer_since), tax_id: f.tax_id ? `${digits(f.tax_id).slice(0, 2)}-${digits(f.tax_id).slice(2)}` : null,
        gl_code: n(f.gl_code), account_name: n(f.account_name), date_business_started: n(f.date_business_started), preferred_language: n(f.preferred_language),
        vip: f.vip, labels: f.labels, naics_code: n(f.naics_code), sic_code: n(f.sic_code), nature_of_business: n(f.nature_of_business),
        naics_description: n(f.naics_description), operations_description: n(f.operations_description), lead_source: n(f.lead_source),
        lead_priority: n(f.lead_priority), probability_of_sale: intOrNull(f.probability_of_sale), lead_status: n(f.lead_status), producer: f.producer, csr: f.csr,
        address: primary ? [primary.street.trim(), primary.unit.trim() && `Unit ${primary.unit.trim()}`].filter(Boolean).join(', ') : null,
        city: primary ? n(primary.city) : null, state: primary ? n(primary.state) : null, zip: primary ? n(primary.zip) : null, policy_type: 'Commercial',
      };
      const account = savedId.current ? await db.update('accounts', savedId.current, payload) : await db.insert('accounts', { ...payload, notes: null });
      savedId.current = account.id;

      // Newly inserted child rows get their ids recorded so a retry updates them.
      for (const id of removedAddrIds) await db.remove('account_addresses', id);
      setRemovedAddrIds([]);
      for (const a of addrs) {
        const row = {
          account_id: account.id, address_type: a.address_type, street: a.street.trim(), unit: n(a.unit), street2: n(a.street2), city: n(a.city), state: n(a.state),
          county: n(a.county), zip: n(a.zip), zip_suffix: n(a.zip_suffix), years_at_address: intOrNull(a.years), months_at_address: intOrNull(a.months),
          is_primary: a.is_primary, country: a.address_type === 'Mailing' ? 'United States' : null,
        };
        if (a.id) await db.update('account_addresses', a.id, row);
        else { const saved = await db.insert('account_addresses', row); setAddr(a.key, { id: saved.id }); }
      }
      for (const id of removedContactIds) await db.remove('account_contacts', id);
      setRemovedContactIds([]);
      for (const c of contacts) {
        const row = {
          account_id: account.id, first_name: c.first_name.trim(), last_name: c.last_name.trim(), title: n(c.title), email: n(c.email), phone: n(fmtPhone(c.phone)),
          is_primary: c.is_primary, is_secondary: !c.is_primary && c.is_secondary, client_center_access: c.client_center, relationship: c.is_primary ? 'Owner' : null,
        };
        if (c.id) await db.update('account_contacts', c.id, row);
        else { const saved = await db.insert('account_contacts', row); setContacts((l) => l.map((y) => (y.key === c.key ? { ...y, id: saved.id } : y))); }
      }
      if (!editing) { try { await enqueueAutomation('Applicant Created', { account_id: account.id }); } catch { /* automations never block saving */ } }
      toast(editing ? 'Applicant saved' : `${account.business_name} created`);
      if (then === 'overview') navigate(`/accounts/${account.id}`);
      else navigate(`/quotes/new?account=${account.id}&line=${encodeURIComponent('General Liability')}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      saving.current = false;
      setBusy(false);
    }
  };

  if (!loaded) return <LoadingBlock label="Loading applicant…" />;
  const labelById = new Map(labels.data.map((l) => [l.id, l]));
  const pickClass = (c: NaicsClass) => setF((s) => ({ ...s, naics_code: c.naics, sic_code: c.sic, nature_of_business: natureOfBusiness(c.naics), naics_description: c.title }));

  return (
    <div className="-mx-5 -mt-4">
      <div className="flex items-center gap-3 px-5 py-4 bg-[#f5f5f5] border-b border-ink-200">
        <Building2 size={30} className="text-ink-500" />
        <h1 className="text-[22px] font-medium text-ink-900">Commercial Applicant</h1>
        {editing && <a href={href(`/accounts/${accountId}`)} className="ml-auto text-[13px] font-semibold">Back to overview</a>}
      </div>

      <div className="px-3 sm:px-5 py-4 space-y-4 pb-28">
        <Section title="Business Info" status={businessIssues ? 'proceed' : 'ok'} open={open.business} onToggle={() => setOpen((o) => ({ ...o, business: !o.business }))} summary={!open.business ? f.business_name : ''}>
          {/* VIP + labels */}
          <div className="relative flex flex-wrap items-center gap-3 mb-7">
            <button type="button" role="switch" aria-checked={f.vip} aria-label="VIP" onClick={() => set('vip')(!f.vip)} className={cx('relative w-9 h-5 rounded-full transition-colors', f.vip ? 'bg-brand-500' : 'bg-ink-300')}>
              <span className={cx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all grid place-items-center', f.vip ? 'left-[18px]' : 'left-0.5')}>{!f.vip && <Minus size={10} className="text-ink-500" />}</span>
            </button>
            <span className="text-[14px] text-ink-900">VIP</span>
            <span className="text-[14px] text-ink-900 ml-4">Labels:</span>
            {f.labels.map((id) => labelById.get(id)).filter(Boolean).map((l) => <span key={l!.id} className="inline-flex items-center h-7 px-3 rounded-full border border-ink-500 text-[13px] text-ink-800">{l!.name}</span>)}
            <button type="button" onClick={() => setLabelMenu(!labelMenu)} className="inline-flex items-center gap-1.5 bg-transparent text-brand-600 text-[14px] font-semibold tracking-wide"><Plus size={16} /> {f.labels.length ? 'Edit labels' : 'Add label'}</button>
            {labelMenu && (
              <div className="absolute z-30 top-9 left-40 w-64 bg-white border border-ink-100 rounded shadow-pop py-1">
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Labels <button type="button" aria-label="Close" onClick={() => setLabelMenu(false)} className="bg-transparent"><X size={14} /></button></div>
                {labels.data.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-500">No labels yet. <a href={href('/admin/labels')}>Manage labels</a></div>}
                {labels.data.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-ink-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={f.labels.includes(l.id)} onChange={(e) => set('labels')(e.target.checked ? [...f.labels, l.id] : f.labels.filter((x) => x !== l.id))} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
            <OInput label="Business Name" required="proceed" value={f.business_name} onChange={set('business_name')} level={err('business_name')?.level} message={err('business_name')?.message} />
            <OInput label="Email" type="email" inputMode="email" value={f.email} onChange={set('email')} level={err('email')?.level} message={err('email')?.message} />
            <OInput label="Business Phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} level={err('phone')?.level} message={err('phone')?.message} />
            <OInput label="Ext." value={f.phone_ext} onChange={(v) => set('phone_ext')(digits(v).slice(0, 6))} inputMode="numeric" />

            <OInput label="Business Fax" type="tel" inputMode="tel" value={f.fax} onChange={set('fax')} level={err('fax')?.level} message={err('fax')?.message} />
            <OInput label="Website URL" value={f.website} onChange={set('website')} level={err('website')?.level} message={err('website')?.message} />
            <OSelect label="Legal Entity Type" value={f.legal_entity_type} onChange={set('legal_entity_type')} options={LEGAL_ENTITY_TYPES} />
            <OInput label="Customer Since" type="date" max={today()} value={f.customer_since} onChange={set('customer_since')} action={<CalendarDays size={20} className="absolute right-3 pointer-events-none text-ink-600" />} />

            <OInput label="Tax ID" value={f.tax_id} onChange={(v) => { const d = digits(v).slice(0, 9); set('tax_id')(d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d); }} inputMode="numeric" level={err('tax_id')?.level} message={err('tax_id')?.message} />
            <OSelect label="Address State" required="proceed" value={primary?.state ?? ''} onChange={(v) => primary && setAddr(primary.key, { state: v })} options={US_STATES} level={err('state')?.level} message={err('state')?.message} />
            <OInput label="GL Code" value={f.gl_code} onChange={set('gl_code')} />
            <OInput label="Account Name" value={f.account_name} onChange={set('account_name')} />

            <OSelect label="Account Type" value={f.applicant_type} onChange={set('applicant_type')} options={APPLICANT_TYPES.map((t) => t.label)} />
            <OInput label="Date Business Started" type="date" max={today()} value={f.date_business_started} onChange={set('date_business_started')} level={err('date_business_started')?.level} message={err('date_business_started')?.message} action={<CalendarDays size={20} className="absolute right-3 pointer-events-none text-ink-600" />} />
            <OSelect label="Preferred Language" value={f.preferred_language} onChange={set('preferred_language')} options={LANGUAGES} />
          </div>

          {/* Business Classification */}
          <h3 className="text-[15px] text-ink-900 mt-9 mb-5">Business Classification</h3>
          <NaicsSearch onPick={pickClass} />
          <dl className="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 mt-5">
            {([['NAICS Code', f.naics_code], ['SIC Code', f.sic_code], ['Nature of Business', f.nature_of_business], ['NAICS Description', f.naics_description]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-[12px] text-ink-900">{k}</dt><dd className="text-[13px] text-ink-700 mt-1">{v || '--'}</dd></div>
            ))}
          </dl>
          <div className="mt-5 max-w-[300px] sm:max-w-[330px]">
            <label className="relative block rounded border border-ink-300 focus-within:border-brand-500">
              <span className="sr-only">Description of Primary Operations</span>
              <textarea value={f.operations_description} onChange={(e) => set('operations_description')(e.target.value)} placeholder="Description of Primary Operations" rows={2} className="w-full bg-transparent outline-none px-3 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 resize-y rounded" />
            </label>
          </div>

          {/* Addresses */}
          <div className="mt-9 space-y-4">
            {addrs.map((a) => {
              const summary = [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
              const mapQ = a.street && a.city && a.state ? `${a.street}, ${a.city}, ${a.state} ${a.zip}` : a.city && a.state ? `${a.city}, ${a.state}` : '';
              return (
                <Section key={a.key} inset title={a.is_primary ? 'Primary Address' : `${a.address_type} Address`} status={addrStatus(a)} open={a.open} onToggle={() => setAddr(a.key, { open: !a.open })} summary={summary}>
                  <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.9fr)] gap-x-4 gap-y-5">
                    <div><OSelect label="Address Type" value={a.address_type} onChange={(v) => setAddr(a.key, { address_type: v })} options={ADDRESS_TYPES_CL} /></div>
                    <div className="space-y-5 min-w-0">
                      <OInput label="Address" required="proceed" value={a.street} onChange={(v) => setAddr(a.key, { street: v })} level={err(`a.${a.key}.street`)?.level} message={err(`a.${a.key}.street`)?.message} />
                      <OInput label="Address Line 2" value={a.street2} onChange={(v) => setAddr(a.key, { street2: v })} />
                      <OSelect label="State" required="proceed" value={a.state} onChange={(v) => setAddr(a.key, { state: v })} options={US_STATES} level={err(`a.${a.key}.state`)?.level} message={err(`a.${a.key}.state`)?.message} />
                      <OInput label="Postal Code" required="proceed" value={a.zip} onChange={(v) => setAddr(a.key, { zip: digits(v).slice(0, 5) })} inputMode="numeric" level={err(`a.${a.key}.zip`)?.level} message={err(`a.${a.key}.zip`)?.message} />
                      <OSelect label="Years At Address" value={a.years} onChange={(v) => setAddr(a.key, { years: v })} options={Array.from({ length: 51 }, (_, k) => String(k))} />
                    </div>
                    <div className="space-y-5 min-w-0">
                      <OInput label="Unit" value={a.unit} onChange={(v) => setAddr(a.key, { unit: v })} />
                      <OInput label="City" required="proceed" value={a.city} onChange={(v) => setAddr(a.key, { city: v })} level={err(`a.${a.key}.city`)?.level} message={err(`a.${a.key}.city`)?.message} />
                      <OInput label="County" value={a.county} onChange={(v) => setAddr(a.key, { county: v })} />
                      <OInput label="Postal Code Suffix" value={a.zip_suffix} onChange={(v) => setAddr(a.key, { zip_suffix: digits(v).slice(0, 4) })} inputMode="numeric" level={err(`a.${a.key}.zip_suffix`)?.level} message={err(`a.${a.key}.zip_suffix`)?.message} />
                      <OSelect label="Months At Address" value={a.months} onChange={(v) => setAddr(a.key, { months: v })} options={Array.from({ length: 12 }, (_, k) => String(k))} />
                    </div>
                    <div className="lg:col-span-3 xl:col-span-1"><MapPanel query={mapQ} /></div>
                    {(addrs.length > 1 || !a.is_primary) && (
                      <div className="lg:col-span-3 xl:col-span-4 flex flex-wrap gap-3">
                        {!a.is_primary && <TextBtn onClick={() => setAddrs((l) => l.map((x) => ({ ...x, is_primary: x.key === a.key })))}>Make primary address</TextBtn>}
                        <TextBtn className="!text-ink-600" onClick={() => {
                          if (a.id) setRemovedAddrIds((ids) => [...ids, a.id!]);
                          setAddrs((l) => { const next = l.filter((x) => x.key !== a.key); if (next.length && !next.some((x) => x.is_primary)) next[0] = { ...next[0], is_primary: true }; return next.length ? next : [newAddr(true)]; });
                        }}><Trash2 size={14} /> Remove address</TextBtn>
                      </div>
                    )}
                  </div>
                </Section>
              );
            })}
          </div>
          <TextBtn className="mt-5" onClick={() => setAddrs((l) => [...l.map((x) => ({ ...x, open: false })), newAddr(false, primary?.state ?? '')])}>Add address</TextBtn>
        </Section>

        {/* Lead Info */}
        <Section title="Lead Info" status="ok" open={open.lead} onToggle={() => setOpen((o) => ({ ...o, lead: !o.lead }))}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
            <OSelect label="Lead Source" value={f.lead_source} onChange={set('lead_source')} options={leadSources} />
            <OSelect label="Lead Priority" value={f.lead_priority} onChange={set('lead_priority')} options={LEAD_PRIORITIES} />
            <OSelect label="Probability of Sale" value={f.probability_of_sale} onChange={set('probability_of_sale')} options={PROBABILITIES} />
            <OSelect label="Lead Status" value={f.lead_status} onChange={set('lead_status')} options={LEAD_STATUSES} />
            <OField label="Assigned Producer" filled={!!f.producer} action={<button type="button" aria-label="Choose assigned producer" onClick={() => setAssign('producer')} className="absolute right-2 bg-transparent text-ink-900"><PeopleIcon /></button>}>
              <button type="button" onClick={() => setAssign('producer')} className={cx(inputCls, 'text-left pr-10 truncate')}>{f.producer ?? ''}</button>
            </OField>
            <OField label="CSR" filled={!!f.csr} action={<button type="button" aria-label="Choose CSR" onClick={() => setAssign('csr')} className="absolute right-2 bg-transparent text-ink-900"><PeopleIcon /></button>}>
              <button type="button" onClick={() => setAssign('csr')} className={cx(inputCls, 'text-left pr-10 truncate')}>{f.csr ?? ''}</button>
            </OField>
          </div>
        </Section>

        {/* Contacts */}
        {contacts.length > 0 && (
          <Section title="Contacts" status={contacts.some((c) => issues[`c.${c.key}`] || issues[`c.${c.key}.email`]) ? 'proceed' : 'ok'} open onToggle={() => { /* always open while editing contacts */ }}>
            <div className="space-y-4">
              {contacts.map((c) => {
                const setC = (patch: Partial<Contact>) => setContacts((l) => l.map((y) => (y.key === c.key ? { ...y, ...patch } : y)));
                return (
                  <div key={c.key} className="border border-ink-200 rounded p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                      <OInput label="First Name" required="proceed" value={c.first_name} onChange={(v) => setC({ first_name: v })} level={!c.first_name.trim() ? 'proceed' : null} />
                      <OInput label="Last Name" required="proceed" value={c.last_name} onChange={(v) => setC({ last_name: v })} level={!c.last_name.trim() ? 'proceed' : null} />
                      <OInput label="Title" value={c.title} onChange={(v) => setC({ title: v })} />
                      <OInput label="Phone Number" type="tel" value={c.phone} onChange={(v) => setC({ phone: v })} />
                      <OInput label="Email Address" type="email" value={c.email} onChange={(v) => setC({ email: v })} level={err(`c.${c.key}.email`)?.level} message={err(`c.${c.key}.email`)?.message} className="sm:col-span-2" />
                    </div>
                    {err(`c.${c.key}`) && <div className="text-[11px] text-red-600 mt-2">{err(`c.${c.key}`)!.message}</div>}
                    <div className="flex flex-wrap gap-3 mt-5">
                      <TextBtn onClick={() => setContacts((l) => l.map((y) => ({ ...y, is_primary: y.key === c.key, is_secondary: y.key === c.key ? false : y.is_secondary })))} className={cx(c.is_primary && '!bg-brand-500 !text-white !border-brand-500')}>
                        {c.is_primary ? 'Primary Contact ✓' : 'Make this Contact Primary'}
                      </TextBtn>
                      {!c.is_primary && (
                        <TextBtn onClick={() => setC({ is_secondary: !c.is_secondary })} className={cx(c.is_secondary && '!bg-brand-500 !text-white !border-brand-500')}>
                          {c.is_secondary ? 'Secondary ✓' : 'Make this Contact Secondary'}
                        </TextBtn>
                      )}
                      <TextBtn onClick={() => setC({ client_center: !c.client_center })} className={cx(c.client_center && '!bg-brand-500 !text-white !border-brand-500')}>
                        {c.client_center ? 'Client Center Access ✓' : 'Client Center Access'}
                      </TextBtn>
                      <TextBtn className="!text-ink-600" onClick={() => {
                        if (c.id) setRemovedContactIds((ids) => [...ids, c.id!]);
                        setContacts((l) => { const next = l.filter((y) => y.key !== c.key); if (next.length && !next.some((y) => y.is_primary)) next[0] = { ...next[0], is_primary: true, is_secondary: false }; return next; });
                      }}><Trash2 size={14} /> Remove contact</TextBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <div className="flex justify-end">
          <TextBtn onClick={() => setContacts((l) => [...l, newContact(l.length === 0)])}>Add contact</TextBtn>
        </div>
      </div>

      <div className="fixed bottom-7 left-[var(--sidebar-w)] right-[var(--notif-w,0px)] z-20 px-3 sm:px-5 pb-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 bg-white border border-ink-100 shadow-card rounded px-4 py-3">
          <Button variant="primary" loading={busy} onClick={() => save('overview')}>Save</Button>
          <TextBtn onClick={() => save('submission')}>Create submission</TextBtn>
          {anyIssue && <span className="text-[12px] text-red-600 ml-auto">Complete the fields marked in red to save.</span>}
        </div>
      </div>

      {assign && (
        <AssignUserModal title={assign === 'producer' ? 'Assigned Producer' : 'CSR'} current={assign === 'producer' ? f.producer : f.csr} onAssign={(name) => set(assign)(name)} onClose={() => setAssign(null)} />
      )}
    </div>
  );
}

const PeopleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);
