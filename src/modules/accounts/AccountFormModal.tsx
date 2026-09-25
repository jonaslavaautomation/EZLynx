import { Building2, User } from 'lucide-react';
import { useState } from 'react';
import { StaffSelect } from '@/components/pickers';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, cx, useFeedback, useForm } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtPhone, today } from '@/lib/format';
import { US_STATES, type Account, type AccountContact, type AccountStatus, type AccountType, type ContactPhone } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { useLeadSourceOptions } from '@/modules/admin/integration';

export const LEAD_SOURCES = ['Referral', 'Website', 'Walk-in', 'Google Ads', 'Facebook', 'Existing Client', 'Cold Call', 'Other'];
const STATUSES: AccountStatus[] = ['Prospect', 'Active', 'Pending', 'Inactive'];

type Values = {
  account_type: AccountType; first_name: string; last_name: string; business_name: string; email: string; phone: string; mobile_phone: string;
  address: string; city: string; state: string; zip: string; dob: string; marital_status: string; occupation: string;
  status: AccountStatus; producer: string | null; csr: string | null; lead_source: string; notes: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The Personal Applicant page keeps typed phones/emails lists alongside the plain email/phone columns
 * (and prefers the lists when present). Returns a patch that points the lists' primary entries at the
 * given values, so the two never disagree. Lists that were never filled in are left empty.
 */
export function syncContactJson(a: Pick<Account, 'phones' | 'emails'>, v: { email?: string | null; phone?: string | null; mobile_phone?: string | null }) {
  const patch: Partial<Account> = {};
  if (v.email !== undefined && a.emails?.length) {
    const i = Math.max(0, a.emails.findIndex((e) => e.type === 'Primary'));
    patch.emails = a.emails.map((e, j) => (j === i ? { ...e, address: v.email ?? '' } : e)).filter((e) => e.address);
  }
  if ((v.phone !== undefined || v.mobile_phone !== undefined) && a.phones?.length) {
    let list: ContactPhone[] = [...a.phones];
    const put = (value: string | null | undefined, isSlot: (p: ContactPhone) => boolean, type: string) => {
      if (value === undefined) return;
      const i = list.findIndex(isSlot);
      if (i >= 0) list[i] = { ...list[i], number: value ?? '' };
      else if (value && !list.some((p) => p.number === value)) list.push({ type, number: value }); // phone falls back to the mobile number
    };
    put(v.mobile_phone, (p) => p.type === 'Mobile', 'Mobile');
    put(v.phone, (p) => p.type !== 'Mobile', 'Home');
    list = list.filter((p) => p.number);
    patch.phones = list;
  }
  return patch;
}

/** Copies the account's name (and, for personal accounts, email/phones/DOB) onto its primary contact row, if it has one. */
export async function syncPrimaryContact(saved: Account) {
  const contacts = await db.list('account_contacts', { eq: { account_id: saved.id, is_primary: true } });
  if (!contacts.length) return;
  const patch: Partial<AccountContact> = { first_name: saved.first_name, last_name: saved.last_name };
  // A commercial account's email/phone are the business's; the contact's own details stay on the contact.
  if (saved.account_type !== 'Commercial') Object.assign(patch, { email: saved.email || null, phone: saved.phone, mobile_phone: saved.mobile_phone, dob: saved.dob });
  for (const c of contacts) await db.update('account_contacts', c.id, patch);
}

/** Create or edit an account (EZLynx "applicant"). */
export function AccountFormModal({ account, defaultType = 'Personal', onClose, onSaved }: { account?: Account; defaultType?: AccountType; onClose: () => void; onSaved?: (a: Account) => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [v, set] = useForm<Values>({
    account_type: account?.account_type ?? defaultType,
    first_name: account?.first_name ?? '', last_name: account?.last_name ?? '', business_name: account?.business_name ?? '',
    email: account?.email ?? '', phone: account?.phone ?? '', mobile_phone: account?.mobile_phone ?? '',
    address: account?.address ?? '', city: account?.city ?? '', state: account ? account.state ?? '' : 'TX', zip: account?.zip ?? '',
    dob: account?.dob ?? '', marital_status: account?.marital_status ?? '', occupation: account?.occupation ?? '',
    status: account?.status ?? 'Prospect', producer: account?.producer ?? me?.name ?? null, csr: account?.csr ?? null,
    lead_source: account?.lead_source ?? '', notes: account?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commercial = v.account_type === 'Commercial';
  const leadSources = useLeadSourceOptions(account?.lead_source, LEAD_SOURCES);

  const validate = () => {
    const e: typeof errors = {};
    if (commercial && !v.business_name.trim()) e.business_name = 'Business name is required';
    if (!v.first_name.trim()) e.first_name = commercial ? 'Contact first name is required' : 'First name is required';
    if (!v.last_name.trim()) e.last_name = commercial ? 'Contact last name is required' : 'Last name is required';
    if (!v.email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email';
    if (v.zip && !/^\d{5}(-\d{4})?$/.test(v.zip.trim())) e.zip = 'ZIP must be 5 digits';
    if (v.dob && v.dob > today()) e.dob = 'Date of birth cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    const s = (x: string) => x.trim() || null;
    const payload: Partial<Account> = {
      account_type: v.account_type, first_name: v.first_name.trim(), last_name: v.last_name.trim(), business_name: commercial ? s(v.business_name) : null,
      email: v.email.trim(), phone: s(fmtPhone(v.phone)), mobile_phone: s(fmtPhone(v.mobile_phone)), address: s(v.address), city: s(v.city), state: s(v.state), zip: s(v.zip),
      dob: commercial ? null : s(v.dob), marital_status: commercial ? null : s(v.marital_status), occupation: commercial ? null : s(v.occupation),
      status: v.status, producer: v.producer, csr: v.csr, lead_source: s(v.lead_source), notes: s(v.notes),
      policy_type: account?.policy_type ?? (commercial ? 'Commercial' : null),
      ...(account && !commercial ? syncContactJson(account, { email: v.email.trim(), phone: s(fmtPhone(v.phone)), mobile_phone: s(fmtPhone(v.mobile_phone)) }) : {}),
    };
    try {
      const saved = account ? await db.update('accounts', account.id, payload) : await db.insert('accounts', payload);
      if (account) await syncPrimaryContact(saved);
      if (!account && !commercial) {
        // The named insured is also the first driver on the household. The account already exists at this
        // point, so a failure here must not leave the modal open (re-saving would create a duplicate account).
        try {
          await db.insert('drivers', { account_id: saved.id, first_name: saved.first_name, last_name: saved.last_name, dob: saved.dob, marital_status: saved.marital_status, relationship: 'Insured', license_state: saved.state, violations: 0, accidents: 0, gender: null, license_number: null });
        } catch (e) {
          toast(`Account created, but the insured could not be added as a driver: ${(e as Error).message}`, 'error');
        }
      }
      if (!account) {
        try { await enqueueAutomation('Applicant Created', { account_id: saved.id }); } catch { /* automations never block saving */ }
      }
      toast(account ? 'Account updated' : 'Account created');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof Values, label: string, opts: { required?: boolean; type?: string; placeholder?: string; className?: string } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]} className={opts.className}>
      <Input type={opts.type ?? 'text'} value={v[key] as string} placeholder={opts.placeholder} onChange={(e) => set(key)(e.target.value as never)} />
    </Field>
  );

  return (
    <Modal
      title={account ? 'Edit account' : 'New account'}
      subtitle={account ? undefined : 'Search first to avoid duplicates — then enter the applicant\'s details.'}
      onClose={onClose}
      size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{account ? 'Save changes' : 'Create account'}</Button></>}
    >
      <div className="space-y-5">
        <ErrorBanner message={error} />
        {!account && (
          <div className="grid grid-cols-2 gap-2">
            {(['Personal', 'Commercial'] as AccountType[]).map((t) => (
              <button key={t} type="button" onClick={() => set('account_type')(t)} className={cx('flex items-center gap-2.5 rounded border px-3 py-2.5 text-left transition-colors', v.account_type === t ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')}>
                {t === 'Personal' ? <User size={18} /> : <Building2 size={18} />}
                <span><span className="block text-[13px] font-semibold">{t} lines</span><span className="block text-[11px] text-ink-400">{t === 'Personal' ? 'Individuals & households' : 'Businesses'}</span></span>
              </button>
            ))}
          </div>
        )}

        <section>
          <h3 className="text-xs font-semibold text-ink-900 mb-2">{commercial ? 'Business & primary contact' : 'Applicant'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {commercial && text('business_name', 'Business name', { required: true, className: 'sm:col-span-2' })}
            {text('first_name', commercial ? 'Contact first name' : 'First name', { required: true })}
            {text('last_name', commercial ? 'Contact last name' : 'Last name', { required: true })}
            {!commercial && text('dob', 'Date of birth', { type: 'date' })}
            {!commercial && (
              <Field label="Marital status"><Select value={v.marital_status} onChange={(e) => set('marital_status')(e.target.value)} placeholder="—" options={['Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partner']} /></Field>
            )}
            {!commercial && text('occupation', 'Occupation')}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-ink-900 mb-2">Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {text('email', 'Email', { required: true, type: 'email', className: 'sm:col-span-3' })}
            {text('phone', 'Phone', { type: 'tel', placeholder: '(512) 555-0100' })}
            {text('mobile_phone', 'Mobile (texting)', { type: 'tel' })}
            <div className="hidden sm:block" />
            {text('address', 'Mailing address', { className: 'sm:col-span-3' })}
            {text('city', 'City')}
            <Field label="State"><Select value={v.state} onChange={(e) => set('state')(e.target.value)} placeholder="—" options={US_STATES} /></Field>
            {text('zip', 'ZIP')}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-ink-900 mb-2">Agency</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status"><Select value={v.status} onChange={(e) => set('status')(e.target.value as AccountStatus)} options={STATUSES} /></Field>
            <Field label="Lead source"><Select value={v.lead_source} onChange={(e) => set('lead_source')(e.target.value)} placeholder="—" options={leadSources} /></Field>
            <Field label="Producer"><StaffSelect value={v.producer} onChange={set('producer')} /></Field>
            <Field label="CSR / Account manager"><StaffSelect value={v.csr} onChange={set('csr')} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} /></Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}
