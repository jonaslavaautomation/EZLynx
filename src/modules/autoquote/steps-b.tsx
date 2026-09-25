import { Copy, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Modal, cx, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtDate, fmtMoney, today } from '@/lib/format';
import { US_STATES } from '@/lib/types';
import { OInput, OSelect, TextBtn } from '@/modules/accounts/applicant-fields';
import { CarrierMark, Card, Help, SectionTitle, Switch, WInput, WSelect, clean, useWf } from './fields';
import {
  ACCIDENT_TYPES, ADI_OPTIONS, ANTI_THEFT, BI_OPTIONS, COLL_DED, COMP_DED, COMP_TYPES, DAYS_WEEK, MAKES, MEDPAY_OPTIONS, OWNERSHIP, PASSIVE, PD_OPTIONS,
  PERFORMANCE, PIP_OPTIONS, RENTAL, RESIDENCE, TOWING, UMPD_OPTIONS, UM_OPTIONS, VEHICLE_USE, VIOLATION_TYPES, WEEKS_MONTH, YES_NO,
  answerKey, blankVehicle, blankVehicleCoverage, commuteMiles, driverName, isCommute, prefillVehicles, questionsFor, validVin, vehicleName, vehicleYears,
  type Incident, type IncidentKind, type VehicleCoverage, type WVehicle,
} from './model';
import { costNewEstimate, decodeVin } from './rate';
import { CarrierQuestions, StepFooter, dropAnswers } from './steps-a';
import { uuid } from '@/lib/db';

const money = (v: string) => v.replace(/[^\d]/g, '');
const moneyShow = (v: string) => (v ? `$${Number(v).toLocaleString('en-US')}` : '');

// ── Step 4: Vehicles ──

function VehicleCard({ v, index }: { v: WVehicle; index: number }) {
  const { w, up, issues } = useWf();
  const { confirm, toast } = useFeedback();
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<string | null>(null);
  const lastVin = useRef('');
  const set = (patch: Partial<WVehicle>) => up((x) => ({ ...x, vehicles: x.vehicles.map((y) => (y.key === v.key ? { ...y, ...patch } : y)) }));
  const f = (k: string) => `vehicle.${v.key}.${k}`;

  const decode = async (vin: string) => {
    if (!validVin(vin)) { toast('Enter a 17-character VIN (letters I, O and Q are not used).', 'error'); return; }
    lastVin.current = vin;
    setDecoding(true);
    try {
      const info = await decodeVin(vin);
      if (lastVin.current !== vin) return;
      if (!info.make && !info.year) { setDecoded('This VIN could not be decoded. Enter the vehicle details manually.'); return; }
      set({
        year: info.year || v.year, make: info.make || v.make, model: info.model || v.model, sub_model: info.sub_model || v.sub_model,
        passive: info.passive ?? v.passive, abs: info.abs ?? v.abs, drl: info.drl ?? v.drl,
        cost_new: v.cost_new || (info.make ? String(costNewEstimate(info.make, info.model, info.body)) : ''),
      });
      setDecoded(info.source === 'NHTSA' ? `Decoded with NHTSA vPIC${info.body ? ` · ${info.body}` : ''}` : 'Offline: year and make read from the VIN; enter model details.');
    } finally { setDecoding(false); }
  };

  const onVin = (raw: string) => {
    const vin = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
    set({ vin });
    setDecoded(null);
    if (vin.length === 17 && validVin(vin) && vin !== lastVin.current) void decode(vin);
  };

  const setUse = (use: string) => set(isCommute(use) ? { use, annual_miles: String(commuteMiles({ ...v, use })) } : { use });
  const setCommute = (patch: Partial<WVehicle>) => { const next = { ...v, ...patch }; set({ ...patch, annual_miles: String(commuteMiles(next)) }); };

  const remove = async () => {
    if (!(await confirm({ title: `Remove ${vehicleName(v, index)}?`, message: 'The vehicle and its coverages are removed from this quote.', confirmLabel: 'Remove', danger: true }))) return;
    up((x) => {
      const vehicles = { ...x.coverage.vehicles };
      delete vehicles[v.key];
      return { ...x, vehicles: x.vehicles.filter((y) => y.key !== v.key), coverage: { ...x.coverage, vehicles }, incidents: { ...x.incidents, comp_losses: x.incidents.comp_losses.filter((i) => i.vehicle_key !== v.key) }, ...dropAnswers(x, v.key) };
    });
  };

  const makes = v.make && !MAKES.includes(v.make) ? [v.make, ...MAKES] : MAKES;
  return (
    <Card title={`Vehicle ${index + 1}`} subtitle={v.make ? vehicleName(v, index) : undefined} ok={clean(issues, `vehicle.${v.key}.`)}
      right={w.vehicles.length > 1 && <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:underline"><Trash2 size={13} /> Remove</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        <div>
          <WInput field={f('vin')} label="VIN" required value={v.vin} onChange={onVin} maxLength={17}
            action={<button type="button" aria-label="Decode VIN" onClick={() => void decode(v.vin)} className="px-2 text-ink-500 hover:text-brand-600">{decoding ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}</button>} />
          {decoded && <div className="text-[10.5px] text-ink-500 mt-0.5 ml-3">{decoded}</div>}
        </div>
        <WSelect field={f('year')} label="Year" required value={v.year} onChange={(year) => set({ year })} options={vehicleYears()} />
        <WSelect field={f('make')} label="Make" required value={v.make} onChange={(make) => set({ make })} options={makes} />
        <WInput field={f('model')} label="Model" required value={v.model} onChange={(model) => set({ model })} maxLength={40} />
        <WInput field={f('sub_model')} label="Sub-Model" value={v.sub_model} onChange={(sub_model) => set({ sub_model })} maxLength={40} />
        <WInput field={f('purchase_date')} label="Purchase Date" required type="date" value={v.purchase_date} onChange={(purchase_date) => set({ purchase_date })} />
        <WSelect field={f('passive')} label="Passive Restraints" value={v.passive} onChange={(passive) => set({ passive })} options={PASSIVE} />
        <WSelect field={f('abs')} label="Anti-Lock Brakes" value={v.abs} onChange={(abs) => set({ abs })} options={YES_NO} />
        <WSelect field={f('drl')} label="Daytime Running Lights" value={v.drl} onChange={(drl) => set({ drl })} options={YES_NO} />
        <WInput field={f('cost_new')} label="Cost New Value" inputMode="numeric" value={moneyShow(v.cost_new)} onChange={(x) => set({ cost_new: money(x) })} />
        <WSelect field={f('anti_theft')} label="Anti-Theft" value={v.anti_theft} onChange={(anti_theft) => set({ anti_theft })} options={ANTI_THEFT} />
        <WSelect field={f('use')} label="Vehicle Use" required value={v.use} onChange={setUse} options={VEHICLE_USE} />
        {isCommute(v.use) && <>
          <WInput field={f('miles_one_way')} label="Miles One Way" required inputMode="numeric" value={v.miles_one_way} onChange={(x) => setCommute({ miles_one_way: x.replace(/\D/g, '').slice(0, 3) })} />
          <WSelect field={f('days_week')} label="# Days/Week" required value={v.days_week} onChange={(days_week) => setCommute({ days_week })} options={DAYS_WEEK} />
          <WSelect field={f('weeks_month')} label="# Weeks/Month" required value={v.weeks_month} onChange={(weeks_month) => setCommute({ weeks_month })} options={WEEKS_MONTH} />
        </>}
        <WInput field={f('annual_miles')} label="Annual Miles" required inputMode="numeric" value={v.annual_miles} onChange={(x) => set({ annual_miles: x.replace(/\D/g, '').slice(0, 6) })} />
        <WInput field={f('odometer')} label="Current Odometer" inputMode="numeric" value={v.odometer} onChange={(x) => set({ odometer: x.replace(/\D/g, '').slice(0, 7) })} />
        <WSelect field={f('performance')} label="Performance" value={v.performance} onChange={(performance) => set({ performance })} options={PERFORMANCE} />
        <WInput field={f('mods_value')} label="Modifications Value" inputMode="numeric" value={v.mods_value ? `$${Number(v.mods_value).toLocaleString('en-US')}` : ''} onChange={(x) => set({ mods_value: money(x) })} />
        <WSelect field={f('was_new')} label="Was the car new?" value={v.was_new} onChange={(was_new) => set({ was_new })} options={YES_NO} />
        <WSelect field={f('ownership')} label="Ownership Type" required value={v.ownership} onChange={(ownership) => up((x) => ({
          ...x,
          vehicles: x.vehicles.map((y) => (y.key === v.key ? { ...y, ownership } : y)),
          // Loan/lease gap only applies to financed or leased vehicles.
          coverage: ownership === 'Owned' && x.coverage.vehicles[v.key] ? { ...x.coverage, vehicles: { ...x.coverage.vehicles, [v.key]: { ...x.coverage.vehicles[v.key], loan_lease: false } } } : x.coverage,
        }))} options={OWNERSHIP} />
        <WSelect field={f('car_pool')} label="Car Pool" value={v.car_pool} onChange={(car_pool) => set({ car_pool })} options={YES_NO} />
        <WSelect field={f('telematics')} label="Telematics" value={v.telematics} onChange={(telematics) => set({ telematics })} options={YES_NO} />
        <WSelect field={f('tnc')} label="Transportation Network Company" value={v.tnc} onChange={(tnc) => set({ tnc })} options={YES_NO} />
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5">
        <Switch label="Prior Damage Present" checked={v.prior_damage} onChange={(prior_damage) => set({ prior_damage })} />
        <Switch label="Alternate Garage" field={f('alternate_garage')} checked={v.alternate_garage} disabled={!w.alt_garage} onChange={(alternate_garage) => set({ alternate_garage })} />
        <Switch label="Used For Delivery" checked={v.used_delivery} onChange={(used_delivery) => set({ used_delivery })} />
      </div>
    </Card>
  );
}

function AssignmentCard() {
  const { w, up, issues } = useWf();
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  const ok = w.vehicles.every((v) => !issues.has(`vehicle.${v.key}.assignment`));
  const set = (vk: string, dk: string, value: string) => up((x) => ({ ...x, vehicles: x.vehicles.map((v) => (v.key === vk ? { ...v, assignment: { ...v.assignment, [dk]: value.replace(/\D/g, '').slice(0, 3) } } : v)) }));
  if (!rated.length) return null;
  return (
    <Card title="Vehicle Assignment" ok={ok}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink-100"><th className="text-left py-2 pr-4 font-semibold text-ink-800 w-48">Drivers</th>{w.vehicles.map((v, i) => <th key={v.key} className="text-left py-2 px-2 font-semibold text-ink-800">{vehicleName(v, i)}</th>)}</tr>
          </thead>
          <tbody>
            {rated.map((d) => (
              <tr key={d.key} className="border-b border-ink-100">
                <td className="py-2 pr-4 text-ink-800">{driverName(d)}</td>
                {w.vehicles.map((v) => (
                  <td key={v.key} className="py-2 px-2" data-field={`vehicle.${v.key}.assignment`}>
                    <div className="flex items-center gap-2 max-w-[260px]">
                      <input aria-label={`${driverName(d)} use of ${v.make || 'vehicle'}`} inputMode="numeric" value={v.assignment[d.key] ?? '0'} onChange={(e) => set(v.key, d.key, e.target.value)}
                        className="flex-1 h-9 rounded border border-ink-300 px-3 text-right outline-none focus:border-brand-500" />
                      <span className="text-ink-500">%</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-ink-200/70">
              <td className="py-2.5 pr-4 pl-2 text-[12px] font-semibold uppercase tracking-wide text-ink-700">Total use per vehicle</td>
              {w.vehicles.map((v) => {
                const total = rated.reduce((s, d) => s + (Number(v.assignment[d.key]) || 0), 0);
                return <td key={v.key} className={cx('py-2.5 px-2 font-semibold', total === 100 ? 'text-ink-800' : 'text-red-700')}>{total}%{total !== 100 && <span className="font-normal text-[11px] ml-2">must equal 100%</span>}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AltGarageCard() {
  const { w, up } = useWf();
  const g = w.alt_garage;
  if (!g) return null;
  const set = (patch: Partial<NonNullable<typeof g>>) => up((x) => ({ ...x, alt_garage: { ...x.alt_garage!, ...patch } }));
  return (
    <Card title="Alternate Garage Address" right={<button type="button" className="text-[12px] text-red-600 hover:underline" onClick={() => up((x) => ({ ...x, alt_garage: null, vehicles: x.vehicles.map((v) => ({ ...v, alternate_garage: false })) }))}>Remove</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        <WInput field="alt_garage.address" label="Address" required value={g.address} onChange={(address) => set({ address })} />
        <WInput field="alt_garage.city" label="City" value={g.city} onChange={(city) => set({ city })} />
        <WSelect field="alt_garage.state" label="State" value={g.state} onChange={(state) => set({ state })} options={US_STATES} />
        <WInput field="alt_garage.zip" label="ZIP" required inputMode="numeric" value={g.zip} onChange={(zip) => set({ zip: zip.replace(/\D/g, '').slice(0, 5) })} />
      </div>
    </Card>
  );
}

export function VehiclesStep() {
  const { w, up, account } = useWf();
  const { toast } = useFeedback();
  const prefill = async () => {
    try {
      const rows = await db.list('vehicles', { eq: { account_id: account.id }, order: { column: 'created_at' } });
      const r = prefillVehicles(w, rows);
      up((x) => ({ ...x, vehicles: r.vehicles }));
      toast(r.added ? `Added ${r.added} vehicle${r.added > 1 ? 's' : ''} from the applicant's household` : rows.length ? 'All household vehicles are already on this quote' : 'No household vehicles on file for this applicant', r.added ? 'success' : 'info');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div>
      <Card title="Prefill Vehicles">
        <p className="text-[13px] text-ink-700 mb-4">Use prefill to bring in the vehicles already listed on this applicant's household record.</p>
        <TextBtn onClick={() => void prefill()}>Prefill vehicles</TextBtn>
      </Card>
      <div className="flex flex-wrap gap-2 mb-4">
        <TextBtn onClick={() => up((x) => ({ ...x, vehicles: [...x.vehicles, blankVehicle(x.drivers)] }))}>Add additional vehicle</TextBtn>
        <TextBtn onClick={() => up((x) => ({ ...x, alt_garage: x.alt_garage ?? { address: '', city: '', state: account.state ?? '', zip: '' } }))}>Add alternate garage address</TextBtn>
      </div>
      <AltGarageCard />
      {w.vehicles.map((v, i) => <VehicleCard key={v.key} v={v} index={i} />)}
      <AssignmentCard />
      <StepFooter back={{ label: 'Drivers', to: 'drivers' }} next={{ label: 'Incidents', to: 'incidents' }} />
    </div>
  );
}

// ── Step 5: Incidents ──

const KIND_LABEL: Record<IncidentKind, { title: string; add: string; noun: string; types: string[] }> = {
  accidents: { title: 'Accidents', add: 'Add accident', noun: 'accident', types: ACCIDENT_TYPES },
  violations: { title: 'Violations', add: 'Add violation', noun: 'violation', types: VIOLATION_TYPES },
  comp_losses: { title: 'Comp Losses', add: 'Add comp loss', noun: 'comp loss', types: COMP_TYPES },
};

function IncidentModal({ kind, initial, onClose }: { kind: IncidentKind; initial: Incident | null; onClose: () => void }) {
  const { w, up } = useWf();
  const meta = KIND_LABEL[kind];
  const [x, setX] = useState<Incident>(initial ?? { key: uuid(), driver_key: w.drivers[0]?.key ?? '', vehicle_key: w.vehicles[0]?.key ?? '', date: '', type: meta.types[0], amount: '', at_fault: kind === 'accidents', description: '' });
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (!x.date) return setErr('Enter the date.');
    if (x.date > today()) return setErr('The date cannot be in the future.');
    if (kind !== 'comp_losses' && !x.driver_key) return setErr('Choose the driver.');
    up((wf) => ({ ...wf, incidents: { ...wf.incidents, [kind]: initial ? wf.incidents[kind].map((i) => (i.key === x.key ? x : i)) : [...wf.incidents[kind], x] } }));
    onClose();
  };
  const set = (patch: Partial<Incident>) => setX((cur) => ({ ...cur, ...patch }));
  return (
    <Modal title={`${initial ? 'Edit' : 'Add'} ${meta.noun}`} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={save}>{initial ? 'Save' : 'Add'}</Button>
    </>}>
      <div className="space-y-5 pt-2">
        {err && <div className="text-[12px] text-red-600">{err}</div>}
        {kind !== 'comp_losses'
          ? <OSelect label="Driver" required="proceed" value={x.driver_key} onChange={(driver_key) => set({ driver_key })} options={w.drivers.map((d) => ({ value: d.key, label: driverName(d) }))} />
          : <OSelect label="Vehicle" value={x.vehicle_key} onChange={(vehicle_key) => set({ vehicle_key })} options={w.vehicles.map((v, i) => ({ value: v.key, label: vehicleName(v, i) }))} />}
        <OInput label="Date" required="proceed" type="date" value={x.date} onChange={(date) => set({ date })} />
        <OSelect label="Type" required="proceed" value={x.type} onChange={(type) => set({ type, at_fault: kind === 'accidents' ? !/Not-at-fault|parked|Hit and run/.test(type) : x.at_fault })} options={meta.types} />
        {kind !== 'violations' && <OInput label="Amount Paid" inputMode="numeric" value={x.amount ? `$${Number(x.amount).toLocaleString('en-US')}` : ''} onChange={(v) => set({ amount: v.replace(/\D/g, '').slice(0, 7) })} />}
        {kind === 'accidents' && (
          <label className="flex items-center gap-2 text-[13px] text-ink-800"><input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={x.at_fault} onChange={(e) => set({ at_fault: e.target.checked })} /> Driver was at fault</label>
        )}
        <OInput label="Description" value={x.description} onChange={(description) => set({ description })} maxLength={120} />
      </div>
    </Modal>
  );
}

function IncidentSection({ kind }: { kind: IncidentKind }) {
  const { w, up, issues } = useWf();
  const [editing, setEditing] = useState<Incident | null | 'new'>(null);
  const meta = KIND_LABEL[kind];
  const list = w.incidents[kind];
  const who = (x: Incident) => (kind === 'comp_losses' ? vehicleName(w.vehicles.find((v) => v.key === x.vehicle_key) ?? blankVehicle([]), Math.max(0, w.vehicles.findIndex((v) => v.key === x.vehicle_key))) : driverName(w.drivers.find((d) => d.key === x.driver_key) ?? { first_name: '', last_name: '' } as never));
  return (
    <div className="mb-5">
      <SectionTitle ok={clean(issues, ...list.map((x) => `incident.${x.key}`))}>{meta.title}</SectionTitle>
      {list.length > 0 && (
        <div className="bg-white border border-ink-200 rounded mb-2 max-w-[820px] divide-y divide-ink-100">
          {list.map((x) => (
            <div key={x.key} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]" data-field={`incident.${x.key}`}>
              <span className="w-24 text-ink-600">{x.date ? fmtDate(x.date) : <span className="text-amber-600">No date</span>}</span>
              <span className="font-medium text-ink-900 min-w-[140px]">{who(x)}</span>
              <span className="text-ink-700 flex-1">{x.type}{kind === 'accidents' && <span className={cx('ml-2 text-[11px]', x.at_fault ? 'text-red-600' : 'text-ink-400')}>{x.at_fault ? 'At fault' : 'Not at fault'}</span>}</span>
              {x.amount && <span className="tabular-nums text-ink-700">{fmtMoney(Number(x.amount))}</span>}
              <button type="button" aria-label="Edit" onClick={() => setEditing(x)} className="text-ink-500 hover:text-brand-600"><Pencil size={14} /></button>
              <button type="button" aria-label="Delete" onClick={() => up((wf) => ({ ...wf, incidents: { ...wf.incidents, [kind]: wf.incidents[kind].filter((i) => i.key !== x.key) } }))} className="text-ink-500 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <TextBtn onClick={() => setEditing('new')}>{meta.add}</TextBtn>
      {editing && <IncidentModal kind={kind} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function IncidentsStep() {
  return (
    <div>
      <IncidentSection kind="accidents" />
      <IncidentSection kind="violations" />
      <IncidentSection kind="comp_losses" />
      <CarrierQuestions step="incidents" title="Additional Carrier Questions" />
      <StepFooter back={{ label: 'Vehicles', to: 'vehicles' }} next={{ label: 'Coverage', to: 'coverage' }} />
    </div>
  );
}

// ── Step 6: Coverage ──

export function CoverageStep() {
  const { w, up, issues } = useWf();
  const { toast } = useFeedback();
  const c = w.coverage;
  const set = (patch: Partial<typeof c>) => up((x) => ({ ...x, coverage: { ...x.coverage, ...patch } }));
  const setVeh = (key: string, patch: Partial<VehicleCoverage>) => up((x) => {
    const targets = x.coverage.apply_all ? x.vehicles.map((v) => v.key) : [key];
    const vehicles = { ...x.coverage.vehicles };
    for (const k of targets) vehicles[k] = { ...(vehicles[k] ?? blankVehicleCoverage()), ...patch };
    return { ...x, coverage: { ...x.coverage, vehicles } };
  });
  const tx = w.rating.state === 'TX';
  return (
    <div>
      <SectionTitle ok={clean(issues, 'coverage.bi', 'coverage.um', 'coverage.uim', 'coverage.pd', 'coverage.medpay')}>General Coverage</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        <WSelect field="coverage.bi" label="Bodily Injury" required value={c.bi} onChange={(bi) => set({ bi })} options={BI_OPTIONS} />
        <WSelect field="coverage.um" label="Uninsured Motorist" required value={c.um} onChange={(um) => set({ um })} options={UM_OPTIONS} />
        <WSelect field="coverage.uim" label="Underinsured Motorist" required value={c.uim} onChange={(uim) => set({ uim })} options={UM_OPTIONS} />
        <WSelect field="coverage.pd" label="Property Damage" required value={c.pd} onChange={(pd) => set({ pd })} options={PD_OPTIONS} />
        <WSelect field="coverage.medpay" label="Medical Payments" required value={c.medpay} onChange={(medpay) => set({ medpay })} options={MEDPAY_OPTIONS} />
      </div>
      <SectionTitle ok>State Specific Coverage - {w.rating.state}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        <WSelect field="coverage.umpd" label="Uninsured Motorist Property Damage" value={c.umpd} onChange={(umpd) => set({ umpd })} options={UMPD_OPTIONS} disabled={c.um === 'No Coverage'} />
        <WSelect field="coverage.pip" label="Personal Injury Protection" value={c.pip} onChange={(pip) => set({ pip })} options={PIP_OPTIONS} />
        {tx && <WSelect field="coverage.adi" label="Auto Death Indemnity" value={c.adi} onChange={(adi) => set({ adi })} options={ADI_OPTIONS} />}
      </div>
      <SectionTitle ok={clean(issues, 'coverage.residence')}>Credits</SectionTitle>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <WSelect field="coverage.residence" label="Residence is" required value={c.residence} onChange={(residence) => set({ residence })} options={RESIDENCE} className="w-full sm:w-64" />
        <div className="flex flex-wrap gap-x-6 gap-y-3 border border-ink-200 rounded px-4 py-2.5 bg-white">
          <Switch label="Multipolicy Discount" checked={c.multipolicy} onChange={(multipolicy) => set({ multipolicy })} />
          <Switch label="Retirement Community" checked={c.retirement} onChange={(retirement) => set({ retirement })} />
          <Switch label="Auto Club Membership Discount" checked={c.aaa} onChange={(aaa) => set({ aaa })} />
          <Switch label="Applicant has a company car insured elsewhere" checked={c.company_car} onChange={(company_car) => set({ company_car })} />
        </div>
      </div>
      <div className="mt-4 mb-3">
        <Switch label="Apply Coverage to all Vehicles" checked={c.apply_all} onChange={(apply_all) => up((x) => {
          if (!apply_all || !x.vehicles.length) return { ...x, coverage: { ...x.coverage, apply_all } };
          const first = x.coverage.vehicles[x.vehicles[0].key] ?? blankVehicleCoverage();
          return { ...x, coverage: { ...x.coverage, apply_all, vehicles: Object.fromEntries(x.vehicles.map((v) => [v.key, { ...first }])) } };
        })} />
      </div>
      {w.vehicles.map((v, i) => {
        const vc = c.vehicles[v.key] ?? blankVehicleCoverage();
        const financed = v.ownership === 'Financed' || v.ownership === 'Leased';
        const f = (k: string) => `vcov.${v.key}.${k}`;
        return (
          <Card key={v.key} title={`Vehicle ${i + 1}`} ok={clean(issues, `vcov.${v.key}.`)}
            subtitle={<span className="inline-flex items-center gap-2">{vehicleName(v, i)}{v.vin && <><span className="ml-3">VIN: {v.vin}</span><button type="button" aria-label="Copy VIN" onClick={() => navigator.clipboard?.writeText(v.vin).then(() => toast('VIN copied', 'info'))} className="text-ink-500 hover:text-brand-600"><Copy size={13} /></button></>}</span>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
              <WSelect field={f('comp')} label="Comprehensive" required value={vc.comp} onChange={(comp) => setVeh(v.key, { comp })} options={COMP_DED} />
              <WSelect field={f('coll')} label="Collision" required value={vc.coll} onChange={(coll) => setVeh(v.key, { coll })} options={COLL_DED} />
              <WSelect field={f('towing')} label="Towing & Labor" required value={vc.towing} onChange={(towing) => setVeh(v.key, { towing })} options={TOWING} />
              <WSelect field={f('rental')} label="Rental Expense" required value={vc.rental} onChange={(rental) => setVeh(v.key, { rental })} options={RENTAL} />
              <WInput field={f('stated')} label="Stated Amount" inputMode="numeric" value={vc.stated ? `$${Number(vc.stated).toLocaleString('en-US')}` : ''} onChange={(x) => setVeh(v.key, { stated: x.replace(/\D/g, '').slice(0, 7) })} />
              <div className="flex items-center"><Switch label="Loan/Lease Coverage" checked={vc.loan_lease && financed} disabled={!financed} onChange={(loan_lease) => setVeh(v.key, { loan_lease })} /></div>
              <div className="flex items-center"><Switch label="Liability Not Required" checked={vc.liability_not_required} onChange={(liability_not_required) => setVeh(v.key, { liability_not_required })} /></div>
              <div className="flex items-center"><Switch label="Full Glass" checked={vc.full_glass} disabled={vc.comp === 'No Coverage'} onChange={(full_glass) => setVeh(v.key, { full_glass })} /></div>
            </div>
            <CarrierQuestions step="coverage" subject={v.key} title="Carrier Questions" />
          </Card>
        );
      })}
      <StepFooter back={{ label: 'Incidents', to: 'incidents' }} next={{ label: 'Carrier questions', to: 'carrier' }} />
    </div>
  );
}

// ── Step 7: Carrier Questions ──

export function CarrierStep() {
  const { w, up, autoCarriers, issues, hidePrefilled } = useWf();
  const names = autoCarriers.map((c) => c.name);
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  const setAns = (k: string, v: string) => up((x) => ({ ...x, answers: { ...x.answers, [k]: v }, prefilled: x.prefilled.filter((p) => p !== k) }));
  const carriers = w.rating.carriers;
  return (
    <div>
      <div className="bg-white border border-ink-200 rounded shadow-card p-4">
        <h3 className="text-[15px] text-ink-900 mb-2">Carrier Questions</h3>
        {!carriers.length && <p className="text-[13px] text-ink-500">Select carriers on the Rating step first.</p>}
        <div className="divide-y divide-ink-100">
          {carriers.map((c) => {
            const qs = questionsFor(c, names).filter((q) => q.step === 'carrier');
            const rows = qs.flatMap((q) => (q.per === 'driver' ? rated.map((d) => ({ q, subj: d.key, label: `${q.label} ${driverName(d)}` })) : q.per === 'vehicle' ? w.vehicles.map((v, i) => ({ q, subj: v.key, label: `${q.label} ${vehicleName(v, i)}?` })) : [{ q, subj: '', label: q.label }]))
              .filter((r) => !hidePrefilled || !w.prefilled.includes(answerKey(c, r.q.id, r.subj)));
            return (
              <div key={c} className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4 py-4">
                <div><CarrierMark name={c} /></div>
                {rows.length === 0 ? <div className="text-[13px] text-ink-400">{qs.length ? 'All questions answered by prefill.' : 'No additional questions for this carrier.'}</div> : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-4">
                    {rows.map(({ q, subj, label }) => {
                      const k = answerKey(c, q.id, subj);
                      const msg = issues.get(`answer.${k}`);
                      return (
                        <div key={k} data-field={`answer.${k}`}>
                          <div className="text-[13px] text-ink-800 mb-1.5">{q.required && <span className="text-red-600">*</span>}{label}</div>
                          <div className="flex items-center gap-3">
                            <select aria-label={label} value={w.answers[k] ?? ''} onChange={(e) => setAns(k, e.target.value)}
                              className={cx('flex-1 h-10 rounded border bg-white px-3 text-[14px] outline-none focus:border-brand-500', msg ? 'border-amber-500' : 'border-ink-300')}>
                              <option value="">{q.required ? 'Select' : ''}</option>
                              {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <Help text={q.help} />
                          </div>
                          {msg && <div className="text-[11px] text-ink-600 mt-1">{msg}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <StepFooter back={{ label: 'Coverage', to: 'coverage' }} next={{ label: 'Finish', to: 'review' }} />
    </div>
  );
}
