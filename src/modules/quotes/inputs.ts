import { uuid } from '@/lib/db';
import { age, fmtMoney } from '@/lib/format';
import type { Account, Driver, LineOfBusiness, Property, Quote, Vehicle } from '@/lib/types';

/**
 * Rating input model captured by the quote wizard and stored in `quotes.input`.
 * One section per line family; only the section for the quote's line is kept when saving.
 */

export const QUOTE_LINES: LineOfBusiness[] = [
  'Personal Auto', 'Homeowners', 'Renters', 'Condo', 'Umbrella', 'General Liability', 'BOP', 'Workers Comp', 'Commercial Auto',
];
export const COMMERCIAL_QUOTE_LINES: LineOfBusiness[] = ['General Liability', 'BOP', 'Workers Comp', 'Commercial Auto'];

export const isQuoteLine = (l: string | null | undefined): l is LineOfBusiness => !!l && QUOTE_LINES.includes(l as LineOfBusiness);

// ── Section types ──

export type AutoDriverInput = {
  key: string; id: string | null;
  first_name: string; last_name: string; dob: string; gender: string; marital_status: string; relationship: string;
  license_number: string; license_state: string; violations: number; accidents: number; good_student: boolean;
};

export type AutoVehicleInput = {
  key: string; id: string | null;
  year: number; make: string; model: string; vin: string; usage: string; annual_miles: number; ownership: string; garaging_zip: string; value: number;
  /** Per-vehicle rental / towing (auto quoting workflow); falls back to the policy-level flags. */
  rental?: boolean; towing?: boolean;
};

export type PriorInsurance = 'None' | 'Under 1 year' | '1-3 years' | '3+ years';

export type AutoInput = {
  state: string;
  drivers: AutoDriverInput[];
  vehicles: AutoVehicleInput[];
  bi: string; pd: number; um: boolean; /** UM limit when it differs from BI */ um_limit?: string; medpay: number; comp_ded: number; coll_ded: number; rental: boolean; towing: boolean;
  homeowner: boolean; multi_policy: boolean; paid_in_full: boolean; prior_insurance: PriorInsurance; term_months: number;
};

export type HomeInput = {
  property_id: string | null;
  address: string; city: string; state: string; zip: string;
  year_built: number; square_feet: number; construction: string; roof_type: string; roof_year: number; protection_class: number;
  dwelling: number; personal_property_pct: number; deductible: number; liability: number; medpay: number;
  claims_5yr: number; alarm: boolean; sprinklers: boolean; multi_policy: boolean; paid_in_full: boolean;
};

export type RentersInput = {
  address: string; city: string; state: string; zip: string;
  personal_property: number; liability: number; medpay: number; deductible: number; claims_5yr: number;
  alarm: boolean; multi_policy: boolean; paid_in_full: boolean;
};

export type CondoInput = {
  address: string; city: string; state: string; zip: string; year_built: number; protection_class: number;
  dwelling: number; personal_property: number; liability: number; deductible: number; loss_assessment: number; claims_5yr: number;
  alarm: boolean; multi_policy: boolean; paid_in_full: boolean;
};

export type UmbrellaInput = {
  state: string; limit: number; autos: number; youthful_drivers: number; residences: number; rental_units: number; watercraft: number;
  violations: number; underlying_auto_bi: string; underlying_home_liability: number;
};

export type CommercialInput = {
  business_name: string; state: string; zip: string; class_key: string; revenue: number; employees: number; years_in_business: number;
  claims_5yr: number; gl_limit: string; building_value: number; bpp_value: number; construction: string; protection_class: number; deductible: number;
};

export type WCClassRow = { key: string; code: string; payroll: number };
export type WCInput = {
  state: string; classes: WCClassRow[]; employees: number; experience_mod: number; el_limits: string; years_in_business: number; claims_5yr: number;
};

export type CAVehicleRow = { key: string; year: number; type: string; value: number };
export type CAInput = {
  state: string; class_key: string; vehicles: CAVehicleRow[]; radius: string; csl: number; comp_ded: number; coll_ded: number; hnoa: boolean;
  drivers: number; drivers_with_violations: number; years_in_business: number;
};

export type SectionKey = 'auto' | 'home' | 'renters' | 'condo' | 'umbrella' | 'commercial' | 'wc' | 'cauto';

export type QuoteInput = {
  v: 1;
  carriers: string[];
  save_to_account?: boolean;
  auto?: AutoInput; home?: HomeInput; renters?: RentersInput; condo?: CondoInput; umbrella?: UmbrellaInput;
  commercial?: CommercialInput; wc?: WCInput; cauto?: CAInput;
  lost_reason?: string; lost_notes?: string; bound_at?: string; rated_at?: string;
};

export function sectionOf(line: LineOfBusiness): SectionKey {
  switch (line) {
    case 'Personal Auto': return 'auto';
    case 'Homeowners': return 'home';
    case 'Renters': return 'renters';
    case 'Condo': return 'condo';
    case 'Umbrella': return 'umbrella';
    case 'Workers Comp': return 'wc';
    case 'Commercial Auto': return 'cauto';
    default: return 'commercial';
  }
}

export function termFor(line: LineOfBusiness, input: QuoteInput) {
  return line === 'Personal Auto' ? input.auto?.term_months ?? 6 : 12;
}

// ── Reference lists ──

export const BI_LIMITS = ['25/50', '50/100', '100/300', '250/500'];
export const PD_LIMITS = [25000, 50000, 100000, 250000];
export const MEDPAY_LIMITS = [0, 1000, 5000, 10000];
export const PHYS_DEDUCTIBLES = [0, 250, 500, 1000];
export const USAGES = ['Commute', 'Pleasure', 'Business'];
export const OWNERSHIP = ['Owned', 'Financed', 'Leased'];
export const RELATIONSHIPS = ['Insured', 'Spouse', 'Child', 'Other'];
export const GENDERS = ['Male', 'Female', 'Non-binary'];
export const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
export const PRIOR_INSURANCE: PriorInsurance[] = ['None', 'Under 1 year', '1-3 years', '3+ years'];
export const CONSTRUCTION = ['Frame', 'Masonry', 'Brick Veneer', 'Stucco', 'Log', 'Manufactured'];
export const ROOF_TYPES = ['Composition Shingle', 'Architectural Shingle', 'Metal', 'Tile', 'Wood Shake', 'Flat / Built-up'];
export const HOME_DEDUCTIBLES = [500, 1000, 2500, 5000];
export const HOME_LIABILITY = [100000, 300000, 500000];
export const HOME_MEDPAY = [1000, 5000];
export const RENTERS_PP = [15000, 20000, 30000, 50000, 75000, 100000];
export const UMBRELLA_LIMITS = [1, 2, 3, 4, 5];
export const GL_LIMITS = ['500K/1M', '1M/2M', '2M/4M'];
export const COMM_DEDUCTIBLES = [500, 1000, 2500, 5000];
export const EL_LIMITS = ['100/500/100', '500/500/500', '1M/1M/1M'];
export const CA_TYPES = ['Private Passenger', 'Light Truck', 'Medium Truck', 'Heavy Truck'];
export const CA_RADIUS = ['Local (under 50 mi)', 'Intermediate (50-200 mi)', 'Long haul (200+ mi)'];
export const CA_CSL = [500000, 1000000, 2000000];

/** Business classes shared by GL, BOP and Commercial Auto (GL rate per $1,000 revenue). */
export const BUSINESS_CLASSES: { key: string; label: string; glRate: number; propertyFactor: number; autoFactor: number; wcCode: string }[] = [
  { key: 'office', label: 'Office / Professional Services', glRate: 0.9, propertyFactor: 0.9, autoFactor: 0.9, wcCode: '8810' },
  { key: 'retail', label: 'Retail Store', glRate: 2.1, propertyFactor: 1.0, autoFactor: 0.95, wcCode: '8017' },
  { key: 'restaurant', label: 'Restaurant / Cafe', glRate: 3.4, propertyFactor: 1.35, autoFactor: 1.0, wcCode: '9082' },
  { key: 'landscaping', label: 'Contractor — Landscaping', glRate: 5.8, propertyFactor: 1.0, autoFactor: 1.15, wcCode: '0042' },
  { key: 'hvac', label: 'Contractor — HVAC', glRate: 6.4, propertyFactor: 1.0, autoFactor: 1.12, wcCode: '5537' },
  { key: 'roofing', label: 'Contractor — Roofing', glRate: 14.5, propertyFactor: 1.05, autoFactor: 1.25, wcCode: '5551' },
  { key: 'auto_repair', label: 'Auto Repair Shop', glRate: 4.6, propertyFactor: 1.2, autoFactor: 1.05, wcCode: '8380' },
  { key: 'medical', label: 'Medical / Dental Office', glRate: 1.6, propertyFactor: 0.95, autoFactor: 0.9, wcCode: '8832' },
  { key: 'wholesale', label: 'Wholesale / Distribution', glRate: 1.8, propertyFactor: 1.1, autoFactor: 1.2, wcCode: '8018' },
  { key: 'manufacturing', label: 'Light Manufacturing', glRate: 3.9, propertyFactor: 1.25, autoFactor: 1.1, wcCode: '3632' },
];
export const classLabel = (key: string) => BUSINESS_CLASSES.find((c) => c.key === key)?.label ?? key;

/** Workers comp class codes (rate per $100 payroll). */
export const WC_CLASSES: { code: string; label: string; rate: number }[] = [
  { code: '8810', label: 'Clerical Office Employees', rate: 0.18 },
  { code: '8742', label: 'Outside Salespersons', rate: 0.42 },
  { code: '8017', label: 'Retail Store', rate: 1.2 },
  { code: '9082', label: 'Restaurant', rate: 1.45 },
  { code: '0042', label: 'Landscape Gardening', rate: 4.9 },
  { code: '5537', label: 'HVAC Installation', rate: 3.6 },
  { code: '5551', label: 'Roofing', rate: 12.8 },
  { code: '8380', label: 'Automobile Service / Repair', rate: 3.1 },
  { code: '8832', label: 'Physician / Dental Office', rate: 0.35 },
  { code: '8018', label: 'Wholesale Store', rate: 2.1 },
  { code: '3632', label: 'Machine Shop', rate: 3.4 },
];
export const wcLabel = (code: string) => WC_CLASSES.find((c) => c.code === code)?.label ?? code;

const MAKE_MSRP: Record<string, number> = {
  toyota: 32000, honda: 31000, ford: 44000, chevrolet: 42000, tesla: 48000, subaru: 32000, jeep: 45000, hyundai: 29000, nissan: 28000,
  kia: 38000, bmw: 58000, mercedes: 62000, 'mercedes-benz': 62000, audi: 55000, lexus: 52000, gmc: 47000, ram: 46000, dodge: 38000, mazda: 30000, volkswagen: 31000,
};

/** Rough actual cash value from year and make, rounded to $500. */
export function estimateVehicleValue(year: number, make: string) {
  const msrp = MAKE_MSRP[make.trim().toLowerCase()] ?? 33000;
  const ageYrs = Math.max(0, new Date().getFullYear() - (year || new Date().getFullYear()));
  const v = msrp * Math.pow(0.86, ageYrs);
  return Math.max(2500, Math.round(v / 500) * 500);
}

// ── Defaults / prefill ──

export const newKey = () => uuid();

export function driverFromRow(d: Driver): AutoDriverInput {
  return {
    key: newKey(), id: d.id, first_name: d.first_name, last_name: d.last_name, dob: d.dob ?? '', gender: d.gender ?? '', marital_status: d.marital_status ?? '',
    relationship: d.relationship ?? 'Insured', license_number: d.license_number ?? '', license_state: d.license_state ?? '',
    violations: Number(d.violations) || 0, accidents: Number(d.accidents) || 0, good_student: false,
  };
}

export function vehicleFromRow(v: Vehicle, fallbackZip: string): AutoVehicleInput {
  return {
    key: newKey(), id: v.id, year: Number(v.year), make: v.make, model: v.model, vin: v.vin ?? '', usage: v.usage ?? 'Commute',
    annual_miles: Number(v.annual_miles) || 12000, ownership: v.ownership ?? 'Owned', garaging_zip: v.garaging_zip ?? fallbackZip,
    value: estimateVehicleValue(Number(v.year), v.make),
  };
}

export function blankDriver(account?: Account | null, first = false): AutoDriverInput {
  return {
    key: newKey(), id: null, first_name: first && account ? account.first_name : '', last_name: account?.last_name ?? '', dob: first && account?.dob ? account.dob : '',
    gender: '', marital_status: first && account?.marital_status ? account.marital_status : 'Single', relationship: first ? 'Insured' : 'Spouse',
    license_number: '', license_state: account?.state ?? '', violations: 0, accidents: 0, good_student: false,
  };
}

export function blankVehicle(zip: string): AutoVehicleInput {
  const year = new Date().getFullYear() - 3;
  return { key: newKey(), id: null, year, make: '', model: '', vin: '', usage: 'Commute', annual_miles: 12000, ownership: 'Owned', garaging_zip: zip, value: estimateVehicleValue(year, '') };
}

export type AccountRisk = { account: Account | null; drivers: Driver[]; vehicles: Vehicle[]; properties: Property[] };

/** Builds every section's defaults from the account's stored drivers, vehicles and properties. */
export function buildDefaultInput(risk: AccountRisk, carriers: string[] = []): QuoteInput {
  const a = risk.account;
  const state = a?.state ?? 'TX';
  const zip = a?.zip ?? '';
  const p = risk.properties[0];
  const thisYear = new Date().getFullYear();
  const drivers = risk.drivers.length ? risk.drivers.map(driverFromRow) : [blankDriver(a, true)];
  const vehicles = risk.vehicles.length ? risk.vehicles.map((v) => vehicleFromRow(v, zip)) : [blankVehicle(zip)];
  const hasHome = risk.properties.length > 0;
  const youthful = drivers.filter((d) => (age(d.dob) ?? 30) < 25).length;
  const cls = 'office';
  return {
    v: 1,
    carriers,
    save_to_account: false,
    auto: {
      state, drivers, vehicles, bi: '100/300', pd: 100000, um: true, medpay: 5000, comp_ded: 500, coll_ded: 500, rental: false, towing: true,
      homeowner: hasHome, multi_policy: hasHome, paid_in_full: false, prior_insurance: '3+ years', term_months: 6,
    },
    home: {
      property_id: p?.id ?? null, address: p?.address ?? a?.address ?? '', city: p?.city ?? a?.city ?? '', state: p?.state ?? state, zip: p?.zip ?? zip,
      year_built: Number(p?.year_built) || 2000, square_feet: Number(p?.square_feet) || 2000, construction: p?.construction ?? 'Frame',
      roof_type: p?.roof_type ?? 'Composition Shingle', roof_year: Number(p?.roof_year) || thisYear - 8, protection_class: Number(p?.protection_class) || 4,
      dwelling: Number(p?.dwelling_value) || 300000, personal_property_pct: 50, deductible: 1000, liability: 300000, medpay: 5000,
      claims_5yr: 0, alarm: false, sprinklers: false, multi_policy: risk.vehicles.length > 0, paid_in_full: false,
    },
    renters: {
      address: a?.address ?? '', city: a?.city ?? '', state, zip, personal_property: 30000, liability: 100000, medpay: 1000, deductible: 500,
      claims_5yr: 0, alarm: false, multi_policy: risk.vehicles.length > 0, paid_in_full: false,
    },
    condo: {
      address: p?.address ?? a?.address ?? '', city: p?.city ?? a?.city ?? '', state: p?.state ?? state, zip: p?.zip ?? zip, year_built: Number(p?.year_built) || 2005,
      protection_class: Number(p?.protection_class) || 3, dwelling: 50000, personal_property: 60000, liability: 300000, deductible: 1000, loss_assessment: 5000,
      claims_5yr: 0, alarm: false, multi_policy: risk.vehicles.length > 0, paid_in_full: false,
    },
    umbrella: {
      state, limit: 1, autos: Math.max(1, risk.vehicles.length), youthful_drivers: youthful, residences: Math.max(1, risk.properties.length), rental_units: 0,
      watercraft: 0, violations: risk.drivers.reduce((s, d) => s + (Number(d.violations) || 0), 0), underlying_auto_bi: '250/500', underlying_home_liability: 300000,
    },
    commercial: {
      business_name: a?.business_name ?? '', state, zip, class_key: cls, revenue: 750000, employees: 6, years_in_business: 5, claims_5yr: 0, gl_limit: '1M/2M',
      building_value: 0, bpp_value: 100000, construction: 'Masonry', protection_class: 3, deductible: 1000,
    },
    wc: {
      state, classes: [{ key: newKey(), code: '8810', payroll: 250000 }], employees: 6, experience_mod: 1, el_limits: '500/500/500', years_in_business: 5, claims_5yr: 0,
    },
    cauto: {
      state, class_key: cls, vehicles: [{ key: newKey(), year: thisYear - 3, type: 'Light Truck', value: 38000 }], radius: CA_RADIUS[0], csl: 1000000,
      comp_ded: 1000, coll_ded: 1000, hnoa: true, drivers: 2, drivers_with_violations: 0, years_in_business: 5,
    },
  };
}

/** Fills any missing sections (e.g. an older quote saved with partial input) from account defaults. */
export function mergeInput(stored: Partial<QuoteInput> | null | undefined, defaults: QuoteInput): QuoteInput {
  const s = (stored ?? {}) as Partial<QuoteInput>;
  const out: QuoteInput = { ...defaults, ...s, v: 1, carriers: Array.isArray(s.carriers) ? s.carriers : defaults.carriers };
  (['auto', 'home', 'renters', 'condo', 'umbrella', 'commercial', 'wc', 'cauto'] as SectionKey[]).forEach((k) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[k] = s[k] ? { ...(defaults[k] as object), ...(s[k] as object) } : defaults[k];
  });
  return out;
}

/** Keeps only the section relevant to `line` (plus bookkeeping fields). */
export function pruneInput(line: LineOfBusiness, input: QuoteInput): QuoteInput {
  const key = sectionOf(line);
  const { auto, home, renters, condo, umbrella, commercial, wc, cauto, ...rest } = input;
  const all = { auto, home, renters, condo, umbrella, commercial, wc, cauto };
  return { ...rest, [key]: all[key] } as QuoteInput;
}

export const readInput = (q: Pick<Quote, 'input'>) => (q.input ?? {}) as Partial<QuoteInput>;

export const hasSection = (q: Pick<Quote, 'input' | 'line_of_business'>) => !!readInput(q)[sectionOf(q.line_of_business)];

// ── Validation ──

export type Errors = Record<string, string>;

const bad = (n: unknown) => typeof n !== 'number' || !Number.isFinite(n);
const ZIP = /^\d{5}$/;

export function validateRisk(line: LineOfBusiness, input: QuoteInput): Errors {
  const e: Errors = {};
  const thisYear = new Date().getFullYear();
  const key = sectionOf(line);
  if (key === 'auto') {
    const a = input.auto!;
    if (!a.state) e['auto.state'] = 'Required';
    if (!a.drivers.length) e['auto.drivers'] = 'Add at least one driver';
    if (!a.vehicles.length) e['auto.vehicles'] = 'Add at least one vehicle';
    a.drivers.forEach((d) => {
      if (!d.first_name.trim()) e[`d.${d.key}.first_name`] = 'Required';
      if (!d.last_name.trim()) e[`d.${d.key}.last_name`] = 'Required';
      const ag = age(d.dob);
      if (!d.dob) e[`d.${d.key}.dob`] = 'Required';
      else if (ag === null || ag < 15 || ag > 110) e[`d.${d.key}.dob`] = 'Driver must be 15–110 years old';
      if (bad(d.violations) || d.violations < 0 || d.violations > 20) e[`d.${d.key}.violations`] = '0–20';
      if (bad(d.accidents) || d.accidents < 0 || d.accidents > 20) e[`d.${d.key}.accidents`] = '0–20';
    });
    a.vehicles.forEach((v) => {
      if (bad(v.year) || v.year < 1981 || v.year > thisYear + 1) e[`v.${v.key}.year`] = `1981–${thisYear + 1}`;
      if (!v.make.trim()) e[`v.${v.key}.make`] = 'Required';
      if (!v.model.trim()) e[`v.${v.key}.model`] = 'Required';
      if (v.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin)) e[`v.${v.key}.vin`] = 'VIN must be 17 characters (no I, O, Q)';
      if (!ZIP.test(v.garaging_zip)) e[`v.${v.key}.garaging_zip`] = '5-digit ZIP';
      if (bad(v.annual_miles) || v.annual_miles < 0 || v.annual_miles > 100000) e[`v.${v.key}.annual_miles`] = '0–100,000';
      if (bad(v.value) || v.value < 500 || v.value > 500000) e[`v.${v.key}.value`] = '$500–$500,000';
    });
  } else if (key === 'home') {
    const h = input.home!;
    if (!h.address.trim()) e['home.address'] = 'Required';
    if (!h.state) e['home.state'] = 'Required';
    if (!ZIP.test(h.zip)) e['home.zip'] = '5-digit ZIP';
    if (bad(h.year_built) || h.year_built < 1800 || h.year_built > thisYear + 1) e['home.year_built'] = `1800–${thisYear + 1}`;
    if (bad(h.square_feet) || h.square_feet < 300 || h.square_feet > 20000) e['home.square_feet'] = '300–20,000';
    if (bad(h.roof_year) || h.roof_year > thisYear + 1 || h.roof_year < (h.year_built || 1800)) e['home.roof_year'] = 'Between year built and this year';
    if (bad(h.protection_class) || h.protection_class < 1 || h.protection_class > 10) e['home.protection_class'] = '1–10';
    if (bad(h.claims_5yr) || h.claims_5yr < 0 || h.claims_5yr > 10) e['home.claims_5yr'] = '0–10';
  } else if (key === 'renters') {
    const r = input.renters!;
    if (!r.state) e['renters.state'] = 'Required';
    if (!ZIP.test(r.zip)) e['renters.zip'] = '5-digit ZIP';
    if (bad(r.claims_5yr) || r.claims_5yr < 0 || r.claims_5yr > 10) e['renters.claims_5yr'] = '0–10';
  } else if (key === 'condo') {
    const c = input.condo!;
    if (!c.address.trim()) e['condo.address'] = 'Required';
    if (!c.state) e['condo.state'] = 'Required';
    if (!ZIP.test(c.zip)) e['condo.zip'] = '5-digit ZIP';
    if (bad(c.year_built) || c.year_built < 1800 || c.year_built > thisYear + 1) e['condo.year_built'] = `1800–${thisYear + 1}`;
    if (bad(c.protection_class) || c.protection_class < 1 || c.protection_class > 10) e['condo.protection_class'] = '1–10';
    if (bad(c.claims_5yr) || c.claims_5yr < 0 || c.claims_5yr > 10) e['condo.claims_5yr'] = '0–10';
  } else if (key === 'umbrella') {
    const u = input.umbrella!;
    if (!u.state) e['umbrella.state'] = 'Required';
    (['autos', 'youthful_drivers', 'residences', 'rental_units', 'watercraft', 'violations'] as const).forEach((f) => {
      if (bad(u[f]) || u[f] < 0 || u[f] > 50) e[`umbrella.${f}`] = '0–50';
    });
    if (!e['umbrella.autos'] && !e['umbrella.residences'] && u.autos + u.residences === 0) e['umbrella.autos'] = 'An umbrella needs at least one underlying auto or residence';
  } else if (key === 'commercial') {
    const c = input.commercial!;
    if (!c.business_name.trim()) e['commercial.business_name'] = 'Required';
    if (!c.state) e['commercial.state'] = 'Required';
    if (!ZIP.test(c.zip)) e['commercial.zip'] = '5-digit ZIP';
    if (bad(c.revenue) || c.revenue < 10000) e['commercial.revenue'] = 'At least $10,000';
    if (bad(c.employees) || c.employees < 0 || c.employees > 5000) e['commercial.employees'] = '0–5,000';
    if (bad(c.years_in_business) || c.years_in_business < 0 || c.years_in_business > 200) e['commercial.years_in_business'] = '0–200';
    if (bad(c.claims_5yr) || c.claims_5yr < 0 || c.claims_5yr > 20) e['commercial.claims_5yr'] = '0–20';
    if (line === 'BOP') {
      if (bad(c.building_value) || c.building_value < 0) e['commercial.building_value'] = 'Enter 0 if you lease the space';
      if (bad(c.bpp_value) || c.bpp_value < 0) e['commercial.bpp_value'] = 'Required';
      if (!e['commercial.building_value'] && !e['commercial.bpp_value'] && c.building_value + c.bpp_value <= 0) e['commercial.bpp_value'] = 'A BOP needs building or business property coverage';
      if (bad(c.protection_class) || c.protection_class < 1 || c.protection_class > 10) e['commercial.protection_class'] = '1–10';
    }
  } else if (key === 'wc') {
    const w = input.wc!;
    if (!w.state) e['wc.state'] = 'Required';
    if (!w.classes.length) e['wc.classes'] = 'Add at least one class code';
    w.classes.forEach((c) => {
      if (!c.code) e[`wc.${c.key}.code`] = 'Required';
      if (bad(c.payroll) || c.payroll < 1000) e[`wc.${c.key}.payroll`] = 'At least $1,000';
    });
    if (bad(w.employees) || w.employees < 1 || w.employees > 5000) e['wc.employees'] = '1–5,000';
    if (bad(w.experience_mod) || w.experience_mod < 0.5 || w.experience_mod > 3) e['wc.experience_mod'] = '0.50–3.00';
    if (bad(w.years_in_business) || w.years_in_business < 0) e['wc.years_in_business'] = 'Required';
    if (bad(w.claims_5yr) || w.claims_5yr < 0 || w.claims_5yr > 50) e['wc.claims_5yr'] = '0–50';
  } else if (key === 'cauto') {
    const c = input.cauto!;
    if (!c.state) e['cauto.state'] = 'Required';
    if (!c.vehicles.length) e['cauto.vehicles'] = 'Add at least one vehicle';
    c.vehicles.forEach((v) => {
      if (bad(v.year) || v.year < 1981 || v.year > thisYear + 1) e[`ca.${v.key}.year`] = `1981–${thisYear + 1}`;
      if (bad(v.value) || v.value < 500 || v.value > 1000000) e[`ca.${v.key}.value`] = '$500–$1M';
    });
    if (bad(c.drivers) || c.drivers < 1 || c.drivers > 500) e['cauto.drivers'] = '1–500';
    if (bad(c.drivers_with_violations) || c.drivers_with_violations < 0 || c.drivers_with_violations > (c.drivers || 0)) e['cauto.drivers_with_violations'] = 'Cannot exceed number of drivers';
    if (bad(c.years_in_business) || c.years_in_business < 0) e['cauto.years_in_business'] = 'Required';
  }
  return e;
}


export const moneyOpt = (n: number, zero = 'None') => ({ value: n, label: n === 0 ? zero : fmtMoney(n) });
