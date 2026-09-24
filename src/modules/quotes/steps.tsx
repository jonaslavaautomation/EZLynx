import { Calculator, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Checkbox, IconButton } from '@/components/ui';
import { age, fmtMoney } from '@/lib/format';
import { US_STATES, type LineOfBusiness } from '@/lib/types';
import { NumField, SectionTitle, SelectField, TextField } from './components';
import {
  BI_LIMITS, BUSINESS_CLASSES, CA_CSL, CA_RADIUS, CA_TYPES, COMM_DEDUCTIBLES, CONSTRUCTION, EL_LIMITS, GENDERS, GL_LIMITS, HOME_DEDUCTIBLES, HOME_LIABILITY,
  HOME_MEDPAY, MARITAL, MEDPAY_LIMITS, OWNERSHIP, PD_LIMITS, PHYS_DEDUCTIBLES, PRIOR_INSURANCE, RELATIONSHIPS, RENTERS_PP, ROOF_TYPES, UMBRELLA_LIMITS, USAGES, WC_CLASSES,
  blankDriver, blankVehicle, estimateVehicleValue, moneyOpt, newKey, sectionOf,
  type AccountRisk, type AutoDriverInput, type AutoVehicleInput, type Errors, type QuoteInput, type SectionKey,
} from './inputs';

export type SetSection = <K extends SectionKey>(key: K, patch: Partial<NonNullable<QuoteInput[K]>>) => void;

type StepProps = { line: LineOfBusiness; input: QuoteInput; set: SetSection; errors: Errors; risk: AccountRisk };

const grid = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3';
const card = 'border border-ink-100 rounded p-3 bg-white';
const stateOpts = US_STATES;
const dedOpt = (n: number) => moneyOpt(n, 'No coverage');

// ────────────────────────── Risk details ──────────────────────────

export function RiskStep(props: StepProps) {
  switch (sectionOf(props.line)) {
    case 'auto': return <AutoRisk {...props} />;
    case 'home': return <HomeRisk {...props} />;
    case 'renters': return <RentersRisk {...props} />;
    case 'condo': return <CondoRisk {...props} />;
    case 'umbrella': return <UmbrellaRisk {...props} />;
    case 'commercial': return <CommercialRisk {...props} />;
    case 'wc': return <WCRisk {...props} />;
    case 'cauto': return <CARisk {...props} />;
  }
}

function AutoRisk({ input, set, errors, risk }: StepProps) {
  const a = input.auto!;
  const setDriver = (key: string, patch: Partial<AutoDriverInput>) => set('auto', { drivers: a.drivers.map((d) => (d.key === key ? { ...d, ...patch } : d)) });
  const setVehicle = (key: string, patch: Partial<AutoVehicleInput>) => set('auto', { vehicles: a.vehicles.map((v) => (v.key === key ? { ...v, ...patch } : v)) });
  const zip = risk.account?.zip ?? a.vehicles[0]?.garaging_zip ?? '';
  return (
    <div className="space-y-5">
      <div className={grid}>
        <SelectField label="Rating state" required value={a.state} onChange={(v) => set('auto', { state: v })} options={stateOpts} placeholder="Select" error={errors['auto.state']} />
        <SelectField label="Prior insurance" value={a.prior_insurance} onChange={(v) => set('auto', { prior_insurance: v })} options={PRIOR_INSURANCE} hint="Continuous coverage history" />
        <SelectField label="Policy term" value={a.term_months} onChange={(v) => set('auto', { term_months: v })} options={[{ value: 6, label: '6 months' }, { value: 12, label: '12 months' }]} />
      </div>

      <div>
        <SectionTitle actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => set('auto', { drivers: [...a.drivers, blankDriver(risk.account, a.drivers.length === 0)] })}>Add driver</Button>}>
          Drivers ({a.drivers.length})
        </SectionTitle>
        {errors['auto.drivers'] && <div className="text-xs text-red-600 mb-2">{errors['auto.drivers']}</div>}
        <div className="space-y-3">
          {a.drivers.map((d, i) => {
            const e = (f: string) => errors[`d.${d.key}.${f}`];
            const ag = age(d.dob);
            return (
              <div key={d.key} className={card}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-ink-800">
                    Driver {i + 1}{d.first_name ? ` — ${d.first_name} ${d.last_name}` : ''}
                    {ag !== null && <span className="text-ink-400 font-normal"> · age {ag}</span>}
                    {!d.id && <span className="ml-2 text-[11px] font-semibold text-violet-600">New</span>}
                  </div>
                  <IconButton label="Remove driver" onClick={() => set('auto', { drivers: a.drivers.filter((x) => x.key !== d.key) })}><Trash2 size={15} /></IconButton>
                </div>
                <div className={grid}>
                  <TextField label="First name" required value={d.first_name} onChange={(v) => setDriver(d.key, { first_name: v })} error={e('first_name')} />
                  <TextField label="Last name" required value={d.last_name} onChange={(v) => setDriver(d.key, { last_name: v })} error={e('last_name')} />
                  <TextField label="Date of birth" required type="date" value={d.dob} onChange={(v) => setDriver(d.key, { dob: v })} error={e('dob')} />
                  <SelectField label="Gender" value={d.gender} onChange={(v) => setDriver(d.key, { gender: v })} options={GENDERS} placeholder="—" />
                  <SelectField label="Marital status" value={d.marital_status} onChange={(v) => setDriver(d.key, { marital_status: v })} options={MARITAL} placeholder="—" />
                  <SelectField label="Relationship" value={d.relationship} onChange={(v) => setDriver(d.key, { relationship: v })} options={RELATIONSHIPS} />
                  <TextField label="License #" value={d.license_number} onChange={(v) => setDriver(d.key, { license_number: v })} />
                  <SelectField label="License state" value={d.license_state} onChange={(v) => setDriver(d.key, { license_state: v })} options={stateOpts} placeholder="—" />
                  <NumField label="Violations (3 yrs)" min={0} value={d.violations} onChange={(n) => setDriver(d.key, { violations: n })} error={e('violations')} />
                  <NumField label="At-fault accidents (3 yrs)" min={0} value={d.accidents} onChange={(n) => setDriver(d.key, { accidents: n })} error={e('accidents')} />
                  {ag !== null && ag < 25 && (
                    <div className="flex items-end pb-2"><Checkbox label="Good student (B avg)" checked={d.good_student} onChange={(v) => setDriver(d.key, { good_student: v })} /></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => set('auto', { vehicles: [...a.vehicles, blankVehicle(zip)] })}>Add vehicle</Button>}>
          Vehicles ({a.vehicles.length})
        </SectionTitle>
        {errors['auto.vehicles'] && <div className="text-xs text-red-600 mb-2">{errors['auto.vehicles']}</div>}
        <div className="space-y-3">
          {a.vehicles.map((v, i) => {
            const e = (f: string) => errors[`v.${v.key}.${f}`];
            return (
              <div key={v.key} className={card}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-ink-800">
                    Vehicle {i + 1}{v.make ? ` — ${v.year} ${v.make} ${v.model}` : ''}
                    {!v.id && <span className="ml-2 text-[11px] font-semibold text-violet-600">New</span>}
                  </div>
                  <IconButton label="Remove vehicle" onClick={() => set('auto', { vehicles: a.vehicles.filter((x) => x.key !== v.key) })}><Trash2 size={15} /></IconButton>
                </div>
                <div className={grid}>
                  <NumField label="Year" required value={v.year} onChange={(n) => setVehicle(v.key, { year: n })} error={e('year')} />
                  <TextField label="Make" required value={v.make} onChange={(s) => setVehicle(v.key, { make: s })} error={e('make')} />
                  <TextField label="Model" required value={v.model} onChange={(s) => setVehicle(v.key, { model: s })} error={e('model')} />
                  <TextField label="VIN" value={v.vin} maxLength={17} onChange={(s) => setVehicle(v.key, { vin: s.toUpperCase() })} error={e('vin')} />
                  <SelectField label="Usage" value={v.usage} onChange={(s) => setVehicle(v.key, { usage: s })} options={USAGES} />
                  <NumField label="Annual miles" step={1000} value={v.annual_miles} onChange={(n) => setVehicle(v.key, { annual_miles: n })} error={e('annual_miles')} />
                  <SelectField label="Ownership" value={v.ownership} onChange={(s) => setVehicle(v.key, { ownership: s })} options={OWNERSHIP} />
                  <TextField label="Garaging ZIP" required value={v.garaging_zip} maxLength={5} onChange={(s) => setVehicle(v.key, { garaging_zip: s.replace(/\D/g, '') })} error={e('garaging_zip')} />
                  <div className="col-span-2 sm:col-span-1 flex items-end gap-1">
                    <NumField className="flex-1" label="Est. value ($)" step={500} value={v.value} onChange={(n) => setVehicle(v.key, { value: n })} error={e('value')} />
                    <IconButton label="Estimate from year & make" className="mb-0.5" onClick={() => setVehicle(v.key, { value: estimateVehicleValue(v.year, v.make) })}><Calculator size={15} /></IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PropertyPicker({ risk, onPick, current }: { risk: AccountRisk; onPick: (id: string) => void; current: string | null }) {
  if (risk.properties.length < 2) return null;
  return (
    <SelectField
      className="max-w-md"
      label="Prefill from account property"
      value={current ?? ''}
      onChange={(id) => id && onPick(id)}
      placeholder="Choose a property"
      options={risk.properties.map((p) => ({ value: p.id, label: [p.address, p.city, p.state].filter(Boolean).join(', ') }))}
    />
  );
}

function HomeRisk({ input, set, errors, risk }: StepProps) {
  const h = input.home!;
  const e = (f: string) => errors[`home.${f}`];
  const pick = (id: string) => {
    const p = risk.properties.find((x) => x.id === id);
    if (!p) return;
    set('home', {
      property_id: p.id, address: p.address, city: p.city ?? '', state: p.state ?? h.state, zip: p.zip ?? '', year_built: Number(p.year_built) || h.year_built,
      square_feet: Number(p.square_feet) || h.square_feet, construction: p.construction ?? h.construction, roof_type: p.roof_type ?? h.roof_type,
      roof_year: Number(p.roof_year) || h.roof_year, protection_class: Number(p.protection_class) || h.protection_class, dwelling: Number(p.dwelling_value) || h.dwelling,
    });
  };
  return (
    <div className="space-y-4">
      <PropertyPicker risk={risk} current={h.property_id} onPick={pick} />
      {!risk.properties.length && <div className="text-xs text-ink-400">No property on file for this account — enter the dwelling details below.</div>}
      <SectionTitle>Location</SectionTitle>
      <div className={grid}>
        <TextField className="col-span-2" label="Street address" required value={h.address} onChange={(v) => set('home', { address: v })} error={e('address')} />
        <TextField label="City" value={h.city} onChange={(v) => set('home', { city: v })} />
        <SelectField label="State" required value={h.state} onChange={(v) => set('home', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <TextField label="ZIP" required value={h.zip} maxLength={5} onChange={(v) => set('home', { zip: v.replace(/\D/g, '') })} error={e('zip')} />
      </div>
      <SectionTitle>Dwelling</SectionTitle>
      <div className={grid}>
        <NumField label="Year built" required value={h.year_built} onChange={(n) => set('home', { year_built: n })} error={e('year_built')} />
        <NumField label="Square feet" required step={50} value={h.square_feet} onChange={(n) => set('home', { square_feet: n })} error={e('square_feet')} />
        <SelectField label="Construction" value={h.construction} onChange={(v) => set('home', { construction: v })} options={CONSTRUCTION} />
        <SelectField label="Roof type" value={h.roof_type} onChange={(v) => set('home', { roof_type: v })} options={ROOF_TYPES} />
        <NumField label="Roof year" required value={h.roof_year} onChange={(n) => set('home', { roof_year: n })} error={e('roof_year')} hint={Number.isFinite(h.roof_year) ? `${new Date().getFullYear() - h.roof_year} yrs old` : undefined} />
        <NumField label="Protection class" required min={1} max={10} value={h.protection_class} onChange={(n) => set('home', { protection_class: n })} error={e('protection_class')} hint="1 (best) – 10" />
        <NumField label="Claims in last 5 yrs" min={0} value={h.claims_5yr} onChange={(n) => set('home', { claims_5yr: n })} error={e('claims_5yr')} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox label="Central-station alarm" checked={h.alarm} onChange={(v) => set('home', { alarm: v })} />
        <Checkbox label="Automatic sprinklers" checked={h.sprinklers} onChange={(v) => set('home', { sprinklers: v })} />
      </div>
    </div>
  );
}

function RentersRisk({ input, set, errors }: StepProps) {
  const r = input.renters!;
  const e = (f: string) => errors[`renters.${f}`];
  return (
    <div className="space-y-4">
      <div className={grid}>
        <TextField className="col-span-2" label="Street address" value={r.address} onChange={(v) => set('renters', { address: v })} />
        <TextField label="City" value={r.city} onChange={(v) => set('renters', { city: v })} />
        <SelectField label="State" required value={r.state} onChange={(v) => set('renters', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <TextField label="ZIP" required value={r.zip} maxLength={5} onChange={(v) => set('renters', { zip: v.replace(/\D/g, '') })} error={e('zip')} />
        <NumField label="Claims in last 5 yrs" min={0} value={r.claims_5yr} onChange={(n) => set('renters', { claims_5yr: n })} error={e('claims_5yr')} />
      </div>
      <Checkbox label="Monitored alarm" checked={r.alarm} onChange={(v) => set('renters', { alarm: v })} />
    </div>
  );
}

function CondoRisk({ input, set, errors }: StepProps) {
  const c = input.condo!;
  const e = (f: string) => errors[`condo.${f}`];
  return (
    <div className="space-y-4">
      <div className={grid}>
        <TextField className="col-span-2" label="Unit address" required value={c.address} onChange={(v) => set('condo', { address: v })} error={e('address')} />
        <TextField label="City" value={c.city} onChange={(v) => set('condo', { city: v })} />
        <SelectField label="State" required value={c.state} onChange={(v) => set('condo', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <TextField label="ZIP" required value={c.zip} maxLength={5} onChange={(v) => set('condo', { zip: v.replace(/\D/g, '') })} error={e('zip')} />
        <NumField label="Year built" required value={c.year_built} onChange={(n) => set('condo', { year_built: n })} error={e('year_built')} />
        <NumField label="Protection class" required min={1} max={10} value={c.protection_class} onChange={(n) => set('condo', { protection_class: n })} error={e('protection_class')} />
        <NumField label="Claims in last 5 yrs" min={0} value={c.claims_5yr} onChange={(n) => set('condo', { claims_5yr: n })} error={e('claims_5yr')} />
      </div>
      <Checkbox label="Monitored alarm" checked={c.alarm} onChange={(v) => set('condo', { alarm: v })} />
    </div>
  );
}

function UmbrellaRisk({ input, set, errors }: StepProps) {
  const u = input.umbrella!;
  const e = (f: string) => errors[`umbrella.${f}`];
  return (
    <div className="space-y-4">
      <div className={grid}>
        <SelectField label="State" required value={u.state} onChange={(v) => set('umbrella', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <NumField label="Autos" min={0} value={u.autos} onChange={(n) => set('umbrella', { autos: n })} error={e('autos')} />
        <NumField label="Youthful drivers (<25)" min={0} value={u.youthful_drivers} onChange={(n) => set('umbrella', { youthful_drivers: n })} error={e('youthful_drivers')} />
        <NumField label="Residences" min={0} value={u.residences} onChange={(n) => set('umbrella', { residences: n })} error={e('residences')} />
        <NumField label="Rental units" min={0} value={u.rental_units} onChange={(n) => set('umbrella', { rental_units: n })} error={e('rental_units')} />
        <NumField label="Watercraft" min={0} value={u.watercraft} onChange={(n) => set('umbrella', { watercraft: n })} error={e('watercraft')} />
        <NumField label="Household violations (3 yrs)" min={0} value={u.violations} onChange={(n) => set('umbrella', { violations: n })} error={e('violations')} />
      </div>
    </div>
  );
}

function CommercialRisk({ line, input, set, errors, risk }: StepProps) {
  const c = input.commercial!;
  const e = (f: string) => errors[`commercial.${f}`];
  return (
    <div className="space-y-4">
      <SectionTitle>Business</SectionTitle>
      <div className={grid}>
        <TextField className="col-span-2" label="Business name" required value={c.business_name} onChange={(v) => set('commercial', { business_name: v })} error={e('business_name')} placeholder={risk.account?.business_name ?? ''} />
        <SelectField className="col-span-2" label="Business class" value={c.class_key} onChange={(v) => set('commercial', { class_key: v })} options={BUSINESS_CLASSES.map((b) => ({ value: b.key, label: b.label }))} />
        <SelectField label="State" required value={c.state} onChange={(v) => set('commercial', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <TextField label="ZIP" required value={c.zip} maxLength={5} onChange={(v) => set('commercial', { zip: v.replace(/\D/g, '') })} error={e('zip')} />
        <NumField label="Annual revenue ($)" required step={10000} value={c.revenue} onChange={(n) => set('commercial', { revenue: n })} error={e('revenue')} />
        <NumField label="Employees" min={0} value={c.employees} onChange={(n) => set('commercial', { employees: n })} error={e('employees')} />
        <NumField label="Years in business" min={0} value={c.years_in_business} onChange={(n) => set('commercial', { years_in_business: n })} error={e('years_in_business')} />
        <NumField label="Claims in last 5 yrs" min={0} value={c.claims_5yr} onChange={(n) => set('commercial', { claims_5yr: n })} error={e('claims_5yr')} />
      </div>
      {line === 'BOP' && (
        <>
          <SectionTitle>Property</SectionTitle>
          <div className={grid}>
            <NumField label="Building value ($)" step={10000} value={c.building_value} onChange={(n) => set('commercial', { building_value: n })} error={e('building_value')} hint="0 if you lease the space" />
            <NumField label="Business personal property ($)" step={5000} value={c.bpp_value} onChange={(n) => set('commercial', { bpp_value: n })} error={e('bpp_value')} />
            <SelectField label="Construction" value={c.construction} onChange={(v) => set('commercial', { construction: v })} options={CONSTRUCTION.filter((x) => x !== 'Manufactured')} />
            <NumField label="Protection class" min={1} max={10} value={c.protection_class} onChange={(n) => set('commercial', { protection_class: n })} error={e('protection_class')} />
          </div>
        </>
      )}
    </div>
  );
}

function WCRisk({ input, set, errors }: StepProps) {
  const w = input.wc!;
  const e = (f: string) => errors[`wc.${f}`];
  const total = w.classes.reduce((s, c) => s + (Number.isFinite(c.payroll) ? c.payroll : 0), 0);
  return (
    <div className="space-y-4">
      <div className={grid}>
        <SelectField label="Governing state" required value={w.state} onChange={(v) => set('wc', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <NumField label="Employees" required min={1} value={w.employees} onChange={(n) => set('wc', { employees: n })} error={e('employees')} />
        <NumField label="Experience mod" step={0.01} min={0.5} max={3} value={w.experience_mod} onChange={(n) => set('wc', { experience_mod: n })} error={e('experience_mod')} hint="1.00 if unrated" />
        <NumField label="Years in business" min={0} value={w.years_in_business} onChange={(n) => set('wc', { years_in_business: n })} error={e('years_in_business')} />
        <NumField label="Claims in last 5 yrs" min={0} value={w.claims_5yr} onChange={(n) => set('wc', { claims_5yr: n })} error={e('claims_5yr')} />
      </div>
      <SectionTitle actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => set('wc', { classes: [...w.classes, { key: newKey(), code: '8810', payroll: 50000 }] })}>Add class</Button>}>
        Class codes · total payroll {fmtMoney(total)}
      </SectionTitle>
      {e('classes') && <div className="text-xs text-red-600">{e('classes')}</div>}
      <div className="space-y-2">
        {w.classes.map((c) => (
          <div key={c.key} className="flex items-end gap-2">
            <SelectField className="flex-1 min-w-0" label="Class code" value={c.code} onChange={(v) => set('wc', { classes: w.classes.map((x) => (x.key === c.key ? { ...x, code: v } : x)) })}
              options={WC_CLASSES.map((x) => ({ value: x.code, label: `${x.code} — ${x.label}` }))} error={errors[`wc.${c.key}.code`]} />
            <NumField className="w-32 sm:w-40" label="Annual payroll ($)" step={1000} value={c.payroll} onChange={(n) => set('wc', { classes: w.classes.map((x) => (x.key === c.key ? { ...x, payroll: n } : x)) })} error={errors[`wc.${c.key}.payroll`]} />
            <IconButton label="Remove class" className="mb-0.5" onClick={() => set('wc', { classes: w.classes.filter((x) => x.key !== c.key) })}><Trash2 size={15} /></IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function CARisk({ input, set, errors }: StepProps) {
  const c = input.cauto!;
  const e = (f: string) => errors[`cauto.${f}`];
  return (
    <div className="space-y-4">
      <div className={grid}>
        <SelectField label="State" required value={c.state} onChange={(v) => set('cauto', { state: v })} options={stateOpts} placeholder="—" error={e('state')} />
        <SelectField className="col-span-2" label="Business class" value={c.class_key} onChange={(v) => set('cauto', { class_key: v })} options={BUSINESS_CLASSES.map((b) => ({ value: b.key, label: b.label }))} />
        <SelectField label="Radius of operation" value={c.radius} onChange={(v) => set('cauto', { radius: v })} options={CA_RADIUS} />
        <NumField label="Years in business" min={0} value={c.years_in_business} onChange={(n) => set('cauto', { years_in_business: n })} error={e('years_in_business')} />
        <NumField label="Drivers" min={1} value={c.drivers} onChange={(n) => set('cauto', { drivers: n })} error={e('drivers')} />
        <NumField label="Drivers with violations" min={0} value={c.drivers_with_violations} onChange={(n) => set('cauto', { drivers_with_violations: n })} error={e('drivers_with_violations')} />
      </div>
      <SectionTitle actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => set('cauto', { vehicles: [...c.vehicles, { key: newKey(), year: new Date().getFullYear() - 3, type: 'Light Truck', value: 35000 }] })}>Add vehicle</Button>}>
        Scheduled vehicles ({c.vehicles.length})
      </SectionTitle>
      {e('vehicles') && <div className="text-xs text-red-600">{e('vehicles')}</div>}
      <div className="space-y-2">
        {c.vehicles.map((v, i) => (
          <div key={v.key} className="flex items-end gap-2">
            <span className="text-xs text-ink-400 w-5 pb-2.5">{i + 1}.</span>
            <NumField className="w-20 sm:w-24" label="Year" value={v.year} onChange={(n) => set('cauto', { vehicles: c.vehicles.map((x) => (x.key === v.key ? { ...x, year: n } : x)) })} error={errors[`ca.${v.key}.year`]} />
            <SelectField className="flex-1 min-w-0" label="Type" value={v.type} onChange={(t) => set('cauto', { vehicles: c.vehicles.map((x) => (x.key === v.key ? { ...x, type: t } : x)) })} options={CA_TYPES} />
            <NumField className="w-28 sm:w-36" label="Value ($)" step={1000} value={v.value} onChange={(n) => set('cauto', { vehicles: c.vehicles.map((x) => (x.key === v.key ? { ...x, value: n } : x)) })} error={errors[`ca.${v.key}.value`]} />
            <IconButton label="Remove vehicle" className="mb-0.5" onClick={() => set('cauto', { vehicles: c.vehicles.filter((x) => x.key !== v.key) })}><Trash2 size={15} /></IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────── Coverages ──────────────────────────

export function CoverageStep(props: StepProps) {
  const { line, input, set } = props;
  switch (sectionOf(line)) {
    case 'auto': {
      const a = input.auto!;
      return (
        <div className="space-y-5">
          <SectionTitle>Liability</SectionTitle>
          <div className={grid}>
            <SelectField label="Bodily injury" value={a.bi} onChange={(v) => set('auto', { bi: v })} options={BI_LIMITS.map((b) => ({ value: b, label: `${b} ($${b.replace('/', 'K/$')}K)` }))} />
            <SelectField label="Property damage" value={a.pd} onChange={(v) => set('auto', { pd: v })} options={PD_LIMITS.map((n) => moneyOpt(n))} />
            <SelectField label="Medical payments" value={a.medpay} onChange={(v) => set('auto', { medpay: v })} options={MEDPAY_LIMITS.map((n) => moneyOpt(n))} />
            <div className="flex items-end pb-2"><Checkbox label={`Uninsured motorist (${a.bi})`} checked={a.um} onChange={(v) => set('auto', { um: v })} /></div>
          </div>
          <SectionTitle>Physical damage (all vehicles)</SectionTitle>
          <div className={grid}>
            <SelectField label="Comprehensive deductible" value={a.comp_ded} onChange={(v) => set('auto', { comp_ded: v })} options={PHYS_DEDUCTIBLES.map(dedOpt)} />
            <SelectField label="Collision deductible" value={a.coll_ded} onChange={(v) => set('auto', { coll_ded: v })} options={PHYS_DEDUCTIBLES.map(dedOpt)} />
            <div className="flex items-end pb-2"><Checkbox label="Rental reimbursement" checked={a.rental} onChange={(v) => set('auto', { rental: v })} /></div>
            <div className="flex items-end pb-2"><Checkbox label="Towing & labor" checked={a.towing} onChange={(v) => set('auto', { towing: v })} /></div>
          </div>
          <Discounts>
            <Checkbox label="Homeowner" checked={a.homeowner} onChange={(v) => set('auto', { homeowner: v })} />
            <Checkbox label="Multi-policy (home + auto)" checked={a.multi_policy} onChange={(v) => set('auto', { multi_policy: v })} />
            <Checkbox label="Paid in full" checked={a.paid_in_full} onChange={(v) => set('auto', { paid_in_full: v })} />
          </Discounts>
        </div>
      );
    }
    case 'home': {
      const h = input.home!;
      const est = Number.isFinite(h.square_feet) ? Math.round((h.square_feet * 140) / 1000) * 1000 : null;
      return (
        <div className="space-y-5">
          <div className={grid}>
            <NumField label="Dwelling — Coverage A ($)" required step={5000} value={h.dwelling} onChange={(n) => set('home', { dwelling: n })} error={props.errors['home.dwelling']}
              hint={est ? `Est. replacement cost ~${fmtMoney(est)}` : undefined} />
            <SelectField label="Personal property (C)" value={h.personal_property_pct} onChange={(v) => set('home', { personal_property_pct: v })} options={[50, 60, 70, 75].map((p) => ({ value: p, label: `${p}% of A` }))} />
            <SelectField label="All-peril deductible" value={h.deductible} onChange={(v) => set('home', { deductible: v })} options={HOME_DEDUCTIBLES.map((n) => moneyOpt(n))} />
            <SelectField label="Personal liability (E)" value={h.liability} onChange={(v) => set('home', { liability: v })} options={HOME_LIABILITY.map((n) => moneyOpt(n))} />
            <SelectField label="Medical payments (F)" value={h.medpay} onChange={(v) => set('home', { medpay: v })} options={HOME_MEDPAY.map((n) => moneyOpt(n))} />
          </div>
          {Number.isFinite(h.dwelling) && (
            <div className="text-xs text-ink-500">
              Other structures (B) {fmtMoney(h.dwelling * 0.1)} · Personal property (C) {fmtMoney((h.dwelling * h.personal_property_pct) / 100)} · Loss of use (D) {fmtMoney(h.dwelling * 0.2)}
            </div>
          )}
          <Discounts>
            <Checkbox label="Multi-policy (auto with same carrier)" checked={h.multi_policy} onChange={(v) => set('home', { multi_policy: v })} />
            <Checkbox label="Paid in full" checked={h.paid_in_full} onChange={(v) => set('home', { paid_in_full: v })} />
          </Discounts>
        </div>
      );
    }
    case 'renters': {
      const r = input.renters!;
      return (
        <div className="space-y-5">
          <div className={grid}>
            <SelectField label="Personal property" value={r.personal_property} onChange={(v) => set('renters', { personal_property: v })} options={RENTERS_PP.map((n) => moneyOpt(n))} />
            <SelectField label="Personal liability" value={r.liability} onChange={(v) => set('renters', { liability: v })} options={HOME_LIABILITY.map((n) => moneyOpt(n))} />
            <SelectField label="Medical payments" value={r.medpay} onChange={(v) => set('renters', { medpay: v })} options={HOME_MEDPAY.map((n) => moneyOpt(n))} />
            <SelectField label="Deductible" value={r.deductible} onChange={(v) => set('renters', { deductible: v })} options={[250, 500, 1000].map((n) => moneyOpt(n))} />
          </div>
          <Discounts>
            <Checkbox label="Multi-policy (auto with same carrier)" checked={r.multi_policy} onChange={(v) => set('renters', { multi_policy: v })} />
            <Checkbox label="Paid in full" checked={r.paid_in_full} onChange={(v) => set('renters', { paid_in_full: v })} />
          </Discounts>
        </div>
      );
    }
    case 'condo': {
      const c = input.condo!;
      return (
        <div className="space-y-5">
          <div className={grid}>
            <NumField label="Walls-in — Coverage A ($)" step={5000} value={c.dwelling} onChange={(n) => set('condo', { dwelling: Number.isFinite(n) ? n : 0 })} />
            <NumField label="Personal property ($)" step={5000} value={c.personal_property} onChange={(n) => set('condo', { personal_property: Number.isFinite(n) ? n : 0 })} />
            <SelectField label="Personal liability" value={c.liability} onChange={(v) => set('condo', { liability: v })} options={HOME_LIABILITY.map((n) => moneyOpt(n))} />
            <SelectField label="Deductible" value={c.deductible} onChange={(v) => set('condo', { deductible: v })} options={HOME_DEDUCTIBLES.map((n) => moneyOpt(n))} />
            <SelectField label="Loss assessment" value={c.loss_assessment} onChange={(v) => set('condo', { loss_assessment: v })} options={[1000, 5000, 10000, 25000].map((n) => moneyOpt(n))} />
          </div>
          <Discounts>
            <Checkbox label="Multi-policy (auto with same carrier)" checked={c.multi_policy} onChange={(v) => set('condo', { multi_policy: v })} />
            <Checkbox label="Paid in full" checked={c.paid_in_full} onChange={(v) => set('condo', { paid_in_full: v })} />
          </Discounts>
        </div>
      );
    }
    case 'umbrella': {
      const u = input.umbrella!;
      return (
        <div className={grid}>
          <SelectField label="Umbrella limit" value={u.limit} onChange={(v) => set('umbrella', { limit: v })} options={UMBRELLA_LIMITS.map((n) => ({ value: n, label: `$${n},000,000` }))} />
          <SelectField label="Underlying auto BI" value={u.underlying_auto_bi} onChange={(v) => set('umbrella', { underlying_auto_bi: v })} options={BI_LIMITS} hint="Most carriers require 250/500" />
          <SelectField label="Underlying home liability" value={u.underlying_home_liability} onChange={(v) => set('umbrella', { underlying_home_liability: v })} options={HOME_LIABILITY.map((n) => moneyOpt(n))} />
        </div>
      );
    }
    case 'commercial': {
      const c = input.commercial!;
      return (
        <div className={grid}>
          <SelectField label="GL limits (occ / agg)" value={c.gl_limit} onChange={(v) => set('commercial', { gl_limit: v })} options={GL_LIMITS} />
          {line === 'BOP' && <SelectField label="Property deductible" value={c.deductible} onChange={(v) => set('commercial', { deductible: v })} options={COMM_DEDUCTIBLES.map((n) => moneyOpt(n))} />}
        </div>
      );
    }
    case 'wc': {
      const w = input.wc!;
      return (
        <div className={grid}>
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Part One</div><div className="text-[13px] text-ink-800 h-9 flex items-center">Statutory — {w.state || 'state'}</div></div>
          <SelectField label="Employer's liability" value={w.el_limits} onChange={(v) => set('wc', { el_limits: v })} options={EL_LIMITS} hint="Each accident / disease policy / disease each employee" />
        </div>
      );
    }
    case 'cauto': {
      const c = input.cauto!;
      return (
        <div className={grid}>
          <SelectField label="Combined single limit" value={c.csl} onChange={(v) => set('cauto', { csl: v })} options={CA_CSL.map((n) => moneyOpt(n))} />
          <SelectField label="Comprehensive deductible" value={c.comp_ded} onChange={(v) => set('cauto', { comp_ded: v })} options={[0, 500, 1000, 2500].map(dedOpt)} />
          <SelectField label="Collision deductible" value={c.coll_ded} onChange={(v) => set('cauto', { coll_ded: v })} options={[0, 500, 1000, 2500].map(dedOpt)} />
          <div className="flex items-end pb-2"><Checkbox label="Hired & non-owned auto" checked={c.hnoa} onChange={(v) => set('cauto', { hnoa: v })} /></div>
        </div>
      );
    }
  }
}

function Discounts({ children }: { children: ReactNode }) {
  return (
    <div>
      <SectionTitle>Discounts & billing</SectionTitle>
      <div className="flex flex-wrap gap-x-6 gap-y-2">{children}</div>
    </div>
  );
}
