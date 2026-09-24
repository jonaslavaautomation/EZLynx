import { Save } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Button, ErrorBanner, Field, Input, LoadingBlock, Panel, Select, useFeedback, useForm } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { US_STATES, type AgencySettings } from '@/lib/types';

const REMINDER_DAYS = [30, 45, 60, 90, 120];

export function AgencyTab() {
  const { settings, loading } = useAppData();
  if (loading) return <LoadingBlock />;
  // Remount the form when the underlying row changes identity (e.g. created or imported).
  return <AgencyForm key={settings?.id ?? 'new'} settings={settings} />;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AgencyForm({ settings }: { settings: AgencySettings | null }) {
  const { toast } = useFeedback();
  const { staff, me } = useAppData();
  const initial = {
    name: settings?.name ?? '', address: settings?.address ?? '', city: settings?.city ?? '', state: settings?.state ?? '', zip: settings?.zip ?? '',
    phone: settings?.phone ?? '', email: settings?.email ?? '', license_number: settings?.license_number ?? '',
    renewal_reminder_days: String(settings?.renewal_reminder_days ?? 60), current_user_name: settings?.current_user_name ?? me?.name ?? '',
  };
  const [v, set, setAll] = useForm(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || !settings;

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Agency name is required';
    if (v.email && !EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email';
    if (v.zip && !/^\d{5}(-\d{4})?$/.test(v.zip.trim())) e.zip = 'Use 5-digit ZIP';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    const values: Partial<AgencySettings> = {
      name: v.name.trim(), address: v.address.trim() || null, city: v.city.trim() || null, state: v.state || null, zip: v.zip.trim() || null,
      phone: v.phone.trim() || null, email: v.email.trim() || null, license_number: v.license_number.trim() || null,
      renewal_reminder_days: Number(v.renewal_reminder_days), current_user_name: v.current_user_name || null,
    };
    try {
      if (settings) await db.update('agency_settings', settings.id, values);
      else await db.insert('agency_settings', values);
      toast('Agency profile saved');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const actingAs = staff.find((s) => s.name === v.current_user_name);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
      <Panel title="Agency profile" actions={<Button variant="primary" size="sm" icon={<Save size={14} />} loading={busy} disabled={!dirty} onClick={save}>Save</Button>}>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          {!settings && <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">No agency profile exists yet. Fill in the details and save to create it.</div>}
          <Field label="Agency name" required error={errors.name}><Input value={v.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <Field label="Street address"><Input value={v.address} onChange={(e) => set('address')(e.target.value)} /></Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="City" className="col-span-2"><Input value={v.city} onChange={(e) => set('city')(e.target.value)} /></Field>
            <Field label="State"><Select value={v.state} onChange={(e) => set('state')(e.target.value)} placeholder="—" options={US_STATES} /></Field>
            <Field label="ZIP" error={errors.zip}><Input value={v.zip} inputMode="numeric" onChange={(e) => set('zip')(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Phone"><Input type="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
            <Field label="Email" error={errors.email}><Input type="email" value={v.email} onChange={(e) => set('email')(e.target.value)} /></Field>
            <Field label="Agency license #"><Input value={v.license_number} onChange={(e) => set('license_number')(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Renewal reminder" hint="Create renewal reviews this many days before expiration">
              <Select value={v.renewal_reminder_days} onChange={(e) => set('renewal_reminder_days')(e.target.value)} options={REMINDER_DAYS.map((d) => ({ value: String(d), label: `${d} days before expiration` }))} />
            </Field>
            <Field label="Acting as (current user)" hint="There is no login — choose which staff member you are">
              <Select value={v.current_user_name} onChange={(e) => set('current_user_name')(e.target.value)} placeholder={staff.length ? 'Select staff member' : 'Add users first'} options={staff.filter((s) => s.active || s.name === v.current_user_name).map((s) => ({ value: s.name, label: `${s.name} · ${s.role}` }))} />
            </Field>
          </div>
          {dirty && settings && (
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setAll(initial); setErrors({}); }}>Discard changes</Button>
              <Button variant="primary" loading={busy} onClick={save}>Save changes</Button>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Preview">
        <div className="text-[13px] space-y-0.5">
          <div className="text-[15px] font-semibold text-ink-900">{v.name || 'Agency name'}</div>
          {v.address && <div className="text-ink-600">{v.address}</div>}
          {(v.city || v.state || v.zip) && <div className="text-ink-600">{[v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>}
          {v.phone && <div className="text-ink-600">{v.phone}</div>}
          {v.email && <div className="text-brand-600">{v.email}</div>}
          {v.license_number && <div className="text-xs text-ink-400 pt-1">License # {v.license_number}</div>}
        </div>
        <div className="border-t border-ink-100 mt-4 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Acting as</div>
          {actingAs ? (
            <div className="flex items-center gap-2"><Avatar name={actingAs.name} color={actingAs.color} /><div><div className="text-[13px] font-semibold text-ink-900">{actingAs.name}</div><div className="text-xs text-ink-400">{actingAs.role}</div></div></div>
          ) : <div className="text-[13px] text-ink-400">No user selected</div>}
        </div>
        <p className="text-xs text-ink-400 mt-4">This information appears on printed invoices and reports.</p>
      </Panel>
    </div>
  );
}
