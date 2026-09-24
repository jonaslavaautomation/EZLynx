import { Building2, Check, MapPin, Plus, Search, Star, Trash2, User, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StaffSelect } from '@/components/pickers';
import { Button, ErrorBanner, Field, Input, PageHeader, Select, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { fmtPhone, today } from '@/lib/format';
import { href, navigate } from '@/lib/router';
import { ADDRESS_TYPES, US_STATES, type AccountStatus, type AccountType } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { useLeadSourceOptions } from '@/modules/admin/integration';
import { LEAD_SOURCES } from '@/modules/accounts/AccountFormModal';
import { natureOfBusiness, searchNaics, type NaicsClass } from '@/modules/accounts/naics';

/*
 * Create New Applicant / Create Commercial Applicant.
 * Mirrors the customer-account workflow agency staff are trained on:
 *  - Account Details: Account Type (Lead / Active Client / Inactive Client — used for reporting), Customer Since,
 *    Lead Source, and the assigned Producer & CSR (default: the user creating the account).
 *  - Commercial accounts start with Business Classification (NAICS lookup → NAICS, SIC, Nature of Business,
 *    NAICS Description, plus a free-text Description of Primary Operations). Business Name pre-fills ACORD forms.
 *  - Addresses: a primary address is required (used for quoting and reports); "Add Address" stores more.
 *    Only Mailing addresses show a Country field.
 *  - Contacts: the primary contact is the named insured. Personal accounts can mark one contact as Co-Applicant;
 *    commercial accounts mark contacts Primary / Secondary. A non-primary commercial contact can have its own
 *    address. Client Center Access flags customer-portal access.
 *  - "Done" saves everything and opens the new applicant's Overview.
 */

type Addr = { key: string; address_type: string; street: string; street2: string; city: string; state: string; zip: string; country: string; is_primary: boolean };
type Contact = {
  key: string; first_name: string; last_name: string; title: string; relationship: string; email: string; phone: string; mobile_phone: string; dob: string;
  is_primary: boolean; is_secondary: boolean; client_center_access: boolean; own_address: boolean; address: string; city: string; state: string; zip: string;
};

const ACCOUNT_TYPES: { value: AccountStatus; label: string }[] = [
  { value: 'Prospect', label: 'Lead' },
  { value: 'Active', label: 'Active Client' },
  { value: 'Inactive', label: 'Inactive Client' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

const newAddr = (primary: boolean, state = 'TX'): Addr => ({ key: uuid(), address_type: 'Mailing', street: '', street2: '', city: '', state, zip: '', country: 'United States', is_primary: primary });
const newContact = (primary: boolean): Contact => ({
  key: uuid(), first_name: '', last_name: '', title: '', relationship: primary ? 'Insured' : '', email: '', phone: '', mobile_phone: '', dob: '',
  is_primary: primary, is_secondary: false, client_center_access: false, own_address: false, address: '', city: '', state: 'TX', zip: '',
});

function Card({ title, icon, children, action, subtitle }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode; subtitle?: string }) {
  return (
    <section className="bg-white border border-[#e3e3e3] rounded shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-ink-800 text-white rounded-t">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/80">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {subtitle && <div className="text-[11px] text-white/60">{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Toggle-style button used for the contact role actions. */
function RoleButton({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={cx('inline-flex items-center gap-1.5 h-8 px-3 rounded border text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-200 text-ink-700 hover:border-brand-300 hover:text-brand-700')}
    >
      {on ? <Check size={13} /> : null}{children}
    </button>
  );
}

export function NaicsLookup({ onPick }: { onPick: (c: NaicsClass) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchNaics(q), [q]);
  return (
    <div className="relative">
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by business type, keyword or code (e.g. landscaping, 722511)"
        className="pl-8"
        aria-label="NAICS code search"
      />
      {open && q.trim() && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-ink-100 rounded shadow-pop max-h-72 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400">No classes match. Try a broader word, or enter the codes below.</div>}
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

const ReadOnly = ({ label, value }: { label: string; value: string }) => (
  <Field label={label}><Input value={value} readOnly tabIndex={-1} className="bg-ink-50 text-ink-700" placeholder="Auto-filled from search" /></Field>
);

export function CreateApplicant({ type }: { type: AccountType }) {
  const { me, settings } = useAppData();
  const { toast } = useFeedback();
  const commercial = type === 'Commercial';
  const defaultState = settings?.state ?? 'TX';

  const [status, setStatus] = useState<AccountStatus>('Prospect');
  const [customerSince, setCustomerSince] = useState(today());
  const [leadSource, setLeadSource] = useState('');
  const [producer, setProducer] = useState<string | null>(me?.name ?? null);
  const [csr, setCsr] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [cls, setCls] = useState({ naics_code: '', sic_code: '', nature_of_business: '', naics_description: '' });
  const [operations, setOperations] = useState('');
  const [marital, setMarital] = useState('');
  const [occupation, setOccupation] = useState('');
  const [addresses, setAddresses] = useState<Addr[]>([newAddr(true, defaultState)]);
  const [contacts, setContacts] = useState<Contact[]>([newContact(true)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // After the first failed Done, re-check as the user types so fixed fields lose their error.
  const [submitted, setSubmitted] = useState(false);
  const leadSources = useLeadSourceOptions(leadSource, LEAD_SOURCES);

  const setAddr = (key: string, patch: Partial<Addr>) => setAddresses((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const makePrimaryAddr = (key: string) => setAddresses((list) => list.map((a) => ({ ...a, is_primary: a.key === key })));
  const removeAddr = (key: string) => setAddresses((list) => {
    const next = list.filter((a) => a.key !== key);
    if (next.length && !next.some((a) => a.is_primary)) next[0] = { ...next[0], is_primary: true };
    return next;
  });

  const setContact = (key: string, patch: Partial<Contact>) => setContacts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  /** Exactly one primary contact; the new primary can't also be secondary / co-applicant. */
  const makePrimary = (key: string) => setContacts((list) => list.map((c) => (c.key === key ? { ...c, is_primary: true, is_secondary: false, own_address: false } : { ...c, is_primary: false })));
  /** Personal: only one Co-Applicant. Commercial: any number of Secondary contacts. */
  const toggleSecondary = (key: string) => setContacts((list) => list.map((c) => {
    if (c.key === key) return { ...c, is_secondary: !c.is_secondary, relationship: !c.is_secondary && !commercial && !c.relationship ? 'Spouse' : c.relationship };
    return !commercial && c.is_secondary ? { ...c, is_secondary: false } : c;
  }));
  const removeContact = (key: string) => setContacts((list) => {
    const next = list.filter((c) => c.key !== key);
    if (next.length && !next.some((c) => c.is_primary)) next[0] = { ...next[0], is_primary: true, is_secondary: false, own_address: false };
    return next;
  });

  const pickClass = (c: NaicsClass) => {
    setCls({ naics_code: c.naics, sic_code: c.sic, nature_of_business: natureOfBusiness(c.naics), naics_description: c.title });
    setErrors((e) => ({ ...e, naics: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (commercial && !businessName.trim()) e.businessName = 'Business name is required';
    if (commercial && !cls.naics_code) e.naics = 'Classify the business: search and pick a NAICS class';
    if (customerSince > today()) e.customerSince = 'Customer since cannot be in the future';
    const primaryAddr = addresses.find((a) => a.is_primary);
    if (!primaryAddr) e.addresses = 'A primary address is required';
    addresses.forEach((a) => {
      if (!a.street.trim()) e[`addr.${a.key}.street`] = 'Street is required';
      if (!a.city.trim()) e[`addr.${a.key}.city`] = 'City is required';
      if (a.address_type !== 'Mailing' || (a.country || 'United States') === 'United States') {
        if (!ZIP_RE.test(a.zip.trim())) e[`addr.${a.key}.zip`] = '5-digit ZIP required';
      }
    });
    if (!contacts.some((c) => c.is_primary)) e.contacts = 'Mark one contact as primary';
    contacts.forEach((c) => {
      if (!c.first_name.trim()) e[`c.${c.key}.first_name`] = 'First name is required';
      if (!c.last_name.trim()) e[`c.${c.key}.last_name`] = 'Last name is required';
      if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) e[`c.${c.key}.email`] = 'Enter a valid email';
      if (c.is_primary && !c.email.trim()) e[`c.${c.key}.email`] = 'Email is required for the primary contact';
      if (c.client_center_access && !c.email.trim()) e[`c.${c.key}.email`] = 'Client Center access needs an email login';
      if (c.dob && c.dob > today()) e[`c.${c.key}.dob`] = 'Date of birth cannot be in the future';
      if (c.own_address && c.address.trim() && c.zip.trim() && !ZIP_RE.test(c.zip.trim())) e[`c.${c.key}.zip`] = '5-digit ZIP required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    if (!submitted) return;
    if (validate()) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, businessName, cls, customerSince, addresses, contacts]);

  const done = async () => {
    if (saving.current) return;
    setSubmitted(true);
    if (!validate()) { setError('Please fix the highlighted fields.'); return; }
    saving.current = true;
    setBusy(true);
    setError(null);
    const n = (v: string) => v.trim() || null;
    const primary = contacts.find((c) => c.is_primary)!;
    const addr = addresses.find((a) => a.is_primary)!;
    try {
      const account = await db.insert('accounts', {
        account_type: type, status, customer_since: customerSince || null, lead_source: n(leadSource), producer, csr,
        first_name: primary.first_name.trim(), last_name: primary.last_name.trim(), business_name: commercial ? businessName.trim() : null,
        email: primary.email.trim(), phone: n(fmtPhone(primary.phone)), mobile_phone: n(fmtPhone(primary.mobile_phone)),
        dob: commercial ? null : n(primary.dob), marital_status: commercial ? null : n(marital), occupation: commercial ? null : n(occupation),
        address: [addr.street.trim(), addr.street2.trim()].filter(Boolean).join(', '), city: n(addr.city), state: n(addr.state), zip: n(addr.zip),
        policy_type: commercial ? 'Commercial' : null, notes: null, labels: [],
        naics_code: commercial ? n(cls.naics_code) : null, sic_code: commercial ? n(cls.sic_code) : null,
        nature_of_business: commercial ? n(cls.nature_of_business) : null, naics_description: commercial ? n(cls.naics_description) : null,
        operations_description: commercial ? n(operations) : null,
      });
      await db.insertMany('account_addresses', addresses.map((a) => ({
        account_id: account.id, address_type: a.address_type, street: a.street.trim(), street2: n(a.street2), city: n(a.city), state: n(a.state),
        zip: n(a.zip), country: a.address_type === 'Mailing' ? n(a.country) : null, is_primary: a.is_primary,
      })));
      await db.insertMany('account_contacts', contacts.map((c) => ({
        account_id: account.id, first_name: c.first_name.trim(), last_name: c.last_name.trim(), title: n(c.title),
        relationship: n(c.relationship) ?? (c.is_primary ? 'Insured' : null), email: n(c.email), phone: n(fmtPhone(c.phone)),
        mobile_phone: n(fmtPhone(c.mobile_phone)), dob: n(c.dob), is_primary: c.is_primary, is_secondary: c.is_secondary,
        client_center_access: c.client_center_access,
        address: c.own_address && !c.is_primary ? n(c.address) : null, city: c.own_address && !c.is_primary ? n(c.city) : null,
        state: c.own_address && !c.is_primary ? n(c.state) : null, zip: c.own_address && !c.is_primary ? n(c.zip) : null,
      })));
      if (!commercial) {
        // The named insured and co-applicant are the household's first drivers.
        const people = contacts.filter((c) => c.is_primary || c.is_secondary);
        await db.insertMany('drivers', people.map((c) => ({
          account_id: account.id, first_name: c.first_name.trim(), last_name: c.last_name.trim(), dob: n(c.dob),
          marital_status: c.is_primary ? n(marital) : null, relationship: c.is_primary ? 'Insured' : c.relationship || 'Spouse',
          license_state: n(addr.state), violations: 0, accidents: 0, gender: null, license_number: null,
        })));
      }
      try { await enqueueAutomation('Applicant Created', { account_id: account.id }); } catch { /* automations never block saving */ }
      toast(`${commercial ? businessName.trim() : `${primary.first_name} ${primary.last_name}`} created`);
      navigate(`/accounts/${account.id}`);
    } catch (e) {
      setError((e as Error).message);
      saving.current = false;
      setBusy(false);
    }
  };

  const fieldErr = (k: string) => errors[k] || undefined;

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumb={[{ label: 'Applicants', href: href('/accounts') }]}
        title={commercial ? 'Create Commercial Applicant' : 'Create New Applicant'}
        subtitle={commercial ? 'Commercial lines customer account — classify the business first.' : 'Personal lines customer account — the applicant is the primary named insured.'}
        icon={commercial ? <Building2 size={20} /> : <User size={20} />}
        actions={
          <div className="inline-flex rounded border border-ink-200 overflow-hidden" role="group" aria-label="Personal or commercial">
            {(['Personal', 'Commercial'] as AccountType[]).map((t) => (
              <button key={t} type="button" onClick={() => navigate(`/accounts/new?type=${t}`, { replace: true })}
                className={cx('px-3 h-9 text-[13px] font-semibold', t === type ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50')}>
                {t}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        {commercial && (
          <Card title="Business Classification" icon={<Building2 size={16} />} subtitle="First step for commercial accounts: the NAICS class drives submissions and carrier appetite.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Business name" required error={fieldErr('businessName')} hint="Pre-fills ACORD forms" className="sm:col-span-2">
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Legal business name" />
              </Field>
              <Field label="NAICS code search" required error={fieldErr('naics')} className="sm:col-span-2">
                <NaicsLookup onPick={pickClass} />
              </Field>
              <ReadOnly label="NAICS code" value={cls.naics_code} />
              <ReadOnly label="SIC code" value={cls.sic_code} />
              <ReadOnly label="Nature of business" value={cls.nature_of_business} />
              <ReadOnly label="NAICS description" value={cls.naics_description} />
              <Field label="Description of primary operations" className="sm:col-span-2" hint="Describe what the business actually does — used on applications and submissions.">
                <Textarea value={operations} onChange={(e) => setOperations(e.target.value)} rows={3} placeholder="e.g. Residential and light commercial lawn maintenance; no tree work over 15 ft." />
              </Field>
            </div>
            <p className="text-[11px] text-ink-400 mt-3">Classification uses a built-in reference list of common small-business classes. Verify unusual risks against the official NAICS manual.</p>
          </Card>
        )}

        <Card title="Account Details" icon={<Users size={16} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Account type" hint="Lead, active or inactive client — used in reporting">
              <Select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} options={ACCOUNT_TYPES} />
            </Field>
            <Field label="Customer since" error={fieldErr('customerSince')}>
              <Input type="date" value={customerSince} max={today()} onChange={(e) => setCustomerSince(e.target.value)} />
            </Field>
            <Field label="Lead source">
              <Select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="—" options={leadSources} />
            </Field>
            <div className="hidden lg:block" />
            <Field label="Assigned producer" hint="Defaults to you"><StaffSelect value={producer} onChange={setProducer} /></Field>
            <Field label="Assigned CSR"><StaffSelect value={csr} onChange={setCsr} /></Field>
            {!commercial && (
              <>
                <Field label="Marital status"><Select value={marital} onChange={(e) => setMarital(e.target.value)} placeholder="—" options={['Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partner']} /></Field>
                <Field label="Occupation"><Input value={occupation} onChange={(e) => setOccupation(e.target.value)} /></Field>
              </>
            )}
          </div>
        </Card>

        <Card
          title="Addresses"
          icon={<MapPin size={16} />}
          subtitle="The primary address is used for quoting and reports."
          action={<Button size="sm" icon={<Plus size={13} />} onClick={() => setAddresses((l) => [...l, newAddr(false, defaultState)])}>Add Address</Button>}
        >
          {errors.addresses && <div className="text-xs text-red-600 mb-2">{errors.addresses}</div>}
          <div className="space-y-4">
            {addresses.map((a, i) => (
              <div key={a.key} className={cx('rounded border p-3', a.is_primary ? 'border-brand-200 bg-brand-50/30' : 'border-ink-100')}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink-900">Address {i + 1}</span>
                    {a.is_primary ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"><Star size={12} className="fill-current" /> Primary</span>
                      : <button type="button" className="text-xs font-semibold text-brand-600 bg-transparent hover:underline" onClick={() => makePrimaryAddr(a.key)}>Make primary</button>}
                  </div>
                  {addresses.length > 1 && <button type="button" onClick={() => removeAddr(a.key)} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-red-600 bg-transparent"><Trash2 size={13} /> Remove</button>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <Field label="Address type" className="sm:col-span-2">
                    <Select value={a.address_type} onChange={(e) => setAddr(a.key, { address_type: e.target.value })} options={[...ADDRESS_TYPES]} />
                  </Field>
                  <Field label="Street" required error={fieldErr(`addr.${a.key}.street`)} className="sm:col-span-4">
                    <Input value={a.street} onChange={(e) => setAddr(a.key, { street: e.target.value })} />
                  </Field>
                  <Field label="Apt / Suite" className="sm:col-span-2"><Input value={a.street2} onChange={(e) => setAddr(a.key, { street2: e.target.value })} /></Field>
                  <Field label="City" required error={fieldErr(`addr.${a.key}.city`)} className="sm:col-span-2">
                    <Input value={a.city} onChange={(e) => setAddr(a.key, { city: e.target.value })} />
                  </Field>
                  <Field label="State" className="sm:col-span-1"><Select value={a.state} onChange={(e) => setAddr(a.key, { state: e.target.value })} options={US_STATES} /></Field>
                  <Field label="ZIP" required error={fieldErr(`addr.${a.key}.zip`)} className="sm:col-span-1">
                    <Input value={a.zip} onChange={(e) => setAddr(a.key, { zip: e.target.value })} inputMode="numeric" />
                  </Field>
                  {a.address_type === 'Mailing' && (
                    <Field label="Country" className="sm:col-span-2" hint="Mailing addresses only">
                      <Input value={a.country} onChange={(e) => setAddr(a.key, { country: e.target.value })} />
                    </Field>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={commercial ? 'Contacts' : 'Applicant & Contacts'}
          icon={<UserPlus size={16} />}
          subtitle={commercial ? 'The primary contact is usually the named insured / owner.' : 'The primary contact is the applicant (named insured).'}
          action={<Button size="sm" icon={<Plus size={13} />} onClick={() => setContacts((l) => [...l, newContact(false)])}>Add Contact</Button>}
        >
          {errors.contacts && <div className="text-xs text-red-600 mb-2">{errors.contacts}</div>}
          <div className="space-y-4">
            {contacts.map((c, i) => (
              <div key={c.key} className={cx('rounded border p-3', c.is_primary ? 'border-brand-200 bg-brand-50/30' : 'border-ink-100')}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink-900">{c.is_primary ? (commercial ? 'Primary contact' : 'Applicant') : c.is_secondary ? (commercial ? 'Secondary contact' : 'Co-Applicant') : `Contact ${i + 1}`}</span>
                  </div>
                  {contacts.length > 1 && (commercial || !c.is_primary) && <button type="button" onClick={() => removeContact(c.key)} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-red-600 bg-transparent"><X size={13} /> Remove</button>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <Field label="First name" required error={fieldErr(`c.${c.key}.first_name`)} className="sm:col-span-2"><Input value={c.first_name} onChange={(e) => setContact(c.key, { first_name: e.target.value })} /></Field>
                  <Field label="Last name" required error={fieldErr(`c.${c.key}.last_name`)} className="sm:col-span-2"><Input value={c.last_name} onChange={(e) => setContact(c.key, { last_name: e.target.value })} /></Field>
                  {commercial
                    ? <Field label="Title" className="sm:col-span-2"><Input value={c.title} onChange={(e) => setContact(c.key, { title: e.target.value })} placeholder="Owner, Office manager…" /></Field>
                    : <Field label="Date of birth" error={fieldErr(`c.${c.key}.dob`)} className="sm:col-span-2"><Input type="date" max={today()} value={c.dob} onChange={(e) => setContact(c.key, { dob: e.target.value })} /></Field>}
                  <Field label="Email" required={c.is_primary} error={fieldErr(`c.${c.key}.email`)} className="sm:col-span-2"><Input type="email" value={c.email} onChange={(e) => setContact(c.key, { email: e.target.value })} /></Field>
                  <Field label="Phone" className="sm:col-span-2"><Input type="tel" value={c.phone} onChange={(e) => setContact(c.key, { phone: e.target.value })} placeholder="(512) 555-0100" /></Field>
                  <Field label="Mobile (texting)" className="sm:col-span-2"><Input type="tel" value={c.mobile_phone} onChange={(e) => setContact(c.key, { mobile_phone: e.target.value })} /></Field>
                  {!c.is_primary && (
                    <Field label="Relationship to insured" className="sm:col-span-2">
                      <Select value={c.relationship} onChange={(e) => setContact(c.key, { relationship: e.target.value })} placeholder="—"
                        options={commercial ? ['Owner', 'Partner', 'Officer', 'Employee', 'Accountant', 'Other'] : ['Spouse', 'Domestic Partner', 'Child', 'Parent', 'Other']} />
                    </Field>
                  )}
                </div>

                {commercial && !c.is_primary && (
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={c.own_address} onChange={(e) => setContact(c.key, { own_address: e.target.checked })} />
                      Contact has a different address
                    </label>
                    {c.own_address && (
                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-2">
                        <Field label="Street" className="sm:col-span-3"><Input value={c.address} onChange={(e) => setContact(c.key, { address: e.target.value })} /></Field>
                        <Field label="City" className="sm:col-span-1"><Input value={c.city} onChange={(e) => setContact(c.key, { city: e.target.value })} /></Field>
                        <Field label="State" className="sm:col-span-1"><Select value={c.state} onChange={(e) => setContact(c.key, { state: e.target.value })} options={US_STATES} /></Field>
                        <Field label="ZIP" error={fieldErr(`c.${c.key}.zip`)} className="sm:col-span-1"><Input value={c.zip} onChange={(e) => setContact(c.key, { zip: e.target.value })} /></Field>
                      </div>
                    )}
                  </div>
                )}
                {commercial && c.is_primary && <p className="text-[11px] text-ink-400 mt-2">The primary contact uses the account&apos;s primary address. Un-mark primary to give this contact its own address.</p>}

                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ink-100">
                  {commercial && (
                    <RoleButton on={c.is_primary} onClick={() => makePrimary(c.key)} disabled={c.is_primary}>Make this Contact Primary</RoleButton>
                  )}
                  {!c.is_primary && (
                    <RoleButton on={c.is_secondary} onClick={() => toggleSecondary(c.key)}>{commercial ? 'Make this Contact Secondary' : 'Make this Contact Co-Applicant'}</RoleButton>
                  )}
                  <RoleButton on={c.client_center_access} onClick={() => setContact(c.key, { client_center_access: !c.client_center_access })}>Client Center Access</RoleButton>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 mt-3">Client Center Access records that the customer may use the self-service portal to view policies and documents; the portal itself isn&apos;t part of this training system.</p>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
          <Button variant="ghost" onClick={() => navigate('/accounts')} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={done} className="min-w-[120px]">Done</Button>
        </div>
      </div>
    </div>
  );
}
