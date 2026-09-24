import { Car, Home, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Modal, Panel, Select, useFeedback, useForm, type Column } from '@/components/ui';
import { db } from '@/lib/db';
import { age, fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { US_STATES, type Account, type Driver, type Property, type TableName, type Vehicle } from '@/lib/types';

/* Personal-lines risk data stored on the account and used to pre-fill the rater. */

function useRowActions(table: TableName, label: string) {
  const { confirm, toast } = useFeedback();
  return async (id: string, name: string) => {
    if (!(await confirm({ title: `Remove ${label}?`, message: `${name} will be removed from this account.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await db.remove(table, id); toast(`${label[0].toUpperCase()}${label.slice(1)} removed`); } catch (e) { toast((e as Error).message, 'error'); }
  };
}

function useSave<T>(table: TableName, existing: { id: string } | undefined, onClose: () => void, label: string) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (payload: Partial<T>) => {
    setBusy(true);
    setError(null);
    try {
      if (existing) await db.update(table, existing.id, payload as never);
      else await db.insert(table, payload as never);
      toast(existing ? `${label} updated` : `${label} added`);
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { save, busy, error, setError };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

// ── Drivers ──

export function DriversPanel({ account }: { account: Account }) {
  const drivers = useTable('drivers', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const remove = useRowActions('drivers', 'driver');
  const cols: Column<Driver>[] = [
    { key: 'name', header: 'Driver', render: (d) => <span className="font-semibold">{d.first_name} {d.last_name}</span>, sortValue: (d) => d.last_name },
    { key: 'rel', header: 'Relationship', render: (d) => d.relationship ?? '—' },
    { key: 'dob', header: 'DOB / Age', render: (d) => d.dob ? <>{fmtDate(d.dob)} <span className="text-ink-400">({age(d.dob)})</span></> : '—' },
    { key: 'lic', header: 'License', render: (d) => d.license_number ? `${d.license_state ?? ''} ${d.license_number}` : '—' },
    { key: 'hist', header: 'History', render: (d) => (d.violations || d.accidents) ? <Badge tone="amber">{d.violations} viol · {d.accidents} acc</Badge> : <Badge tone="green">Clean</Badge> },
    { key: 'x', header: '', align: 'right', render: (d) => <span className="inline-flex"><IconButton label="Edit driver" onClick={() => setEditing(d)}><Pencil size={14} /></IconButton><IconButton label="Remove driver" onClick={() => remove(d.id, `${d.first_name} ${d.last_name}`)}><Trash2 size={14} /></IconButton></span> },
  ];
  return (
    <Panel title="Drivers" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add driver</Button>} bodyClassName="p-0">
      <DataTable columns={cols} rows={drivers.data} loading={drivers.loading} empty={<EmptyState icon={<UserRound size={22} />} title="No drivers" message="Add household drivers to quote auto." />} />
      {editing && <DriverModal account={account} driver={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function DriverModal({ account, driver, onClose }: { account: Account; driver?: Driver; onClose: () => void }) {
  const [v, set] = useForm({
    first_name: driver?.first_name ?? '', last_name: driver?.last_name ?? account.last_name, dob: driver?.dob ?? '', gender: driver?.gender ?? '',
    marital_status: driver?.marital_status ?? '', relationship: driver?.relationship ?? 'Spouse', license_number: driver?.license_number ?? '',
    license_state: driver?.license_state ?? account.state ?? 'TX', violations: String(driver?.violations ?? 0), accidents: String(driver?.accidents ?? 0),
  });
  const { save, busy, error, setError } = useSave<Driver>('drivers', driver, onClose, 'Driver');
  const submit = () => {
    if (!v.first_name.trim() || !v.last_name.trim()) return setError('First and last name are required');
    save({ ...v, account_id: account.id, first_name: v.first_name.trim(), last_name: v.last_name.trim(), dob: v.dob || null, gender: v.gender || null, marital_status: v.marital_status || null, license_number: v.license_number || null, violations: Math.max(0, Math.floor(Number(v.violations)) || 0), accidents: Math.max(0, Math.floor(Number(v.accidents)) || 0) });
  };
  return (
    <Modal title={driver ? 'Edit driver' : 'Add driver'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save driver</Button></>}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <Field label="First name" required><Input value={v.first_name} onChange={(e) => set('first_name')(e.target.value)} /></Field>
        <Field label="Last name" required><Input value={v.last_name} onChange={(e) => set('last_name')(e.target.value)} /></Field>
        <Field label="Date of birth"><Input type="date" value={v.dob} onChange={(e) => set('dob')(e.target.value)} /></Field>
        <Field label="Gender"><Select value={v.gender} onChange={(e) => set('gender')(e.target.value)} placeholder="—" options={['Male', 'Female', 'Non-binary']} /></Field>
        <Field label="Relationship to insured"><Select value={v.relationship} onChange={(e) => set('relationship')(e.target.value)} options={['Insured', 'Spouse', 'Child', 'Parent', 'Other']} /></Field>
        <Field label="Marital status"><Select value={v.marital_status} onChange={(e) => set('marital_status')(e.target.value)} placeholder="—" options={['Single', 'Married', 'Divorced', 'Widowed']} /></Field>
        <Field label="License number"><Input value={v.license_number} onChange={(e) => set('license_number')(e.target.value)} /></Field>
        <Field label="License state"><Select value={v.license_state} onChange={(e) => set('license_state')(e.target.value)} options={US_STATES} /></Field>
        <Field label="Violations (3 yrs)"><Input type="number" min={0} value={v.violations} onChange={(e) => set('violations')(e.target.value)} /></Field>
        <Field label="At-fault accidents (3 yrs)"><Input type="number" min={0} value={v.accidents} onChange={(e) => set('accidents')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ── Vehicles ──

export function VehiclesPanel({ account }: { account: Account }) {
  const vehicles = useTable('vehicles', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const remove = useRowActions('vehicles', 'vehicle');
  const cols: Column<Vehicle>[] = [
    { key: 'v', header: 'Vehicle', render: (x) => <span className="font-semibold">{x.year} {x.make} {x.model}</span>, sortValue: (x) => x.year },
    { key: 'vin', header: 'VIN', render: (x) => <span className="font-mono text-xs">{x.vin ?? '—'}</span> },
    { key: 'use', header: 'Usage', render: (x) => x.usage ?? '—' },
    { key: 'mi', header: 'Annual miles', align: 'right', render: (x) => fmtNumber(x.annual_miles) },
    { key: 'own', header: 'Ownership', render: (x) => x.ownership ?? '—' },
    { key: 'x', header: '', align: 'right', render: (x) => <span className="inline-flex"><IconButton label="Edit vehicle" onClick={() => setEditing(x)}><Pencil size={14} /></IconButton><IconButton label="Remove vehicle" onClick={() => remove(x.id, `${x.year} ${x.make} ${x.model}`)}><Trash2 size={14} /></IconButton></span> },
  ];
  return (
    <Panel title="Vehicles" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add vehicle</Button>} bodyClassName="p-0">
      <DataTable columns={cols} rows={vehicles.data} loading={vehicles.loading} empty={<EmptyState icon={<Car size={22} />} title="No vehicles" message="Add vehicles to quote auto." />} />
      {editing && <VehicleModal account={account} vehicle={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function VehicleModal({ account, vehicle, onClose }: { account: Account; vehicle?: Vehicle; onClose: () => void }) {
  const [v, set] = useForm({
    year: String(vehicle?.year ?? new Date().getFullYear()), make: vehicle?.make ?? '', model: vehicle?.model ?? '', vin: vehicle?.vin ?? '',
    usage: vehicle?.usage ?? 'Commute', annual_miles: String(vehicle?.annual_miles ?? 12000), ownership: vehicle?.ownership ?? 'Owned', garaging_zip: vehicle?.garaging_zip ?? account.zip ?? '',
  });
  const { save, busy, error, setError } = useSave<Vehicle>('vehicles', vehicle, onClose, 'Vehicle');
  const submit = () => {
    const year = Number(v.year);
    if (!year || year < 1950 || year > new Date().getFullYear() + 1) return setError('Enter a valid model year');
    if (!v.make.trim() || !v.model.trim()) return setError('Make and model are required');
    if (v.vin.trim() && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin.trim())) return setError('VIN must be 17 characters (no I, O or Q)');
    save({ account_id: account.id, year, make: v.make.trim(), model: v.model.trim(), vin: v.vin.trim().toUpperCase() || null, usage: v.usage, annual_miles: num(v.annual_miles), ownership: v.ownership, garaging_zip: v.garaging_zip || null });
  };
  return (
    <Modal title={vehicle ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save vehicle</Button></>}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        <Field label="Year" required><Input type="number" value={v.year} onChange={(e) => set('year')(e.target.value)} /></Field>
        <Field label="Make" required><Input value={v.make} onChange={(e) => set('make')(e.target.value)} /></Field>
        <Field label="Model" required><Input value={v.model} onChange={(e) => set('model')(e.target.value)} /></Field>
        <Field label="VIN" className="sm:col-span-3"><Input value={v.vin} maxLength={17} onChange={(e) => set('vin')(e.target.value)} className="font-mono uppercase" /></Field>
        <Field label="Usage"><Select value={v.usage} onChange={(e) => set('usage')(e.target.value)} options={['Commute', 'Pleasure', 'Business', 'Farm']} /></Field>
        <Field label="Annual miles"><Input type="number" value={v.annual_miles} onChange={(e) => set('annual_miles')(e.target.value)} /></Field>
        <Field label="Ownership"><Select value={v.ownership} onChange={(e) => set('ownership')(e.target.value)} options={['Owned', 'Financed', 'Leased']} /></Field>
        <Field label="Garaging ZIP"><Input value={v.garaging_zip} onChange={(e) => set('garaging_zip')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ── Properties ──

export function PropertiesPanel({ account }: { account: Account }) {
  const props = useTable('properties', { eq: { account_id: account.id }, order: { column: 'created_at' } });
  const [editing, setEditing] = useState<Property | 'new' | null>(null);
  const remove = useRowActions('properties', 'property');
  return (
    <Panel title="Properties" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add property</Button>}>
      {!props.loading && props.data.length === 0 && <EmptyState icon={<Home size={22} />} title="No properties" message="Add the dwelling to quote homeowners, condo or dwelling fire." />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {props.data.map((p) => (
          <div key={p.id} className="border border-ink-100 rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink-900 truncate">{p.address}</div>
                <div className="text-xs text-ink-400">{[p.city, p.state, p.zip].filter(Boolean).join(', ')}</div>
              </div>
              <span className="inline-flex shrink-0"><IconButton label="Edit property" onClick={() => setEditing(p)}><Pencil size={14} /></IconButton><IconButton label="Remove property" onClick={() => remove(p.id, p.address)}><Trash2 size={14} /></IconButton></span>
            </div>
            <dl className="grid grid-cols-3 gap-2 mt-3 text-xs">
              {[['Year built', p.year_built ?? '—'], ['Sq ft', fmtNumber(p.square_feet)], ['Construction', p.construction ?? '—'], ['Roof', p.roof_type ?? '—'], ['Roof year', p.roof_year ?? '—'], ['Prot. class', p.protection_class ?? '—'], ['Dwelling value', fmtMoney(p.dwelling_value)]].map(([k, val]) => (
                <div key={k as string}><dt className="text-[10px] uppercase tracking-wide text-ink-400 font-semibold">{k}</dt><dd className="text-ink-800">{val}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {editing && <PropertyModal account={account} property={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function PropertyModal({ account, property, onClose }: { account: Account; property?: Property; onClose: () => void }) {
  const [v, set] = useForm({
    address: property?.address ?? account.address ?? '', city: property?.city ?? account.city ?? '', state: property?.state ?? account.state ?? 'TX', zip: property?.zip ?? account.zip ?? '',
    year_built: String(property?.year_built ?? ''), square_feet: String(property?.square_feet ?? ''), construction: property?.construction ?? 'Frame',
    roof_type: property?.roof_type ?? 'Composition Shingle', roof_year: String(property?.roof_year ?? ''), protection_class: String(property?.protection_class ?? '3'), dwelling_value: String(property?.dwelling_value ?? ''),
  });
  const { save, busy, error, setError } = useSave<Property>('properties', property, onClose, 'Property');
  const submit = () => {
    if (!v.address.trim()) return setError('Address is required');
    const yb = num(v.year_built);
    if (yb !== null && (yb < 1800 || yb > new Date().getFullYear() + 1)) return setError('Enter a valid year built');
    const pc = num(v.protection_class);
    if (pc !== null && (pc < 1 || pc > 10)) return setError('Protection class must be 1–10');
    save({ account_id: account.id, address: v.address.trim(), city: v.city || null, state: v.state || null, zip: v.zip || null, year_built: yb, square_feet: num(v.square_feet), construction: v.construction, roof_type: v.roof_type, roof_year: num(v.roof_year), protection_class: pc, dwelling_value: num(v.dwelling_value) });
  };
  return (
    <Modal title={property ? 'Edit property' : 'Add property'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save property</Button></>}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        <Field label="Address" required className="sm:col-span-3"><Input value={v.address} onChange={(e) => set('address')(e.target.value)} /></Field>
        <Field label="City"><Input value={v.city} onChange={(e) => set('city')(e.target.value)} /></Field>
        <Field label="State"><Select value={v.state} onChange={(e) => set('state')(e.target.value)} options={US_STATES} /></Field>
        <Field label="ZIP"><Input value={v.zip} onChange={(e) => set('zip')(e.target.value)} /></Field>
        <Field label="Year built"><Input type="number" value={v.year_built} onChange={(e) => set('year_built')(e.target.value)} /></Field>
        <Field label="Square feet"><Input type="number" value={v.square_feet} onChange={(e) => set('square_feet')(e.target.value)} /></Field>
        <Field label="Construction"><Select value={v.construction} onChange={(e) => set('construction')(e.target.value)} options={['Frame', 'Masonry', 'Brick Veneer', 'Stucco', 'Log', 'Modular']} /></Field>
        <Field label="Roof type"><Select value={v.roof_type} onChange={(e) => set('roof_type')(e.target.value)} options={['Composition Shingle', 'Architectural Shingle', 'Metal', 'Tile', 'Slate', 'Wood Shake', 'Flat/Built-up']} /></Field>
        <Field label="Roof year"><Input type="number" value={v.roof_year} onChange={(e) => set('roof_year')(e.target.value)} /></Field>
        <Field label="Protection class (1–10)"><Input type="number" min={1} max={10} value={v.protection_class} onChange={(e) => set('protection_class')(e.target.value)} /></Field>
        <Field label="Dwelling replacement value" className="sm:col-span-3"><Input type="number" value={v.dwelling_value} onChange={(e) => set('dwelling_value')(e.target.value)} placeholder="350000" /></Field>
      </div>
    </Modal>
  );
}
