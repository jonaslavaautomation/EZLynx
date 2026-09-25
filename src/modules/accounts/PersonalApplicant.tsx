import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Minus, Pencil, Plus, Trash2, User, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, LoadingBlock, Modal, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { fmtDate, fmtPhone, parseDate, toISODate, today } from '@/lib/format';
import { href, navigate } from '@/lib/router';
import { US_STATES, type Account, type AccountAddress, type AccountContact, type ContactEmail, type ContactPhone, type LineOfBusiness } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { useLabels, useLeadSourceOptions } from '@/modules/admin/integration';
import { LEAD_SOURCES } from '@/modules/accounts/AccountFormModal';
import { AssignUserModal, OField, OInput, OSelect, TextBtn, inputCls, type Level } from '@/modules/accounts/applicant-fields';
import {
  ADDRESS_TYPES_PL, APPLICANT_TYPES, CONTACT_METHODS, CONTACT_TIMES, DL_STATUSES, EDUCATION, EMAIL_TYPES, GENDERS, INDUSTRIES, LANGUAGES, MARITAL,
  NO_YEARS_OCCUPATIONS, PHONE_TYPES, PREFIXES, SUFFIXES,
} from '@/modules/accounts/personal-options';

/*
 * Personal Lines Applicant — the applicant details page staff fill in when creating (or editing) a personal
 * lines customer. Two levels of required fields, as in rating-focused agency systems:
 *   • "required to proceed" (red)  — First Name, Last Name, Address State. Save is blocked without them.
 *   • "required for rating" (amber) — Postal Code, Gender, DOB, Marital Status, Industry, Occupation, address
 *     details and a phone. Saving is allowed; the header shows an amber warning until they're complete.
 * The Address State / Postal Code in Applicant Info are the primary address's state and ZIP.
 */

// ── Form model ──

type Addr = {
  key: string; id?: string; address_type: string; street: string; unit: string; street2: string; city: string; state: string; county: string;
  zip: string; zip_suffix: string; years: string; months: string; is_primary: boolean; open: boolean;
};
type Extra = { key: string; id?: string; first_name: string; last_name: string; relationship: string; dob: string; email: string; phone: string; co_applicant: boolean; client_center: boolean };

type Form = {
  prefix: string; first_name: string; middle_initial: string; last_name: string; suffix: string; maiden_name: string; nickname: string;
  gender: string; dob: string; marital_status: string; ssn: string; ssn_last4: string; dl_number: string; dl_status: string; dl_state: string;
  education: string; industry: string; occupation: string; occupation_years: string; prior_employer_years: string; applicant_type: string;
  customer_since: string; account_name: string; producer: string | null; csr: string | null; lead_source: string; preferred_language: string;
  vip: boolean; labels: string[]; bridge_email: boolean; contact_method: string; contact_time: string;
};

const newAddr = (primary: boolean, state = ''): Addr => ({
  key: uuid(), address_type: primary ? 'Home' : 'Mailing', street: '', unit: '', street2: '', city: '', state, county: '', zip: '', zip_suffix: '',
  years: '', months: '', is_primary: primary, open: true,
});
const newExtra = (): Extra => ({ key: uuid(), first_name: '', last_name: '', relationship: 'Spouse', dob: '', email: '', phone: '', co_applicant: false, client_center: false });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, '');
const intOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Math.max(0, Math.round(Number(s))));
const n = (s: string) => s.trim() || null;

// ── Page ──

export function PersonalApplicant({ accountId }: { accountId?: string }) {
  const editing = !!accountId;
  const { me, settings } = useAppData();
  const { toast } = useFeedback();
  const labels = useLabels();
  const [loaded, setLoaded] = useState(!editing);
  const [prefillOpen, setPrefillOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);
  const [labelMenu, setLabelMenu] = useState(false);
  const [assign, setAssign] = useState<'producer' | 'csr' | null>(null);
  const [prefillInfo, setPrefillInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // Id of the account once it exists, so a retry after a later step fails updates it instead of inserting another.
  const savedId = useRef<string | null>(accountId ?? null);
  const [f, setF] = useState<Form>({
    prefix: '', first_name: '', middle_initial: '', last_name: '', suffix: '', maiden_name: '', nickname: '', gender: '', dob: '', marital_status: '',
    ssn: '', ssn_last4: '', dl_number: '', dl_status: 'Valid', dl_state: '', education: '', industry: '', occupation: '', occupation_years: '',
    prior_employer_years: '', applicant_type: 'Prospect/Lead', customer_since: today(), account_name: '', producer: me?.name ?? null, csr: me?.name ?? null,
    lead_source: '', preferred_language: 'English', vip: false, labels: [], bridge_email: false, contact_method: '', contact_time: '',
  });
  const [addrs, setAddrs] = useState<Addr[]>([newAddr(true, '')]);
  const [phones, setPhones] = useState<ContactPhone[]>([{ type: 'Mobile', number: '' }]);
  const [emails, setEmails] = useState<ContactEmail[]>([{ type: 'Primary', address: '' }]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [removedAddrIds, setRemovedAddrIds] = useState<string[]>([]);
  const [removedContactIds, setRemovedContactIds] = useState<string[]>([]);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const leadSources = useLeadSourceOptions(f.lead_source, LEAD_SOURCES);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  // Edit mode: load the applicant, their addresses and contacts.
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
      const industry = a.industry ?? '';
      setF({
        prefix: a.prefix ?? '', first_name: a.first_name, middle_initial: a.middle_initial ?? '', last_name: a.last_name, suffix: a.suffix ?? '',
        maiden_name: a.maiden_name ?? '', nickname: a.nickname ?? '', gender: a.gender ?? '', dob: a.dob ?? '', marital_status: a.marital_status ?? '',
        ssn: '', ssn_last4: a.ssn_last4 ?? '', dl_number: a.dl_number ?? '', dl_status: a.dl_status ?? 'Valid', dl_state: a.dl_state ?? '',
        education: a.education ?? '', industry, occupation: a.occupation ?? '', occupation_years: a.occupation_years?.toString() ?? '',
        prior_employer_years: a.prior_employer_years?.toString() ?? '',
        applicant_type: APPLICANT_TYPES.find((t) => t.status === a.status)?.label ?? 'Prospect/Lead', customer_since: a.customer_since ?? toISODate(parseDate(a.created_at) ?? new Date()),
        account_name: a.account_name ?? '', producer: a.producer, csr: a.csr, lead_source: a.lead_source ?? '', preferred_language: a.preferred_language ?? 'English',
        vip: a.vip ?? false, labels: a.labels ?? [], bridge_email: a.bridge_email ?? false, contact_method: a.contact_method ?? '', contact_time: a.contact_time ?? '',
      });
      const toAddr = (x: AccountAddress): Addr => ({
        key: uuid(), id: x.id, address_type: x.address_type, street: x.street, unit: x.unit ?? '', street2: x.street2 ?? '', city: x.city ?? '',
        state: x.state ?? '', county: x.county ?? '', zip: x.zip ?? '', zip_suffix: x.zip_suffix ?? '', years: x.years_at_address?.toString() ?? '',
        months: x.months_at_address?.toString() ?? '', is_primary: x.is_primary, open: x.is_primary,
      });
      setAddrs(ad.length ? ad.map(toAddr) : [{ ...newAddr(true, a.state ?? ''), street: a.address ?? '', city: a.city ?? '', zip: a.zip ?? '' }]);
      const ph = a.phones?.length ? a.phones : [a.mobile_phone && { type: 'Mobile', number: a.mobile_phone }, a.phone && { type: 'Home', number: a.phone }].filter(Boolean) as ContactPhone[];
      setPhones(ph.length ? ph : [{ type: 'Mobile', number: '' }]);
      setEmails(a.emails?.length ? a.emails : [{ type: 'Primary', address: a.email ?? '' }]);
      const primary = cs.find((c) => c.is_primary);
      setPrimaryContactId(primary?.id ?? null);
      setExtras(cs.filter((c) => !c.is_primary).map((c: AccountContact) => ({
        key: uuid(), id: c.id, first_name: c.first_name, last_name: c.last_name, relationship: c.relationship ?? '', dob: c.dob ?? '', email: c.email ?? '',
        phone: c.phone ?? '', co_applicant: c.is_secondary, client_center: c.client_center_access,
      })));
      setLoaded(true);
    })().catch(() => setLoaded(true));
    return () => { live = false; };
  }, [accountId]);

  const primary = addrs.find((a) => a.is_primary) ?? addrs[0];
  const setAddr = (key: string, patch: Partial<Addr>) => setAddrs((l) => l.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const setPrimaryField = (patch: Partial<Addr>) => primary && setAddr(primary.key, patch);
  const occupations = f.industry ? INDUSTRIES[f.industry] ?? [] : [];
  const noYears = NO_YEARS_OCCUPATIONS.includes(f.occupation);

  // Validation (live): "proceed" blocks saving; "rating" only warns.
  const issues = useMemo(() => {
    const m: Record<string, { level: Level; message: string }> = {};
    const proceed = (k: string, label: string) => { m[k] = { level: 'proceed', message: `${label} is required to proceed` }; };
    const rating = (k: string, message: string) => { m[k] = { level: 'rating', message }; };
    if (!f.first_name.trim()) proceed('first_name', 'First name');
    if (!f.last_name.trim()) proceed('last_name', 'Last name');
    if (!primary?.state) proceed('state', 'Address State');
    if (!/^\d{5}$/.test(primary?.zip ?? '')) rating('zip', 'Postal code is required for rating');
    if (!f.gender) rating('gender', 'Gender is required for rating');
    if (!f.dob) rating('dob', 'Date of birth is required for rating');
    else if (f.dob > today()) m.dob = { level: 'proceed', message: 'Date of birth cannot be in the future' };
    if (!f.marital_status) rating('marital_status', 'Marital Status is required for rating');
    if (!f.industry) rating('industry', 'Industry is required for rating');
    else if (!f.occupation) rating('occupation', 'Occupation is required for rating');
    if (f.ssn && digits(f.ssn).length !== 9) m.ssn = { level: 'proceed', message: 'SSN must be 9 digits' };
    if (!phones.some((p) => digits(p.number).length >= 10)) rating('phone', 'Phone number is required for rating');
    phones.forEach((p, i) => { if (p.number && digits(p.number).length < 10) m[`phone.${i}`] = { level: 'proceed', message: 'Enter a 10-digit phone number' }; });
    emails.forEach((e, i) => { if (e.address && !EMAIL_RE.test(e.address.trim())) m[`email.${i}`] = { level: 'proceed', message: 'Enter a valid email address' }; });
    addrs.forEach((a) => {
      if (!a.street.trim()) rating(`a.${a.key}.street`, 'Address is required for rating');
      if (!a.city.trim()) rating(`a.${a.key}.city`, 'City is required for rating');
      if (!a.county.trim()) rating(`a.${a.key}.county`, 'County is required for rating');
      if (a.zip && !/^\d{5}$/.test(a.zip)) m[`a.${a.key}.zip`] = { level: 'proceed', message: 'Postal code must be 5 digits' };
      if (a.zip_suffix && !/^\d{4}$/.test(a.zip_suffix)) m[`a.${a.key}.zip_suffix`] = { level: 'proceed', message: '4 digits' };
      if (a.is_primary && a.years === '') rating(`a.${a.key}.years`, 'Years at address is required for rating');
    });
    extras.forEach((x) => {
      if (!x.first_name.trim() || !x.last_name.trim()) m[`x.${x.key}`] = { level: 'proceed', message: 'Contact first and last name are required to proceed' };
      if (x.email && !EMAIL_RE.test(x.email.trim())) m[`x.${x.key}.email`] = { level: 'proceed', message: 'Enter a valid email address' };
      if (x.client_center && !x.email.trim()) m[`x.${x.key}.email`] = { level: 'proceed', message: 'Client Center access needs an email' };
    });
    return m;
  }, [f, primary, phones, emails, addrs, extras]);
  const err = (k: string) => issues[k];
  const proceedMissing = Object.values(issues).some((i) => i.level === 'proceed');
  const ratingMissing = Object.values(issues).some((i) => i.level === 'rating');

  const save = async (then: 'overview' | LineOfBusiness) => {
    if (saving.current) return;
    if (proceedMissing) {
      toast('Fix the fields marked in red before saving.', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const status = APPLICANT_TYPES.find((t) => t.label === f.applicant_type)?.status ?? 'Prospect';
      const cleanPhones = phones.filter((p) => digits(p.number).length >= 10).map((p) => ({ type: p.type, number: fmtPhone(p.number) }));
      const cleanEmails = emails.filter((e) => e.address.trim()).map((e) => ({ type: e.type, address: e.address.trim() }));
      const mobile = cleanPhones.find((p) => p.type === 'Mobile')?.number ?? null;
      const other = cleanPhones.find((p) => p.type !== 'Mobile')?.number ?? null;
      const ssnDigits = digits(f.ssn);
      const payload: Partial<Account> = {
        account_type: 'Personal', status, prefix: n(f.prefix), first_name: f.first_name.trim(), middle_initial: n(f.middle_initial.toUpperCase()),
        last_name: f.last_name.trim(), suffix: n(f.suffix), maiden_name: n(f.maiden_name), nickname: n(f.nickname), gender: n(f.gender), dob: n(f.dob),
        marital_status: n(f.marital_status), ssn_last4: ssnDigits.length === 9 ? ssnDigits.slice(-4) : n(f.ssn_last4),
        dl_number: n(f.dl_number), dl_status: n(f.dl_status), dl_state: n(f.dl_state), education: n(f.education), industry: n(f.industry),
        occupation: n(f.occupation), occupation_years: noYears ? null : intOrNull(f.occupation_years), prior_employer_years: noYears ? null : intOrNull(f.prior_employer_years),
        customer_since: n(f.customer_since), account_name: n(f.account_name), producer: f.producer, csr: f.csr, lead_source: n(f.lead_source),
        preferred_language: n(f.preferred_language), vip: f.vip, labels: f.labels, phones: cleanPhones, emails: cleanEmails,
        email: cleanEmails.find((e) => e.type === 'Primary')?.address ?? cleanEmails[0]?.address ?? '', phone: other ?? mobile, mobile_phone: mobile,
        bridge_email: f.bridge_email, contact_method: n(f.contact_method), contact_time: n(f.contact_time),
        address: primary ? [primary.street.trim(), primary.unit.trim() && `Unit ${primary.unit.trim()}`].filter(Boolean).join(', ') || null : null,
        city: primary ? n(primary.city) : null, state: primary ? n(primary.state) : null, zip: primary ? n(primary.zip) : null,
      };
      const account = savedId.current ? await db.update('accounts', savedId.current, payload) : await db.insert('accounts', { ...payload, notes: null, policy_type: null, business_name: null });
      savedId.current = account.id;

      // Addresses. Newly inserted child rows get their ids recorded so a retry updates them.
      for (const id of removedAddrIds) await db.remove('account_addresses', id);
      setRemovedAddrIds([]);
      for (const a of addrs.filter((x) => x.street.trim())) {
        const row = {
          account_id: account.id, address_type: a.address_type, street: a.street.trim(), unit: n(a.unit), street2: n(a.street2), city: n(a.city), state: n(a.state),
          county: n(a.county), zip: n(a.zip), zip_suffix: n(a.zip_suffix), years_at_address: intOrNull(a.years), months_at_address: intOrNull(a.months),
          is_primary: a.is_primary, country: a.address_type === 'Mailing' ? 'United States' : null,
        };
        if (a.id) await db.update('account_addresses', a.id, row);
        else { const saved = await db.insert('account_addresses', row); setAddr(a.key, { id: saved.id }); }
      }

      // Contacts: the applicant is the primary contact; extra contacts may be the co-applicant.
      const primaryRow = {
        account_id: account.id, first_name: account.first_name, last_name: account.last_name, email: n(account.email), phone: account.phone, mobile_phone: account.mobile_phone,
        dob: account.dob, relationship: 'Insured', is_primary: true, is_secondary: false,
      };
      if (primaryContactId) await db.update('account_contacts', primaryContactId, primaryRow);
      else setPrimaryContactId((await db.insert('account_contacts', { ...primaryRow, client_center_access: false })).id);
      for (const id of removedContactIds) await db.remove('account_contacts', id);
      setRemovedContactIds([]);
      for (const x of extras) {
        const row = {
          account_id: account.id, first_name: x.first_name.trim(), last_name: x.last_name.trim(), relationship: n(x.relationship), dob: n(x.dob), email: n(x.email),
          phone: n(fmtPhone(x.phone)), is_primary: false, is_secondary: x.co_applicant, client_center_access: x.client_center,
        };
        if (x.id) await db.update('account_contacts', x.id, row);
        else { const saved = await db.insert('account_contacts', row); setExtras((l) => l.map((e) => (e.key === x.key ? { ...e, id: saved.id } : e))); }
      }

      // Drivers: keep the named insured (and a new co-applicant) on the household.
      const drivers = await db.list('drivers', { eq: { account_id: account.id } });
      const insured = drivers.find((d) => d.relationship === 'Insured');
      const driverRow = { first_name: account.first_name, last_name: account.last_name, dob: account.dob, gender: account.gender, marital_status: account.marital_status, license_number: account.dl_number, license_state: account.dl_state ?? account.state };
      if (insured) await db.update('drivers', insured.id, driverRow);
      else await db.insert('drivers', { ...driverRow, account_id: account.id, relationship: 'Insured', violations: 0, accidents: 0 });
      const co = extras.find((x) => x.co_applicant);
      if (co && !drivers.some((d) => d.first_name === co.first_name.trim() && d.last_name === co.last_name.trim())) {
        await db.insert('drivers', { account_id: account.id, first_name: co.first_name.trim(), last_name: co.last_name.trim(), dob: n(co.dob), relationship: co.relationship || 'Spouse', license_state: account.state, violations: 0, accidents: 0, gender: null, marital_status: null, license_number: null });
      }

      if (!editing) { try { await enqueueAutomation('Applicant Created', { account_id: account.id }); } catch { /* automations never block saving */ } }
      toast(editing ? 'Applicant saved' : `${account.first_name} ${account.last_name} created`);
      if (then === 'overview') navigate(`/accounts/${account.id}`);
      else navigate(`/quotes/new?account=${account.id}&line=${encodeURIComponent(then)}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      saving.current = false;
      setBusy(false);
    }
  };

  const moveToPrevious = (a: Addr) => {
    // The client moved: keep this address as "Previous" and start a new primary address.
    setAddrs((l) => [newAddr(true, a.state), ...l.map((x) => (x.key === a.key ? { ...x, address_type: 'Previous', is_primary: false, open: false } : { ...x, is_primary: false }))]);
    toast('Moved to previous address — enter the new primary address', 'info');
  };
  const makePrimary = (a: Addr) => setAddrs((l) => l.map((x) => ({ ...x, is_primary: x.key === a.key })));
  const removeAddr = (a: Addr) => {
    if (a.id) setRemovedAddrIds((ids) => [...ids, a.id!]);
    setAddrs((l) => {
      const next = l.filter((x) => x.key !== a.key);
      if (next.length && !next.some((x) => x.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next.length ? next : [newAddr(true, a.state)];
    });
  };

  if (!loaded) return <LoadingBlock label="Loading applicant…" />;

  const headerIcon = proceedMissing ? <AlertTriangle size={20} className="text-red-600 fill-red-100" /> : ratingMissing ? <AlertTriangle size={20} className="text-amber-500 fill-amber-100" /> : <CheckCircle2 size={20} className="text-emerald-600" />;
  const summary = f.first_name || f.last_name ? `${f.last_name}${f.last_name && f.first_name ? ', ' : ''}${f.first_name}${f.dob ? `  DOB: ${fmtDate(f.dob)}` : ''}` : '';
  const labelById = new Map(labels.data.map((l) => [l.id, l]));

  return (
    <div className="-mx-5 -mt-4 sm:-mx-5">
      {/* Page title bar */}
      <div className="flex items-center gap-3 px-5 py-4 bg-[#f5f5f5] border-b border-ink-200">
        <User size={30} className="text-ink-500 fill-ink-400" />
        <h1 className="text-[22px] font-medium text-ink-900">Personal Lines Applicant</h1>
        {editing && <a href={href(`/accounts/${accountId}`)} className="ml-auto text-[13px] font-semibold">Back to overview</a>}
      </div>

      <div className="px-3 sm:px-5 py-4 space-y-4 pb-28">
        <section className="bg-white rounded shadow-card border border-ink-100">
          {/* Applicant Info header */}
          <button type="button" onClick={() => setInfoOpen(!infoOpen)} className="w-full flex items-center gap-2 px-6 py-5 bg-transparent text-left">
            {headerIcon}
            <span className="text-[15px] font-medium text-ink-900">Applicant Info</span>
            <span className="flex-1 text-center text-[14px] text-ink-600 truncate">{!infoOpen || summary ? summary : ''}</span>
            {infoOpen ? <ChevronUp size={20} className="text-ink-600" /> : <ChevronDown size={20} className="text-ink-600" />}
          </button>

          {infoOpen && (
            <div className="px-4 sm:px-6 pb-6">
              {/* Prefill */}
              <div className="border border-ink-200 rounded">
                <button type="button" onClick={() => setPrefillOpen(!prefillOpen)} className="w-full flex items-center justify-between px-6 py-4 bg-transparent text-left">
                  <span className="text-[15px] font-medium text-ink-900">Prefill Applicant Info</span>
                  {prefillOpen ? <ChevronUp size={18} className="text-ink-600" /> : <ChevronDown size={18} className="text-ink-600" />}
                </button>
                {prefillOpen && (
                  <>
                    <p className="px-6 pb-5 text-[15px] text-ink-700">Use prefill to instantly find an applicant&apos;s home or auto information just by using their name and address.</p>
                    <div className="flex flex-wrap items-center gap-6 px-6 py-5 border-t border-ink-200">
                      <TextBtn onClick={() => setPrefillInfo(true)}>Prefill home</TextBtn>
                      <a href={href('/support/kb')} className="inline-flex items-center gap-1.5 text-[14px] text-brand-600">Learn more about auto prefill <ExternalLink size={16} /></a>
                    </div>
                  </>
                )}
              </div>

              {/* VIP + labels */}
              <div className="relative flex flex-wrap items-center gap-3 mt-6 mb-7">
                <button type="button" role="switch" aria-checked={f.vip} aria-label="VIP" onClick={() => set('vip')(!f.vip)}
                  className={cx('relative w-9 h-5 rounded-full transition-colors', f.vip ? 'bg-brand-500' : 'bg-ink-300')}>
                  <span className={cx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all grid place-items-center', f.vip ? 'left-[18px]' : 'left-0.5')}>{!f.vip && <Minus size={10} className="text-ink-500" />}</span>
                </button>
                <span className="text-[14px] text-ink-900">VIP</span>
                <span className="text-[14px] text-ink-900 ml-4">Labels:</span>
                {f.labels.map((id) => labelById.get(id)).filter(Boolean).map((l) => (
                  <span key={l!.id} className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-ink-500 text-[13px] text-ink-800">{l!.name}</span>
                ))}
                {f.labels.length > 0
                  ? <button type="button" aria-label="Edit labels" onClick={() => setLabelMenu(!labelMenu)} className="bg-transparent text-ink-800"><Pencil size={18} /></button>
                  : <button type="button" onClick={() => setLabelMenu(!labelMenu)} className="inline-flex items-center gap-1.5 bg-transparent text-brand-600 text-[14px] font-semibold tracking-wide"><Plus size={16} /> Add label</button>}
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

              {/* Applicant fields — 4-column grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                <OSelect label="Prefix" value={f.prefix} onChange={set('prefix')} options={PREFIXES} />
                <OInput label="First Name" required="proceed" value={f.first_name} onChange={set('first_name')} level={err('first_name')?.level} message={err('first_name')?.message} />
                <OInput label="Middle Initial" value={f.middle_initial} onChange={(v) => set('middle_initial')(v.slice(0, 1))} maxLength={1} />
                <OInput label="Last Name" required="proceed" value={f.last_name} onChange={set('last_name')} level={err('last_name')?.level} message={err('last_name')?.message} />

                <OSelect label="Suffix" value={f.suffix} onChange={set('suffix')} options={SUFFIXES} />
                <div className="grid grid-cols-[1fr_minmax(0,0.85fr)] gap-2 min-w-0">
                  <OSelect label="Address State" required="proceed" value={primary?.state ?? ''} onChange={(v) => setPrimaryField({ state: v })} options={US_STATES} level={err('state')?.level} message={err('state')?.message && 'Address State is required to proceed'} />
                  <OInput label="Postal Code" required="rating" value={primary?.zip ?? ''} onChange={(v) => setPrimaryField({ zip: digits(v).slice(0, 5) })} inputMode="numeric" level={err('zip')?.level} message={err('zip')?.message} />
                </div>
                <OInput label="Maiden Name" value={f.maiden_name} onChange={set('maiden_name')} />
                <OInput label="Nickname" value={f.nickname} onChange={set('nickname')} />

                <OSelect label="Gender" required="rating" value={f.gender} onChange={set('gender')} options={GENDERS} level={err('gender')?.level} message={err('gender')?.message} />
                <OInput label="DOB" required="rating" type="date" max={today()} value={f.dob} onChange={set('dob')} level={err('dob')?.level} message={err('dob')?.message} action={<CalendarDays size={20} className="absolute right-3 pointer-events-none text-ink-600" />} />
                <OSelect label="Marital Status" required="rating" value={f.marital_status} onChange={set('marital_status')} options={MARITAL} level={err('marital_status')?.level} message={err('marital_status')?.message} />
                <OInput
                  label="SSN"
                  value={f.ssn}
                  onChange={(v) => { const d = digits(v).slice(0, 9); set('ssn')(d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }}
                  inputMode="numeric"
                  level={err('ssn')?.level}
                  message={err('ssn')?.message ?? (f.ssn_last4 && !f.ssn ? `On file: ***-**-${f.ssn_last4}` : 'Only the last 4 digits are stored')}
                />

                <OInput label="DL#" value={f.dl_number} onChange={(v) => set('dl_number')(v.toUpperCase())} />
                <OSelect label="DL Status" value={f.dl_status} onChange={set('dl_status')} options={DL_STATUSES} />
                <OSelect label="DL State" value={f.dl_state} onChange={set('dl_state')} options={US_STATES} />
                <OSelect label="Education" value={f.education} onChange={set('education')} options={EDUCATION} />

                <OSelect label="Industry" required="rating" value={f.industry} onChange={(v) => setF((s) => ({ ...s, industry: v, occupation: INDUSTRIES[v]?.length === 1 ? INDUSTRIES[v][0] : '' }))} options={Object.keys(INDUSTRIES)} level={err('industry')?.level} message={err('industry')?.message} />
                <div className="grid grid-cols-[1fr_96px] gap-2 min-w-0">
                  <OSelect label="Occupation" required="rating" value={f.occupation} onChange={set('occupation')} options={occupations} disabled={!f.industry} level={err('occupation')?.level} message={err('occupation')?.message} />
                  <OInput label="Years" value={f.occupation_years} onChange={(v) => set('occupation_years')(digits(v).slice(0, 2))} inputMode="numeric" disabled={!f.occupation || noYears} />
                </div>
                <OInput label="Prior Employer In Years" value={f.prior_employer_years} onChange={(v) => set('prior_employer_years')(digits(v).slice(0, 2))} inputMode="numeric" disabled={noYears} />
                <OSelect label="Applicant Type" value={f.applicant_type} onChange={set('applicant_type')} options={APPLICANT_TYPES.map((t) => t.label)} />

                <OInput label="Customer Since" type="date" max={today()} value={f.customer_since} onChange={set('customer_since')} action={<CalendarDays size={20} className="absolute right-3 pointer-events-none text-ink-600" />} />
                <OInput label="Account Name" value={f.account_name} onChange={set('account_name')} />
                <OField label="Assigned Producer" filled={!!f.producer} action={<button type="button" aria-label="Choose assigned producer" onClick={() => setAssign('producer')} className="absolute right-2 bg-transparent text-ink-900"><Users size={22} /></button>}>
                  <button type="button" onClick={() => setAssign('producer')} className={cx(inputCls, 'text-left pr-10 truncate')}>{f.producer ?? ''}</button>
                </OField>
                <OField label="CSR" filled={!!f.csr} action={<button type="button" aria-label="Choose CSR" onClick={() => setAssign('csr')} className="absolute right-2 bg-transparent text-ink-900"><Users size={22} /></button>}>
                  <button type="button" onClick={() => setAssign('csr')} className={cx(inputCls, 'text-left pr-10 truncate')}>{f.csr ?? ''}</button>
                </OField>

                <OSelect label="Lead source" value={f.lead_source} onChange={set('lead_source')} options={leadSources} />
                <OSelect label="Preferred Language" value={f.preferred_language} onChange={set('preferred_language')} options={LANGUAGES} />
              </div>

              {/* Contact Info */}
              <h2 className="text-[22px] font-medium text-ink-900 mt-12 mb-8">Contact Info</h2>

              <div className="space-y-4">
                {addrs.map((a) => {
                  const summaryLine = [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
                  const mapQ = a.street && a.city && a.state ? `${a.street}, ${a.city}, ${a.state} ${a.zip}` : '';
                  return (
                    <div key={a.key} className="border border-ink-200 rounded">
                      <button type="button" onClick={() => setAddr(a.key, { open: !a.open })} className="w-full flex items-center gap-2 px-6 py-4 bg-transparent text-left">
                        {a.is_primary ? <CheckCircle2 size={22} className="text-white fill-emerald-600" /> : <span className="w-[22px]" />}
                        <span className="text-[15px] font-medium text-ink-900">{a.is_primary ? 'Primary Address' : `${a.address_type} Address`}</span>
                        <span className="flex-1 text-center text-[14px] text-ink-600 truncate">{summaryLine}</span>
                        {a.open ? <ChevronUp size={18} className="text-ink-600" /> : <ChevronDown size={18} className="text-ink-600" />}
                      </button>
                      {a.open && (
                        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr_1fr] xl:grid-cols-[250px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.9fr)] gap-x-4 gap-y-5 px-6 pb-6">
                          <div className="space-y-5">
                            <OSelect label="Address Type" value={a.address_type} onChange={(v) => setAddr(a.key, { address_type: v })} options={ADDRESS_TYPES_PL} />
                          </div>
                          <div className="space-y-5 min-w-0">
                            <OInput label="Address" required="rating" value={a.street} onChange={(v) => setAddr(a.key, { street: v })} level={err(`a.${a.key}.street`)?.level} message={err(`a.${a.key}.street`)?.message} />
                            <OInput label="Address Line 2" value={a.street2} onChange={(v) => setAddr(a.key, { street2: v })} />
                            <OSelect label="State" required="rating" value={a.state} onChange={(v) => setAddr(a.key, { state: v })} options={US_STATES} />
                            <OInput label="Postal Code" required="rating" value={a.zip} onChange={(v) => setAddr(a.key, { zip: digits(v).slice(0, 5) })} inputMode="numeric" level={err(`a.${a.key}.zip`)?.level} message={err(`a.${a.key}.zip`)?.message} />
                            <OSelect label="Years At Address" required={a.is_primary ? 'rating' : undefined} value={a.years} onChange={(v) => setAddr(a.key, { years: v })} options={Array.from({ length: 51 }, (_, k) => String(k))} level={err(`a.${a.key}.years`)?.level} message={err(`a.${a.key}.years`)?.message} />
                          </div>
                          <div className="space-y-5 min-w-0">
                            <OInput label="Unit" value={a.unit} onChange={(v) => setAddr(a.key, { unit: v })} />
                            <OInput label="City" required="rating" value={a.city} onChange={(v) => setAddr(a.key, { city: v })} level={err(`a.${a.key}.city`)?.level} message={err(`a.${a.key}.city`)?.message} />
                            <OInput label="County" required="rating" value={a.county} onChange={(v) => setAddr(a.key, { county: v })} level={err(`a.${a.key}.county`)?.level} message={err(`a.${a.key}.county`)?.message} />
                            <OInput label="Postal Code Suffix" value={a.zip_suffix} onChange={(v) => setAddr(a.key, { zip_suffix: digits(v).slice(0, 4) })} inputMode="numeric" level={err(`a.${a.key}.zip_suffix`)?.level} message={err(`a.${a.key}.zip_suffix`)?.message} />
                            <OSelect label="Months At Address" value={a.months} onChange={(v) => setAddr(a.key, { months: v })} options={Array.from({ length: 12 }, (_, k) => String(k))} />
                          </div>
                          <div className="lg:col-span-3 xl:col-span-1 xl:row-span-1 min-h-[260px] rounded overflow-hidden border border-ink-100 bg-ink-50">
                            <iframe title={mapQ ? `Map of ${mapQ}` : 'Map of the United States'} className="w-full h-full min-h-[260px] border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQ || 'United States')}&z=${mapQ ? 15 : 4}&output=embed`} />
                          </div>
                          <div className="lg:col-span-3 xl:col-span-4 flex flex-wrap gap-3">
                            {a.is_primary && <TextBtn onClick={() => moveToPrevious(a)}>Move to previous address</TextBtn>}
                            {!a.is_primary && <TextBtn onClick={() => makePrimary(a)}>Make primary address</TextBtn>}
                            {addrs.length > 1 && <TextBtn onClick={() => removeAddr(a)} className="!text-ink-600"><Trash2 size={14} /> Remove address</TextBtn>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <TextBtn className="mt-6" onClick={() => setAddrs((l) => [...l.map((x) => ({ ...x, open: false })), { ...newAddr(false, primary?.state ?? settings?.state ?? ''), address_type: 'Mailing' }])}>Add address</TextBtn>

              {/* Phone / Email */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6 mt-10">
                <div>
                  <h3 className="text-[17px] text-ink-900 mb-5">Phone</h3>
                  <div className="space-y-4">
                    {phones.map((p, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <OSelect className="w-[154px] shrink-0" label="Phone Type" value={p.type} onChange={(v) => setPhones((l) => l.map((x, k) => (k === i ? { ...x, type: v } : x)))} options={PHONE_TYPES} />
                        <OInput className="flex-1" label="Phone Number" required={i === 0 ? 'rating' : undefined} type="tel" inputMode="tel" value={p.number}
                          onChange={(v) => setPhones((l) => l.map((x, k) => (k === i ? { ...x, number: v } : x)))}
                          level={i === 0 ? err('phone')?.level ?? err(`phone.${i}`)?.level : err(`phone.${i}`)?.level}
                          message={i === 0 ? err('phone')?.message ?? err(`phone.${i}`)?.message : err(`phone.${i}`)?.message} />
                        {phones.length > 1 && <button type="button" aria-label="Remove phone" onClick={() => setPhones((l) => l.filter((_, k) => k !== i))} className="mt-2 bg-transparent text-ink-900"><Trash2 size={20} /></button>}
                      </div>
                    ))}
                  </div>
                  <TextBtn className="mt-5" onClick={() => setPhones((l) => [...l, { type: 'Home', number: '' }])}>Add phone</TextBtn>
                </div>
                <div>
                  <h3 className="text-[17px] text-ink-900 mb-5">Email</h3>
                  <div className="space-y-4">
                    {emails.map((e, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <OSelect className="w-[154px] shrink-0" label="Email Type" value={e.type} onChange={(v) => setEmails((l) => l.map((x, k) => (k === i ? { ...x, type: v } : x)))} options={EMAIL_TYPES} />
                        <OInput className="flex-1" label="Email Address" type="email" inputMode="email" value={e.address} onChange={(v) => setEmails((l) => l.map((x, k) => (k === i ? { ...x, address: v } : x)))} level={err(`email.${i}`)?.level} message={err(`email.${i}`)?.message} />
                        <button type="button" aria-label="Remove email" onClick={() => setEmails((l) => (l.length > 1 ? l.filter((_, k) => k !== i) : [{ type: 'Primary', address: '' }]))} className="mt-2 bg-transparent text-ink-900"><Trash2 size={20} /></button>
                      </div>
                    ))}
                  </div>
                  <TextBtn className="mt-5" onClick={() => setEmails((l) => [...l, { type: 'Secondary', address: '' }])}>Add email</TextBtn>

                  <div className="mt-8">
                    <div className="text-[14px] text-ink-900 mb-3">Bridge email address to carriers when rating</div>
                    <div className="flex items-center gap-8 ml-2">
                      {[true, false].map((val) => (
                        <label key={String(val)} className="inline-flex items-center gap-3 text-[14px] cursor-pointer">
                          <input type="radio" name="bridge-email" className="w-5 h-5 accent-[#7c3aed]" checked={f.bridge_email === val} onChange={() => set('bridge_email')(val)} />
                          {val ? 'Yes' : 'No'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-5 mt-8">
                    <OSelect label="Contact Method" value={f.contact_method} onChange={set('contact_method')} options={CONTACT_METHODS} />
                    <OSelect label="Contact Time" value={f.contact_time} onChange={set('contact_time')} options={CONTACT_TIMES} />
                  </div>
                </div>
              </div>

              {/* Additional contacts */}
              {extras.length > 0 && (
                <div className="mt-10 space-y-4">
                  <h3 className="text-[17px] text-ink-900">Additional Contacts</h3>
                  {extras.map((x) => {
                    const setX = (patch: Partial<Extra>) => setExtras((l) => l.map((y) => (y.key === x.key ? { ...y, ...patch } : y)));
                    return (
                      <div key={x.key} className="border border-ink-200 rounded p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                          <OInput label="First Name" required="proceed" value={x.first_name} onChange={(v) => setX({ first_name: v })} level={!x.first_name.trim() ? 'proceed' : null} />
                          <OInput label="Last Name" required="proceed" value={x.last_name} onChange={(v) => setX({ last_name: v })} level={!x.last_name.trim() ? 'proceed' : null} />
                          <OSelect label="Relationship" value={x.relationship} onChange={(v) => setX({ relationship: v })} options={['Spouse', 'Domestic Partner', 'Child', 'Parent', 'Other']} />
                          <OInput label="DOB" type="date" max={today()} value={x.dob} onChange={(v) => setX({ dob: v })} />
                          <OInput label="Email Address" type="email" value={x.email} onChange={(v) => setX({ email: v })} level={err(`x.${x.key}.email`)?.level} message={err(`x.${x.key}.email`)?.message} />
                          <OInput label="Phone Number" type="tel" value={x.phone} onChange={(v) => setX({ phone: v })} />
                        </div>
                        {err(`x.${x.key}`) && <div className="text-[11px] text-red-600 mt-2">{err(`x.${x.key}`)!.message}</div>}
                        <div className="flex flex-wrap gap-3 mt-5">
                          <TextBtn onClick={() => setExtras((l) => l.map((y) => ({ ...y, co_applicant: y.key === x.key ? !y.co_applicant : false })))} className={cx(x.co_applicant && '!bg-brand-500 !text-white !border-brand-500')}>
                            {x.co_applicant ? 'Co-Applicant ✓' : 'Make this Contact Co-Applicant'}
                          </TextBtn>
                          <TextBtn onClick={() => setX({ client_center: !x.client_center })} className={cx(x.client_center && '!bg-brand-500 !text-white !border-brand-500')}>
                            {x.client_center ? 'Client Center Access ✓' : 'Client Center Access'}
                          </TextBtn>
                          <TextBtn onClick={() => { if (x.id) setRemovedContactIds((ids) => [...ids, x.id!]); setExtras((l) => l.filter((y) => y.key !== x.key)); }} className="!text-ink-600">
                            <Trash2 size={14} /> Remove contact
                          </TextBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-end -mt-1">
          <TextBtn onClick={() => { setInfoOpen(true); setExtras((l) => [...l, newExtra()]); }}>Add contact</TextBtn>
        </div>
      </div>

      {/* Footer action bar */}
      <div className="fixed bottom-7 left-[var(--sidebar-w)] right-[var(--notif-w,0px)] z-20 px-3 sm:px-5 pb-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 bg-white border border-ink-100 shadow-card rounded px-4 py-3">
          <Button variant="primary" loading={busy} onClick={() => save('overview')}>Save</Button>
          <TextBtn onClick={() => save('Personal Auto')}>Go to auto</TextBtn>
          <TextBtn onClick={() => save('Homeowners')}>Go to home</TextBtn>
          <TextBtn onClick={() => save('Dwelling Fire')}>Go to dwelling fire</TextBtn>
          {proceedMissing ? <span className="text-[12px] text-red-600 ml-auto">Complete the fields marked in red to save.</span>
            : ratingMissing ? <span className="text-[12px] text-amber-700 ml-auto">Some fields required for rating are still missing.</span> : null}
        </div>
      </div>

      {assign && (
        <AssignUserModal
          title={assign === 'producer' ? 'Assigned Producer' : 'CSR'}
          current={assign === 'producer' ? f.producer : f.csr}
          onAssign={(name) => set(assign)(name)}
          onClose={() => setAssign(null)}
        />
      )}

      {prefillInfo && (
        <Modal title="Prefill home" onClose={() => setPrefillInfo(false)} size="sm" footer={<>
          <Button variant="ghost" onClick={() => setPrefillInfo(false)}>Close</Button>
          <Button variant="primary" onClick={() => navigate('/marketplace')}>Browse prefill integrations</Button>
        </>}>
          <p className="text-[13px] text-ink-700">Prefill looks up the applicant&apos;s property and vehicles from a data provider using their name and address, then fills the home and auto details for you.</p>
          <p className="text-[13px] text-ink-700 mt-2">This training system has no live data provider connected, so enter the details manually on the <b>Drivers, Vehicles &amp; Property</b> tab after saving. Agencies activate a prefill provider from the Marketplace.</p>
        </Modal>
      )}
    </div>
  );
}
