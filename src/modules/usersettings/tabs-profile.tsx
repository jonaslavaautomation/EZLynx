import { useState } from 'react';
import { useFeedback } from '@/components/ui';
import { OInput, OSelect } from '@/modules/accounts/applicant-fields';
import { ROLE_DETAILS, TIME_ZONES, defaultSettingsFor, prefsOf, useMySettings, type Preferences, type SortPref } from '@/modules/usersettings/data';
import { Check, H, InfoNote, Radios, SaveBar, useDraft } from '@/modules/usersettings/parts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, '');
const fmtPhoneInput = (s: string) => {
  const d = digits(s).slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

// ── Account ──

export function AccountTab() {
  const { me, row, save } = useMySettings();
  const { toast } = useFeedback();
  const base = { ...defaultSettingsFor(me!), ...row };
  const d = useDraft({
    first_name: base.first_name ?? '', middle_initial: base.middle_initial ?? '', last_name: base.last_name ?? '',
    email: base.email ?? '', phone: base.phone ?? '', mobile_phone: base.mobile_phone ?? '', role_detail: base.role_detail ?? '',
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const v = d.v;

  const errors: Partial<Record<keyof typeof v, string>> = {};
  if (!v.first_name.trim()) errors.first_name = 'First name is required';
  if (!v.last_name.trim()) errors.last_name = 'Last name is required';
  if (!v.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL.test(v.email.trim())) errors.email = 'Enter a valid email address';
  if (!v.phone) errors.phone = 'Phone is required';
  else if (digits(v.phone).length !== 10) errors.phone = 'Enter a 10-digit phone number';
  if (v.mobile_phone && digits(v.mobile_phone).length !== 10) errors.mobile_phone = 'Enter a 10-digit phone number';
  if (!v.role_detail) errors.role_detail = 'Role is required';
  const show = (k: keyof typeof v) => (tried && errors[k] ? { level: 'proceed' as const, message: errors[k] } : {});

  const onSave = async () => {
    setTried(true);
    if (Object.keys(errors).length) { toast('Please fix the highlighted fields.', 'error'); return; }
    setBusy(true);
    try {
      const next = { ...v, first_name: v.first_name.trim(), last_name: v.last_name.trim(), email: v.email.trim(), middle_initial: v.middle_initial.trim().toUpperCase() };
      await save({ ...next, middle_initial: next.middle_initial || null, mobile_phone: next.mobile_phone || null });
      d.commit(next);
      setTried(false);
      toast('Account settings saved.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <H>Account</H>
      <InfoNote>This contact information is used on your email signature, ACORD forms and communications sent from the system.</InfoNote>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr] gap-x-5 gap-y-6 max-w-[900px]">
        <OInput label="First Name" required="proceed" value={v.first_name} onChange={(x) => d.set({ first_name: x })} maxLength={50} {...show('first_name')} />
        <OInput label="Middle Initial" value={v.middle_initial} onChange={(x) => d.set({ middle_initial: x.replace(/[^a-zA-Z]/g, '').slice(0, 1) })} maxLength={1} />
        <OInput label="Last Name" required="proceed" value={v.last_name} onChange={(x) => d.set({ last_name: x })} maxLength={50} {...show('last_name')} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-6 max-w-[900px] mt-6">
        <OInput label="Email" type="email" inputMode="email" required="proceed" value={v.email} onChange={(x) => d.set({ email: x })} {...show('email')} />
        <OInput label="Phone" inputMode="tel" required="proceed" value={v.phone} onChange={(x) => d.set({ phone: fmtPhoneInput(x) })} {...show('phone')} />
        <OInput label="Mobile Phone" inputMode="tel" value={v.mobile_phone} onChange={(x) => d.set({ mobile_phone: fmtPhoneInput(x) })} {...show('mobile_phone')} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[900px] mt-6">
        <OSelect label="Role" required="proceed" value={v.role_detail} onChange={(x) => d.set({ role_detail: x })} options={ROLE_DETAILS} {...show('role_detail')} />
      </div>
      <p className="text-xs text-ink-500 mt-3">Your user name is <b className="font-medium text-ink-700">{usernameOf(me!.name)}</b>. Your system role ({me!.role}) is managed by an administrator under Agency Settings.</p>
      <SaveBar onSave={onSave} onReset={() => { d.reset(); setTried(false); }} busy={busy} dirty={d.dirty} />
    </div>
  );
}

export const usernameOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).join('.');

// ── Preferences ──

const SORTS: { value: SortPref; label: string }[] = [
  { value: 'premium_asc', label: 'Premium: Low to High' },
  { value: 'premium_desc', label: 'Premium: High to Low' },
  { value: 'carrier_az', label: 'Carrier Name: A to Z' },
];
const COUNTS = ['5', '10', '15', '20', '25'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-200 pt-5 mt-6 first:border-t-0 first:pt-0 first:mt-0">
      <h3 className="text-[16px] font-medium text-ink-900 mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function PreferencesTab() {
  const { row, save } = useMySettings();
  const { toast } = useFeedback();
  const d = useDraft<Preferences>(prefsOf(row));
  const [busy, setBusy] = useState(false);
  const v = d.v;

  const onSave = async () => {
    setBusy(true);
    try {
      await save({ preferences: v });
      d.commit(v);
      toast('Preferences saved.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <H>Preferences</H>
      <Section title="Time Zone">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[900px]">
          <OSelect label="Time Zone" value={v.time_zone} onChange={(x) => d.set({ time_zone: x })} options={TIME_ZONES} />
        </div>
        <div className="mt-2">
          <Check label="Automatically adjust for Daylight Saving Time" checked={v.observe_dst} onChange={(x) => d.set({ observe_dst: x })} />
          <Check label="Allow support staff to sign in as me for troubleshooting" checked={v.allow_support_login} onChange={(x) => d.set({ allow_support_login: x })} />
        </div>
      </Section>

      <Section title="Recent Items">
        <Check label="Show recent applicants and quotes in the Applicants menu" checked={v.show_recent} onChange={(x) => d.set({ show_recent: x })} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[900px] mt-4">
          <OSelect label="Number of recent applicants" value={String(v.recent_applicants)} onChange={(x) => d.set({ recent_applicants: Number(x) })} options={COUNTS} disabled={!v.show_recent} />
          <OSelect label="Number of recent quotes" value={String(v.recent_quotes)} onChange={(x) => d.set({ recent_quotes: Number(x) })} options={COUNTS} disabled={!v.show_recent} />
        </div>
      </Section>

      <Section title="Applicant Layout">
        <div className="text-[13px] text-ink-600 mb-2">Drivers &amp; vehicles layout</div>
        <Radios name="drivers_layout" value={v.drivers_layout} onChange={(x) => d.set({ drivers_layout: x })}
          options={[{ value: 'stacked', label: 'Stacked' }, { value: 'side_by_side', label: 'Side by side' }]} />
        <div className="text-[13px] text-ink-600 mt-4 mb-2">Screen density</div>
        <Radios name="view" value={v.view} onChange={(x) => d.set({ view: x })}
          options={[{ value: 'standard', label: 'Standard' }, { value: 'compact', label: 'Compact' }]} />
      </Section>

      <Section title="Rating">
        <div className="text-[13px] text-ink-600 mb-1">Submit to all appointed carriers by default</div>
        <div className="flex flex-wrap gap-x-8">
          <Check label="Auto" checked={v.submit_all_auto} onChange={(x) => d.set({ submit_all_auto: x })} />
          <Check label="Home" checked={v.submit_all_home} onChange={(x) => d.set({ submit_all_home: x })} />
          <Check label="Dwelling Fire" checked={v.submit_all_dwelling} onChange={(x) => d.set({ submit_all_dwelling: x })} />
        </div>
        <div className="text-[13px] text-ink-600 mt-4 mb-2">Default payment option shown on results</div>
        <Radios name="payment_option" value={v.payment_option} onChange={(x) => d.set({ payment_option: x })}
          options={[{ value: 'full', label: 'Paid in full' }, { value: 'monthly', label: 'Monthly' }]} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[900px] mt-5">
          <OSelect label="Sort auto results by" value={v.sort_auto} onChange={(x) => d.set({ sort_auto: x as SortPref })} options={SORTS} />
          <OSelect label="Sort home results by" value={v.sort_home} onChange={(x) => d.set({ sort_home: x as SortPref })} options={SORTS} />
          <OSelect label="Sort dwelling results by" value={v.sort_dwelling} onChange={(x) => d.set({ sort_dwelling: x as SortPref })} options={SORTS} />
        </div>
      </Section>

      <Section title="Notifications">
        <Check label="Mute email bounce notifications" checked={v.mute_bounce} onChange={(x) => d.set({ mute_bounce: x })} />
        <Check label="Mute new applicant alerts" checked={v.mute_applicant_alert} onChange={(x) => d.set({ mute_applicant_alert: x })} />
      </Section>

      <SaveBar onSave={onSave} onReset={d.reset} busy={busy} dirty={d.dirty} />
    </div>
  );
}
