import { Building2, MapPin, Pencil, Plus, Star, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, DescriptionList, EmptyState, ErrorBanner, Field, IconButton, Input, Modal, Panel, Select, Textarea, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtDate, fmtPhone, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { ADDRESS_TYPES, US_STATES, type Account, type AccountAddress, type AccountContact } from '@/lib/types';
import { syncContactJson } from '@/modules/accounts/AccountFormModal';
import { NaicsLookup } from '@/modules/accounts/NaicsLookup';
import { natureOfBusiness } from '@/modules/accounts/naics';

/* Overview panels for the data captured by Create Applicant: addresses, contacts & roles, business classification. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const n = (v: string) => v.trim() || null;

/**
 * Keeps the account's own address / contact columns in sync with its primary address and primary contact.
 * Only non-empty values are copied, so a sparse contact never blanks the account's data. Commercial
 * accounts keep their business email/phone (the contact's own details stay on the contact row).
 */
async function syncPrimary(accountId: string) {
  const [account, addrs, contacts] = await Promise.all([
    db.get('accounts', accountId),
    db.list('account_addresses', { eq: { account_id: accountId } }),
    db.list('account_contacts', { eq: { account_id: accountId } }),
  ]);
  if (!account) return;
  const a = addrs.find((x) => x.is_primary);
  const c = contacts.find((x) => x.is_primary);
  const patch: Partial<Account> = {};
  const put = (k: 'address' | 'city' | 'state' | 'zip' | 'first_name' | 'last_name' | 'email' | 'phone' | 'mobile_phone' | 'dob', v: string | null | undefined) => {
    if (v?.trim() && v.trim() !== account[k]) patch[k] = v.trim();
  };
  if (a) { put('address', [a.street, a.street2].filter(Boolean).join(', ')); put('city', a.city); put('state', a.state); put('zip', a.zip); }
  if (c) {
    put('first_name', c.first_name); put('last_name', c.last_name);
    if (account.account_type !== 'Commercial') { put('email', c.email); put('phone', c.phone); put('mobile_phone', c.mobile_phone); put('dob', c.dob); }
  }
  // The typed phones/emails lists must follow the columns they mirror.
  Object.assign(patch, syncContactJson(account, { email: patch.email, phone: patch.phone, mobile_phone: patch.mobile_phone }));
  if (Object.keys(patch).length) await db.update('accounts', accountId, patch);
}

// ── Addresses ──

export function AddressesPanel({ account }: { account: Account }) {
  const addrs = useTable('account_addresses', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const [editing, setEditing] = useState<AccountAddress | 'new' | null>(null);
  const { confirm, toast } = useFeedback();

  const makePrimary = async (a: AccountAddress) => {
    try {
      for (const x of addrs.data) if (x.is_primary !== (x.id === a.id)) await db.update('account_addresses', x.id, { is_primary: x.id === a.id });
      await syncPrimary(account.id);
      toast('Primary address updated');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (a: AccountAddress) => {
    if (a.is_primary) return toast('Make another address primary before removing this one.', 'info');
    if (!(await confirm({ title: 'Remove address?', message: `${a.street}, ${a.city ?? ''} will be removed.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await db.remove('account_addresses', a.id); toast('Address removed'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  // Accounts created before multiple addresses existed show their single address.
  const legacy = !addrs.loading && addrs.data.length === 0 && account.address;
  return (
    <Panel title="Addresses" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add Address</Button>}>
      {legacy && (
        <div className="flex items-start gap-2 text-[13px]">
          <MapPin size={14} className="text-ink-400 mt-0.5" />
          <div><div className="font-semibold text-ink-900">Mailing <Badge tone="teal">Primary</Badge></div><div className="text-ink-600">{account.address}, {account.city}, {account.state} {account.zip}</div></div>
        </div>
      )}
      {!legacy && addrs.data.length === 0 && !addrs.loading && <EmptyState icon={<MapPin size={20} />} title="No addresses" message="A primary address is used for quoting and reports." />}
      <div className="divide-y divide-ink-50">
        {addrs.data.map((a) => (
          <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0">
            <MapPin size={14} className="text-ink-400 mt-1 shrink-0" />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">{a.address_type}{a.is_primary && <Badge tone="teal"><Star size={10} className="fill-current" /> Primary</Badge>}</div>
              <div className="text-ink-600">{[a.street, a.street2].filter(Boolean).join(', ')}, {a.city}, {a.state} {a.zip}{a.country && a.country !== 'United States' ? ` · ${a.country}` : ''}</div>
            </div>
            <div className="flex shrink-0">
              {!a.is_primary && <Button size="sm" variant="ghost" onClick={() => makePrimary(a)}>Make primary</Button>}
              <IconButton label="Edit address" onClick={() => setEditing(a)}><Pencil size={14} /></IconButton>
              <IconButton label="Remove address" onClick={() => remove(a)}><Trash2 size={14} /></IconButton>
            </div>
          </div>
        ))}
      </div>
      {editing && <AddressModal account={account} address={editing === 'new' ? undefined : editing} isFirst={addrs.data.length === 0} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function AddressModal({ account, address, isFirst, onClose }: { account: Account; address?: AccountAddress; isFirst: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, setV] = useState({
    address_type: address?.address_type ?? 'Mailing', street: address?.street ?? '', street2: address?.street2 ?? '', city: address?.city ?? '',
    state: address?.state ?? account.state ?? 'TX', zip: address?.zip ?? '', country: address?.country ?? 'United States', is_primary: address?.is_primary ?? isFirst,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (x: string | boolean) => setV((s) => ({ ...s, [k]: x }));

  const save = async () => {
    if (busy) return;
    if (!v.street.trim() || !v.city.trim()) return setError('Street and city are required');
    const domestic = v.address_type !== 'Mailing' || (v.country || 'United States') === 'United States';
    if (domestic && !ZIP_RE.test(v.zip.trim())) return setError('Enter a 5-digit ZIP');
    setBusy(true);
    setError(null);
    try {
      const payload = { account_id: account.id, address_type: v.address_type, street: v.street.trim(), street2: n(v.street2), city: n(v.city), state: n(v.state), zip: n(v.zip), country: v.address_type === 'Mailing' ? n(v.country) : null, is_primary: v.is_primary };
      const saved = address ? await db.update('account_addresses', address.id, payload) : await db.insert('account_addresses', payload);
      if (saved.is_primary) {
        const others = await db.list('account_addresses', { eq: { account_id: account.id, is_primary: true } });
        for (const o of others) if (o.id !== saved.id) await db.update('account_addresses', o.id, { is_primary: false });
        await syncPrimary(account.id);
      }
      toast(address ? 'Address updated' : 'Address added');
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal title={address ? 'Edit address' : 'Add address'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Done</Button></>}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-2">
        <Field label="Address type" className="sm:col-span-2"><Select value={v.address_type} onChange={(e) => set('address_type')(e.target.value)} options={[...ADDRESS_TYPES]} /></Field>
        <Field label="Street" required className="sm:col-span-4"><Input value={v.street} onChange={(e) => set('street')(e.target.value)} /></Field>
        <Field label="Apt / Suite" className="sm:col-span-2"><Input value={v.street2} onChange={(e) => set('street2')(e.target.value)} /></Field>
        <Field label="City" required className="sm:col-span-2"><Input value={v.city} onChange={(e) => set('city')(e.target.value)} /></Field>
        <Field label="State"><Select value={v.state} onChange={(e) => set('state')(e.target.value)} options={US_STATES} /></Field>
        <Field label="ZIP"><Input value={v.zip} onChange={(e) => set('zip')(e.target.value)} /></Field>
        {v.address_type === 'Mailing' && <Field label="Country" className="sm:col-span-3" hint="Mailing addresses only"><Input value={v.country} onChange={(e) => set('country')(e.target.value)} /></Field>}
        <label className="sm:col-span-6 inline-flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={v.is_primary} disabled={address?.is_primary} onChange={(e) => set('is_primary')(e.target.checked)} /> Primary address (used for quoting and reports)
        </label>
      </div>
    </Modal>
  );
}

// ── Contacts ──

export function ContactsPanel({ account }: { account: Account }) {
  const commercial = account.account_type === 'Commercial';
  const contacts = useTable('account_contacts', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const [editing, setEditing] = useState<AccountContact | 'new' | null>(null);
  const { confirm, toast } = useFeedback();
  const secondaryLabel = commercial ? 'Secondary' : 'Co-Applicant';

  const setRole = async (c: AccountContact, patch: Partial<AccountContact>) => {
    try {
      if (patch.is_primary) {
        for (const x of contacts.data) if (x.id !== c.id && x.is_primary) await db.update('account_contacts', x.id, { is_primary: false });
        patch = { ...patch, is_secondary: false };
      }
      if (patch.is_secondary && !commercial) {
        for (const x of contacts.data) if (x.id !== c.id && x.is_secondary) await db.update('account_contacts', x.id, { is_secondary: false });
      }
      await db.update('account_contacts', c.id, patch);
      if (patch.is_primary) await syncPrimary(account.id);
      toast('Contact updated');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (c: AccountContact) => {
    if (c.is_primary) return toast('Make another contact primary before removing this one.', 'info');
    if (!(await confirm({ title: 'Remove contact?', message: `${c.first_name} ${c.last_name} will be removed from this account.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await db.remove('account_contacts', c.id); toast('Contact removed'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const legacy = !contacts.loading && contacts.data.length === 0;
  return (
    <Panel title="Contacts" actions={<Button size="sm" icon={<UserPlus size={13} />} onClick={() => setEditing('new')}>Add Contact</Button>}>
      {legacy && (
        <div className="text-[13px]">
          <div className="font-semibold text-ink-900">{account.first_name} {account.last_name} <Badge tone="teal">Primary</Badge></div>
          <div className="text-ink-500">{account.email}{account.phone ? ` · ${fmtPhone(account.phone)}` : ''}</div>
          <div className="text-xs text-ink-400 mt-1">Add contacts to record a {secondaryLabel.toLowerCase()} or Client Center access.</div>
        </div>
      )}
      <div className="divide-y divide-ink-50">
        {contacts.data.map((c) => (
          <div key={c.id} className="py-2.5 first:pt-0">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="flex flex-wrap items-center gap-1.5 font-semibold text-ink-900">
                  {c.first_name} {c.last_name}
                  {c.is_primary && <Badge tone="teal">Primary</Badge>}
                  {c.is_secondary && <Badge tone="blue">{secondaryLabel}</Badge>}
                  {c.client_center_access && <Badge tone="purple">Client Center</Badge>}
                </div>
                <div className="text-ink-500 text-xs">{[c.title, c.relationship, c.email, c.phone && fmtPhone(c.phone), c.dob && `DOB ${fmtDate(c.dob)}`].filter(Boolean).join(' · ')}</div>
                {c.address && <div className="text-ink-400 text-xs">{c.address}, {c.city}, {c.state} {c.zip}</div>}
              </div>
              <IconButton label="Edit contact" onClick={() => setEditing(c)}><Pencil size={14} /></IconButton>
              <IconButton label="Remove contact" onClick={() => remove(c)}><Trash2 size={14} /></IconButton>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {!c.is_primary && (commercial || !contacts.data.some((x) => x.is_primary)) && <Button size="sm" variant="ghost" onClick={() => setRole(c, { is_primary: true })}>Make this Contact Primary</Button>}
              {!c.is_primary && <Button size="sm" variant="ghost" onClick={() => setRole(c, { is_secondary: !c.is_secondary })}>{c.is_secondary ? `Remove ${secondaryLabel}` : `Make this Contact ${secondaryLabel}`}</Button>}
              <Button size="sm" variant="ghost" onClick={() => {
                if (!c.client_center_access && !c.email) { toast('Add an email first — it is the Client Center login.', 'info'); return; }
                setRole(c, { client_center_access: !c.client_center_access });
              }}>{c.client_center_access ? 'Remove Client Center Access' : 'Grant Client Center Access'}</Button>
            </div>
          </div>
        ))}
      </div>
      {editing && <ContactModal account={account} contact={editing === 'new' ? undefined : editing} isFirst={contacts.data.length === 0} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function ContactModal({ account, contact, isFirst, onClose }: { account: Account; contact?: AccountContact; isFirst: boolean; onClose: () => void }) {
  const commercial = account.account_type === 'Commercial';
  const { toast } = useFeedback();
  const [v, setV] = useState({
    first_name: contact?.first_name ?? '', last_name: contact?.last_name ?? '', title: contact?.title ?? '', relationship: contact?.relationship ?? '',
    email: contact?.email ?? '', phone: contact?.phone ?? '', mobile_phone: contact?.mobile_phone ?? '', dob: contact?.dob ?? '',
    address: contact?.address ?? '', city: contact?.city ?? '', state: contact?.state ?? account.state ?? 'TX', zip: contact?.zip ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const primary = contact?.is_primary ?? isFirst;

  const save = async () => {
    if (busy) return;
    if (!v.first_name.trim() || !v.last_name.trim()) return setError('First and last name are required');
    if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) return setError('Enter a valid email');
    if (primary && !v.email.trim()) return setError('The primary contact needs an email');
    if (v.dob && v.dob > today()) return setError('Date of birth cannot be in the future');
    setBusy(true);
    setError(null);
    try {
      const payload = {
        account_id: account.id, first_name: v.first_name.trim(), last_name: v.last_name.trim(), title: n(v.title), relationship: n(v.relationship),
        email: n(v.email), phone: n(fmtPhone(v.phone)), mobile_phone: n(fmtPhone(v.mobile_phone)), dob: n(v.dob),
        address: primary ? null : n(v.address), city: primary ? null : n(v.city), state: primary ? null : n(v.state), zip: primary ? null : n(v.zip),
        ...(contact ? {} : { is_primary: isFirst, is_secondary: false, client_center_access: false }),
      };
      if (contact) await db.update('account_contacts', contact.id, payload); else await db.insert('account_contacts', payload);
      if (primary) await syncPrimary(account.id);
      toast(contact ? 'Contact updated' : 'Contact added');
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal title={contact ? 'Edit contact' : 'Add contact'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Done</Button></>}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <Field label="First name" required><Input value={v.first_name} onChange={(e) => set('first_name')(e.target.value)} /></Field>
        <Field label="Last name" required><Input value={v.last_name} onChange={(e) => set('last_name')(e.target.value)} /></Field>
        {commercial ? <Field label="Title"><Input value={v.title} onChange={(e) => set('title')(e.target.value)} /></Field>
          : <Field label="Date of birth"><Input type="date" max={today()} value={v.dob} onChange={(e) => set('dob')(e.target.value)} /></Field>}
        <Field label="Relationship to insured"><Select value={v.relationship} onChange={(e) => set('relationship')(e.target.value)} placeholder="—" options={commercial ? ['Owner', 'Partner', 'Officer', 'Employee', 'Accountant', 'Other'] : ['Insured', 'Spouse', 'Domestic Partner', 'Child', 'Parent', 'Other']} /></Field>
        <Field label="Email" required={primary}><Input type="email" value={v.email} onChange={(e) => set('email')(e.target.value)} /></Field>
        <Field label="Phone"><Input type="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
        <Field label="Mobile (texting)"><Input type="tel" value={v.mobile_phone} onChange={(e) => set('mobile_phone')(e.target.value)} /></Field>
        {!primary && (
          <>
            <Field label="Street (if different)" className="sm:col-span-2"><Input value={v.address} onChange={(e) => set('address')(e.target.value)} /></Field>
            <Field label="City"><Input value={v.city} onChange={(e) => set('city')(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State"><Select value={v.state} onChange={(e) => set('state')(e.target.value)} options={US_STATES} /></Field>
              <Field label="ZIP"><Input value={v.zip} onChange={(e) => set('zip')(e.target.value)} /></Field>
            </div>
          </>
        )}
        {primary && <p className="sm:col-span-2 text-[11px] text-ink-400">The primary contact uses the account&apos;s primary address; changes here update the applicant&apos;s name, email and phone.</p>}
      </div>
    </Modal>
  );
}

// ── Business classification (commercial) ──

export function ClassificationPanel({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false);
  return (
    <Panel title="Business Classification" actions={<Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>{account.naics_code ? 'Edit' : 'Classify'}</Button>}>
      {!account.naics_code ? (
        <EmptyState icon={<Building2 size={20} />} title="Not classified" message="Search a NAICS class so submissions and carrier appetite use the right code." />
      ) : (
        <DescriptionList columns={2} items={[
          { label: 'NAICS code', value: account.naics_code },
          { label: 'SIC code', value: account.sic_code },
          { label: 'Nature of business', value: account.nature_of_business },
          { label: 'NAICS description', value: account.naics_description },
          { label: 'Description of primary operations', value: account.operations_description },
        ]} />
      )}
      {editing && <ClassificationModal account={account} onClose={() => setEditing(false)} />}
    </Panel>
  );
}

function ClassificationModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const { toast } = useFeedback();
  const [cls, setCls] = useState({ naics_code: account.naics_code ?? '', sic_code: account.sic_code ?? '', nature_of_business: account.nature_of_business ?? '', naics_description: account.naics_description ?? '' });
  const [ops, setOps] = useState(account.operations_description ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await db.update('accounts', account.id, { ...cls, naics_code: n(cls.naics_code), sic_code: n(cls.sic_code), nature_of_business: n(cls.nature_of_business), naics_description: n(cls.naics_description), operations_description: n(ops) });
      toast('Classification saved');
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Business classification" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Done</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="NAICS code search" className="sm:col-span-2">
          <NaicsLookup onPick={(c) => setCls({ naics_code: c.naics, sic_code: c.sic, nature_of_business: natureOfBusiness(c.naics), naics_description: c.title })} />
        </Field>
        {(['naics_code', 'sic_code', 'nature_of_business', 'naics_description'] as const).map((k) => (
          <Field key={k} label={k.replace(/_/g, ' ').replace('naics', 'NAICS').replace('sic', 'SIC')}>
            <Input value={cls[k]} readOnly className="bg-ink-50" placeholder="Auto-filled from search" />
          </Field>
        ))}
        <Field label="Description of primary operations" className="sm:col-span-2"><Textarea value={ops} onChange={(e) => setOps(e.target.value)} rows={3} /></Field>
      </div>
    </Modal>
  );
}
