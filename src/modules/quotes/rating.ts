import { age } from '@/lib/format';
import type { Carrier, CarrierRate, Coverage, LineOfBusiness } from '@/lib/types';
import {
  BUSINESS_CLASSES, WC_CLASSES, sectionOf, termFor,
  type AutoInput, type CAInput, type CommercialInput, type CondoInput, type HomeInput, type QuoteInput, type RentersInput, type UmbrellaInput, type WCInput,
} from './inputs';

/**
 * Simulated comparative rating engine.
 *
 * Deterministic: the same input and carrier list always yields the same premiums. Each line has a
 * factor model built from real rating variables; each carrier applies a stable pricing multiplier,
 * its own weighting of risk characteristics, and appetite (underwriting) rules that can decline.
 * These are illustrative rates only — not bindable carrier quotes.
 */

export type RatedCarrier = CarrierRate & { discounts?: string[]; surcharges?: string[]; notes?: string[] };

type CarrierLike = Pick<Carrier, 'name' | 'lines'>;

// ── helpers ──

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Stable value in [lo, hi] from a string. */
const spread = (s: string, lo: number, hi: number) => lo + ((hash(s) % 10007) / 10006) * (hi - lo);
const money = (n: number) => n.toLocaleString('en-US');
const k = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

const STATE_AUTO: Record<string, number> = { TX: 1.12, CO: 1.1, AZ: 1.04, OK: 1.06, FL: 1.38, CA: 1.24, MI: 1.48, NY: 1.32, LA: 1.45, NJ: 1.28, GA: 1.14, NV: 1.18 };
const STATE_HOME: Record<string, number> = { TX: 1.35, CO: 1.22, OK: 1.42, AZ: 0.86, FL: 1.6, LA: 1.55, KS: 1.3, NE: 1.25, CA: 1.08, NY: 1.02, WA: 0.88, OR: 0.84 };
const STATE_COMM: Record<string, number> = { TX: 1.0, CO: 1.04, CA: 1.2, NY: 1.25, FL: 1.12, AZ: 0.96, OK: 0.98, IL: 1.08 };
const STATE_WC: Record<string, number> = { TX: 0.82, CO: 0.95, CA: 1.45, NY: 1.3, FL: 1.05, AZ: 0.9, OK: 1.02, IL: 1.18 };

/** Territory factor: state base × a ZIP-derived urban/rural adjustment. */
function territory(state: string, zip: string, table: Record<string, number>) {
  const z = /^\d{5}$/.test(zip) ? spread(`zip:${zip}`, 0.92, 1.12) : 1;
  return (table[state] ?? 1) * z;
}

/** Splits `total` across coverage lines by weight, rounding so the pieces sum exactly. */
function allocate(total: number, parts: { cov: Omit<Coverage, 'premium'>; weight: number }[]): Coverage[] {
  const w = parts.reduce((s, p) => s + p.weight, 0) || 1;
  let used = 0;
  const priced = parts.filter((p) => p.weight > 0);
  const out = priced.map((p, i) => {
    const prem = i === priced.length - 1 ? total - used : Math.round((total * p.weight) / w);
    used += prem;
    return { ...p.cov, premium: prem };
  });
  // Unpriced (included) lines keep premium 0 so they still show on the comparison.
  return [...out, ...parts.filter((p) => p.weight <= 0).map((p) => ({ ...p.cov, premium: 0 }))];
}

// ── carrier profiles ──

type Profile = {
  /** overall price level */
  base: number;
  /** extra price level per line */
  line?: Partial<Record<LineOfBusiness, number>>;
  /** weight applied to violation/accident/claim surcharges (1 = market average) */
  incidentWeight: number;
  /** weight applied to youthful-driver surcharges */
  youthWeight: number;
  /** multi-policy / package discount generosity */
  bundle: number;
  /** returns a decline reason, or null when within appetite */
  appetite: (line: LineOfBusiness, input: QuoteInput) => string | null;
  perks?: Partial<Record<LineOfBusiness, Coverage[]>>;
};

const thisYear = () => new Date().getFullYear();
const roofAge = (h: { roof_year: number }) => thisYear() - h.roof_year;
const maxAccidents = (a?: AutoInput) => Math.max(0, ...(a?.drivers ?? []).map((d) => d.accidents || 0));
const totalViolations = (a?: AutoInput) => (a?.drivers ?? []).reduce((s, d) => s + (d.violations || 0), 0);
const biRank = (bi: string) => ['25/50', '50/100', '100/300', '250/500'].indexOf(bi);

const PROFILES: Record<string, Profile> = {
  'Summit Mutual': {
    base: 0.94, incidentWeight: 1.25, youthWeight: 1.1, bundle: 1.2,
    line: { 'Personal Auto': 0.97, Homeowners: 1.02 },
    perks: { 'Personal Auto': [{ name: 'Accident Forgiveness', limit: 'Included' }], Homeowners: [{ name: 'Replacement Cost — Contents', limit: 'Included' }] },
    appetite: (line, i) => {
      if (line === 'Personal Auto') {
        if (maxAccidents(i.auto) >= 2) return 'Preferred program: declines drivers with 2+ at-fault accidents in 3 years';
        if (totalViolations(i.auto) >= 3) return 'Preferred program: 3+ moving violations on the household';
        if (i.auto?.prior_insurance === 'None') return 'Requires proof of prior insurance';
      }
      if (line === 'Homeowners' && i.home) {
        if (roofAge(i.home) > 20) return `Roof is ${roofAge(i.home)} years old — maximum is 20`;
        if (i.home.claims_5yr >= 2) return '2+ property claims in 5 years';
        if (i.home.protection_class >= 9) return `Protection class ${i.home.protection_class} is outside appetite (max 8)`;
      }
      if (line === 'Condo' && i.condo && i.condo.claims_5yr >= 2) return '2+ property claims in 5 years';
      if (line === 'Renters' && i.renters && i.renters.claims_5yr >= 2) return '2+ claims in 5 years';
      if (line === 'Umbrella' && i.umbrella) {
        if (biRank(i.umbrella.underlying_auto_bi) < 3) return 'Requires underlying auto BI of 250/500';
        if (i.umbrella.underlying_home_liability < 300000) return 'Requires underlying home liability of $300,000';
      }
      return null;
    },
  },
  'Harbor Point Insurance': {
    base: 1.07, incidentWeight: 0.6, youthWeight: 0.75, bundle: 0.7,
    line: { Renters: 0.92 },
    perks: { 'Personal Auto': [{ name: 'Roadside Assistance', limit: 'Included' }] },
    appetite: (line, i) => {
      if (line === 'Personal Auto' && i.auto) {
        if (i.auto.vehicles.length > 6) return 'Maximum 6 vehicles per policy';
        if (i.auto.vehicles.some((v) => v.usage === 'Business' && v.annual_miles > 30000)) return 'Heavy business-use vehicles must be written commercially';
      }
      return null;
    },
  },
  'Keystone Casualty': {
    base: 1.0, incidentWeight: 1.1, youthWeight: 1.2, bundle: 1.0,
    line: { Homeowners: 0.96, Umbrella: 0.9 },
    appetite: (line, i) => {
      if (line === 'Personal Auto' && i.auto) {
        if (maxAccidents(i.auto) >= 2) return 'Declines drivers with 2+ at-fault accidents';
        if (i.auto.drivers.some((d) => (age(d.dob) ?? 30) < 18 && d.violations > 0)) return 'Declines drivers under 18 with violations';
      }
      if (line === 'Homeowners' && i.home) {
        if (i.home.protection_class >= 9) return `Protection class ${i.home.protection_class} — declines PC 9 and 10`;
        if (i.home.construction === 'Manufactured') return 'Does not write manufactured homes';
        if (i.home.claims_5yr >= 3) return '3+ property claims in 5 years';
      }
      if (line === 'Umbrella' && i.umbrella && i.umbrella.violations >= 3) return 'Household has 3+ moving violations';
      return null;
    },
  },
  'Prairie Shield': {
    base: 0.97, incidentWeight: 1.0, youthWeight: 1.0, bundle: 0.8,
    line: { Homeowners: 0.9, Condo: 0.92 },
    perks: { Homeowners: [{ name: 'Water Backup', limit: '5,000' }] },
    appetite: (line, i) => {
      if (line === 'Homeowners' && i.home) {
        if (i.home.roof_type === 'Wood Shake') return 'Wood shake roofs are ineligible';
        if (roofAge(i.home) > 25) return `Roof is ${roofAge(i.home)} years old — maximum is 25`;
        if (i.home.year_built < 1940) return 'Homes built before 1940 require underwriter review';
        if (i.home.dwelling > 1500000) return 'Coverage A above $1.5M — refer to high-value program';
        if (i.home.protection_class >= 10) return 'Protection class 10 is ineligible';
      }
      if (line === 'Condo' && i.condo && i.condo.protection_class >= 9) return `Protection class ${i.condo.protection_class} is ineligible`;
      return null;
    },
  },
  'Evergreen National': {
    base: 1.03, incidentWeight: 0.95, youthWeight: 1.35, bundle: 1.1,
    line: { Umbrella: 0.95 },
    appetite: (line, i) => {
      if (line === 'Personal Auto' && i.auto && i.auto.drivers.some((d) => (age(d.dob) ?? 30) < 21 && (d.violations > 0 || d.accidents > 0))) return 'Declines drivers under 21 with incidents';
      if (line === 'Homeowners' && i.home && i.home.claims_5yr >= 2) return '2+ property claims in 5 years';
      if (line === 'Umbrella' && i.umbrella && i.umbrella.youthful_drivers > 2) return 'Maximum 2 youthful drivers';
      return null;
    },
  },
  'Copperline Commercial': {
    base: 1.0, incidentWeight: 1.1, youthWeight: 1, bundle: 1.1,
    appetite: (line, i) => {
      if ((line === 'General Liability' || line === 'BOP') && i.commercial) {
        if (i.commercial.class_key === 'roofing') return 'Roofing contractors are outside appetite';
        if (i.commercial.revenue > 10_000_000) return 'Revenue above $10M exceeds binding authority — refer to underwriter';
        if (i.commercial.claims_5yr >= 3) return '3+ liability claims in 5 years';
        if (line === 'BOP' && i.commercial.employees > 100) return 'BOP limited to 100 employees';
      }
      if (line === 'Commercial Auto' && i.cauto) {
        if (i.cauto.radius.startsWith('Long')) return 'Long-haul operations are ineligible';
        if (i.cauto.vehicles.filter((v) => v.type === 'Heavy Truck').length > 5) return 'More than 5 heavy trucks';
      }
      return null;
    },
  },
  'Frontier Workers Group': {
    base: 0.96, incidentWeight: 1.0, youthWeight: 1, bundle: 1,
    line: { 'General Liability': 1.08 },
    appetite: (line, i) => {
      if (line === 'Workers Comp' && i.wc) {
        if (i.wc.experience_mod > 1.5) return `Experience mod ${i.wc.experience_mod.toFixed(2)} exceeds 1.50`;
        if (i.wc.classes.some((c) => c.code === '5551') && i.wc.years_in_business < 3) return 'Roofing requires 3+ years in business';
      }
      if (line === 'General Liability' && i.commercial && ['restaurant', 'medical'].includes(i.commercial.class_key)) return 'GL program is limited to contractor, retail and service classes';
      return null;
    },
  },
};

/** Carriers without a hand-written profile get a stable, name-derived one. */
function profileFor(name: string): Profile {
  if (PROFILES[name]) return PROFILES[name];
  const strict = hash(`strict:${name}`) % 3 === 0;
  return {
    base: spread(`base:${name}`, 0.92, 1.12),
    incidentWeight: spread(`inc:${name}`, 0.8, 1.25),
    youthWeight: spread(`youth:${name}`, 0.85, 1.25),
    bundle: spread(`bundle:${name}`, 0.7, 1.2),
    appetite: (line, i) => {
      if (!strict) return null;
      if (line === 'Personal Auto' && maxAccidents(i.auto) >= 2) return 'Declines drivers with 2+ at-fault accidents';
      if (line === 'Homeowners' && i.home && roofAge(i.home) > 20) return 'Roof older than 20 years';
      if (line === 'Homeowners' && i.home && i.home.protection_class >= 9) return 'Protection class 9+ is ineligible';
      return null;
    },
  };
}

// ── line models (annual premium before carrier multiplier) ──

type LineResult = { annual: number; coverages: { cov: Omit<Coverage, 'premium'>; weight: number }[]; discounts: string[]; surcharges: string[]; notes: string[] };

const pct = (f: number) => `${Math.round(Math.abs(1 - f) * 100)}%`;

function rateAuto(a: AutoInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [], notes: string[] = [];
  const biF = ({ '25/50': 0.78, '50/100': 0.88, '100/300': 1, '250/500': 1.22 } as Record<string, number>)[a.bi] ?? 1;
  const pdF = ({ 25000: 0.9, 50000: 0.95, 100000: 1, 250000: 1.08 } as Record<number, number>)[a.pd] ?? 1;
  const medPrem = ({ 0: 0, 1000: 18, 5000: 38, 10000: 60 } as Record<number, number>)[a.medpay] ?? 0;
  const dedF = (d: number, kind: 'comp' | 'coll') => (d <= 0 ? 0 : kind === 'comp' ? ({ 250: 1.15, 500: 1, 1000: 0.8 } as Record<number, number>)[d] ?? 1 : ({ 250: 1.2, 500: 1, 1000: 0.78 } as Record<number, number>)[d] ?? 1);

  // Driver class factor: average of each operator's age/marital/incident factor.
  const driverFactors = a.drivers.map((d) => {
    const ag = age(d.dob) ?? 35;
    let f = ag < 20 ? 2.1 : ag < 25 ? 1.55 : ag < 30 ? 1.12 : ag < 65 ? 1 : ag < 75 ? 1.06 : 1.18;
    if (ag < 25) {
      f = 1 + (f - 1) * p.youthWeight;
      if (d.good_student) f *= 0.9;
    }
    if (d.marital_status === 'Single' && ag < 30) f *= 1.04;
    f *= 1 + (0.18 * d.violations + 0.35 * d.accidents) * p.incidentWeight;
    return { d, ag, f };
  });
  const driverF = driverFactors.length ? driverFactors.reduce((s, x) => s + x.f, 0) / driverFactors.length : 1;
  const youth = driverFactors.filter((x) => x.ag < 25);
  if (youth.length) surcharges.push(`Youthful operator${youth.length > 1 ? 's' : ''} (${youth.map((x) => x.d.first_name || 'driver').join(', ')})`);
  if (driverFactors.some((x) => x.ag >= 65)) surcharges.push('Senior operator 65+');
  const viol = totalViolations(a), acc = a.drivers.reduce((s, d) => s + (d.accidents || 0), 0);
  if (viol) surcharges.push(`${viol} moving violation${viol > 1 ? 's' : ''}`);
  if (acc) surcharges.push(`${acc} at-fault accident${acc > 1 ? 's' : ''}`);
  if (a.drivers.some((d) => d.good_student && (age(d.dob) ?? 30) < 25)) discounts.push('Good student');

  let bi = 0, pd = 0, um = 0, med = 0, comp = 0, coll = 0, rental = 0, tow = 0;
  a.vehicles.forEach((v) => {
    const vAge = thisYear() - v.year;
    const yearLiab = vAge <= 3 ? 0.97 : vAge <= 10 ? 1 : 1.03;
    const yearPhys = vAge <= 3 ? 1.1 : vAge <= 10 ? 1 : 0.9;
    const usage = v.usage === 'Pleasure' ? 0.9 : v.usage === 'Business' ? 1.15 : 1;
    const miles = v.annual_miles < 5000 ? 0.88 : v.annual_miles < 10000 ? 0.95 : v.annual_miles < 15000 ? 1 : v.annual_miles < 20000 ? 1.08 : 1.15;
    const terr = territory(a.state, v.garaging_zip, STATE_AUTO);
    const common = driverF * usage * miles * terr;
    const val = v.value;
    const compBase = val < 10000 ? 110 : val < 20000 ? 150 : val < 35000 ? 195 : val < 55000 ? 260 : 340;
    const collBase = val < 10000 ? 260 : val < 20000 ? 380 : val < 35000 ? 500 : val < 55000 ? 650 : 860;
    bi += 330 * biF * yearLiab * common;
    pd += 190 * pdF * yearLiab * common;
    if (a.um) um += 72 * biF * terr;
    med += medPrem * terr;
    comp += compBase * yearPhys * terr * dedF(a.comp_ded, 'comp');
    coll += collBase * yearPhys * common * dedF(a.coll_ded, 'coll');
    if (a.rental) rental += 36;
    if (a.towing) tow += 14;
  });

  let factor = 1;
  const disc = (label: string, f: number) => { factor *= f; discounts.push(`${label} ${pct(f)}`); };
  if (a.vehicles.length >= 2) disc('Multi-car', 1 - 0.1 * p.bundle);
  if (a.multi_policy) disc('Multi-policy', 1 - 0.12 * p.bundle);
  else if (a.homeowner) disc('Homeowner', 1 - 0.05 * p.bundle);
  if (a.paid_in_full) disc('Paid in full', 0.94);
  const prior = { None: 1.2, 'Under 1 year': 1.08, '1-3 years': 1, '3+ years': 0.93 }[a.prior_insurance] ?? 1;
  if (prior > 1) { factor *= prior; surcharges.push(`${a.prior_insurance === 'None' ? 'No prior insurance' : 'Prior insurance under 1 year'} +${pct(prior)}`); }
  else if (prior < 1) disc('Continuous coverage', prior);
  if (a.comp_ded > 0 && a.coll_ded === 0) notes.push('Comprehensive without collision');

  const annual = (bi + pd + um + med + comp + coll + rental + tow) * factor;
  const ded = (d: number) => (d > 0 ? money(d) : undefined);
  return {
    annual, discounts, surcharges, notes,
    coverages: [
      { cov: { name: 'Bodily Injury', limit: a.bi }, weight: bi },
      { cov: { name: 'Property Damage', limit: money(a.pd) }, weight: pd },
      ...(a.um ? [{ cov: { name: 'Uninsured Motorist', limit: a.bi }, weight: um }] : []),
      ...(a.medpay > 0 ? [{ cov: { name: 'Medical Payments', limit: money(a.medpay) }, weight: med }] : []),
      ...(a.comp_ded > 0 ? [{ cov: { name: 'Comprehensive', limit: 'ACV', deductible: ded(a.comp_ded) }, weight: comp }] : []),
      ...(a.coll_ded > 0 ? [{ cov: { name: 'Collision', limit: 'ACV', deductible: ded(a.coll_ded) }, weight: coll }] : []),
      ...(a.rental ? [{ cov: { name: 'Rental Reimbursement', limit: '30/900' }, weight: rental }] : []),
      ...(a.towing ? [{ cov: { name: 'Towing & Labor', limit: '100' }, weight: tow }] : []),
    ],
  };
}

function protectionF(pc: number) {
  return pc <= 3 ? 0.9 : pc <= 6 ? 1 : pc <= 8 ? 1.15 : pc === 9 ? 1.5 : 1.9;
}
function claimsF(n: number, p: Profile) {
  const f = n === 0 ? 0.92 : n === 1 ? 1.2 : n === 2 ? 1.45 : 1.8;
  return f < 1 ? f : 1 + (f - 1) * p.incidentWeight;
}

function rateHome(h: HomeInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [], notes: string[] = [];
  const homeAge = thisYear() - h.year_built;
  const ageF = homeAge < 10 ? 0.85 : homeAge <= 25 ? 0.95 : homeAge <= 40 ? 1.05 : homeAge <= 60 ? 1.15 : 1.28;
  const constF = ({ Frame: 1.05, Masonry: 0.92, 'Brick Veneer': 0.96, Stucco: 0.98, Log: 1.15, Manufactured: 1.4 } as Record<string, number>)[h.construction] ?? 1;
  const ra = roofAge(h);
  const roofAgeF = ra <= 5 ? 0.9 : ra <= 10 ? 1 : ra <= 15 ? 1.1 : ra <= 20 ? 1.22 : 1.4;
  const roofTypeF = ({ Metal: 0.9, Tile: 0.93, 'Architectural Shingle': 0.97, 'Composition Shingle': 1, 'Wood Shake': 1.25, 'Flat / Built-up': 1.1 } as Record<string, number>)[h.roof_type] ?? 1;
  const dedF = ({ 500: 1.1, 1000: 1, 2500: 0.85, 5000: 0.74 } as Record<number, number>)[h.deductible] ?? 1;
  const terr = territory(h.state, h.zip, STATE_HOME);
  const pcF = protectionF(h.protection_class);
  const clF = claimsF(h.claims_5yr, p);

  if (homeAge < 10) discounts.push('Newer home');
  if (ra <= 5) discounts.push('New roof');
  if (ra > 15) surcharges.push(`Roof age ${ra} yrs`);
  if (h.protection_class >= 7) surcharges.push(`Protection class ${h.protection_class}`);
  if (h.claims_5yr === 0) discounts.push('Claim-free');
  else surcharges.push(`${h.claims_5yr} claim${h.claims_5yr > 1 ? 's' : ''} in 5 yrs`);

  const ppPct = h.personal_property_pct / 100;
  let property = (h.dwelling / 1000) * 3.6 * ageF * constF * roofAgeF * roofTypeF * dedF * terr * pcF * clF * (0.85 + ppPct * 0.3);
  const liab = ({ 100000: 0, 300000: 25, 500000: 45 } as Record<number, number>)[h.liability] ?? 25;
  const med = h.medpay >= 5000 ? 12 : 0;

  let factor = 1;
  const disc = (label: string, f: number) => { factor *= f; discounts.push(`${label} ${pct(f)}`); };
  if (h.alarm) disc('Monitored alarm', 0.95);
  if (h.sprinklers) disc('Sprinkler system', 0.9);
  if (h.multi_policy) disc('Multi-policy', 1 - 0.12 * p.bundle);
  if (h.paid_in_full) disc('Paid in full', 0.95);
  property *= factor;

  const replacement = h.square_feet * 140;
  if (h.dwelling < replacement * 0.8) notes.push(`Coverage A may be below estimated replacement cost (~$${money(Math.round(replacement / 1000) * 1000)})`);

  const b = Math.round(h.dwelling * 0.1), c = Math.round(h.dwelling * ppPct), d = Math.round(h.dwelling * 0.2);
  return {
    annual: property + liab + med + 45, discounts, surcharges, notes,
    coverages: [
      { cov: { name: 'Dwelling (A)', limit: money(h.dwelling), deductible: money(h.deductible) }, weight: property * 0.72 },
      { cov: { name: 'Other Structures (B)', limit: money(b) }, weight: property * 0.05 },
      { cov: { name: 'Personal Property (C)', limit: money(c) }, weight: property * 0.19 },
      { cov: { name: 'Loss of Use (D)', limit: money(d) }, weight: property * 0.04 },
      { cov: { name: 'Personal Liability (E)', limit: money(h.liability) }, weight: liab + 30 },
      { cov: { name: 'Medical Payments (F)', limit: money(h.medpay) }, weight: med + 15 },
    ],
  };
}

function rateRenters(r: RentersInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [];
  const terr = territory(r.state, r.zip, STATE_HOME) * 0.85;
  const dedF = ({ 250: 1.1, 500: 1, 1000: 0.88 } as Record<number, number>)[r.deductible] ?? 1;
  const clF = claimsF(r.claims_5yr, p);
  let pp = (r.personal_property / 1000) * 6.5 * terr * dedF * clF;
  const liab = ({ 100000: 28, 300000: 42, 500000: 58 } as Record<number, number>)[r.liability] ?? 28;
  const med = r.medpay >= 5000 ? 8 : 4;
  if (r.claims_5yr === 0) discounts.push('Claim-free'); else surcharges.push(`${r.claims_5yr} claim(s) in 5 yrs`);
  let factor = 1;
  if (r.alarm) { factor *= 0.95; discounts.push('Monitored alarm 5%'); }
  if (r.multi_policy) { const f = 1 - 0.15 * p.bundle; factor *= f; discounts.push(`Multi-policy ${pct(f)}`); }
  if (r.paid_in_full) { factor *= 0.95; discounts.push('Paid in full 5%'); }
  pp *= factor;
  const annual = Math.max(120, pp + liab + med + 20);
  return {
    annual, discounts, surcharges, notes: [],
    coverages: [
      { cov: { name: 'Personal Property', limit: money(r.personal_property), deductible: money(r.deductible) }, weight: pp + 20 },
      { cov: { name: 'Loss of Use', limit: money(Math.round(r.personal_property * 0.3)) }, weight: 0 },
      { cov: { name: 'Personal Liability', limit: money(r.liability) }, weight: liab },
      { cov: { name: 'Medical Payments', limit: money(r.medpay) }, weight: med },
    ],
  };
}

function rateCondo(c: CondoInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [];
  const homeAge = thisYear() - c.year_built;
  const ageF = homeAge < 10 ? 0.88 : homeAge <= 30 ? 1 : 1.15;
  const terr = territory(c.state, c.zip, STATE_HOME) * 0.9;
  const dedF = ({ 500: 1.1, 1000: 1, 2500: 0.86, 5000: 0.76 } as Record<number, number>)[c.deductible] ?? 1;
  const clF = claimsF(c.claims_5yr, p);
  const pcF = protectionF(c.protection_class);
  const common = ageF * terr * dedF * clF * pcF;
  let a = (c.dwelling / 1000) * 2.2 * common;
  let pp = (c.personal_property / 1000) * 5.2 * common;
  const liab = ({ 100000: 30, 300000: 48, 500000: 66 } as Record<number, number>)[c.liability] ?? 48;
  const la = c.loss_assessment >= 10000 ? 18 : c.loss_assessment >= 5000 ? 10 : 5;
  if (c.claims_5yr === 0) discounts.push('Claim-free'); else surcharges.push(`${c.claims_5yr} claim(s) in 5 yrs`);
  let factor = 1;
  if (c.alarm) { factor *= 0.95; discounts.push('Monitored alarm 5%'); }
  if (c.multi_policy) { const f = 1 - 0.12 * p.bundle; factor *= f; discounts.push(`Multi-policy ${pct(f)}`); }
  if (c.paid_in_full) { factor *= 0.95; discounts.push('Paid in full 5%'); }
  a *= factor; pp *= factor;
  return {
    annual: Math.max(250, a + pp + liab + la + 25), discounts, surcharges, notes: [],
    coverages: [
      { cov: { name: 'Dwelling — Walls-in (A)', limit: money(c.dwelling), deductible: money(c.deductible) }, weight: a + 25 },
      { cov: { name: 'Personal Property (C)', limit: money(c.personal_property) }, weight: pp },
      { cov: { name: 'Loss of Use (D)', limit: money(Math.round(c.personal_property * 0.4)) }, weight: 0 },
      { cov: { name: 'Personal Liability (E)', limit: money(c.liability) }, weight: liab },
      { cov: { name: 'Loss Assessment', limit: money(c.loss_assessment) }, weight: la },
    ],
  };
}

function rateUmbrella(u: UmbrellaInput, p: Profile): LineResult {
  const surcharges: string[] = [], notes: string[] = [];
  const limitPrem = [0, 180, 275, 360, 440, 520][u.limit] ?? 180 + (u.limit - 1) * 85;
  const exposures = Math.max(0, u.autos - 1) * 45 + u.youthful_drivers * 90 * p.youthWeight + Math.max(0, u.residences - 1) * 60 + u.rental_units * 60 + u.watercraft * 40;
  let annual = (limitPrem + exposures) * (STATE_COMM[u.state] ?? 1);
  if (u.violations > 0) { const f = 1 + 0.15 * u.violations * p.incidentWeight; annual *= f; surcharges.push(`${u.violations} household violation(s)`); }
  if (u.youthful_drivers) surcharges.push(`${u.youthful_drivers} youthful driver(s)`);
  if (biRank(u.underlying_auto_bi) < 3 || u.underlying_home_liability < 300000) notes.push('Underlying limits below typical requirements (auto 250/500, home $300K)');
  return {
    annual, discounts: [], surcharges, notes,
    coverages: [
      { cov: { name: 'Personal Umbrella Liability', limit: money(u.limit * 1_000_000) }, weight: limitPrem },
      { cov: { name: 'Exposure charges', limit: `${u.autos} auto · ${u.residences} res · ${u.rental_units} rental · ${u.watercraft} boat` }, weight: exposures },
      { cov: { name: 'Required underlying — Auto BI', limit: u.underlying_auto_bi }, weight: 0 },
      { cov: { name: 'Required underlying — Home liability', limit: money(u.underlying_home_liability) }, weight: 0 },
    ],
  };
}

function rateGL(c: CommercialInput, p: Profile, packaged: boolean): LineResult {
  const discounts: string[] = [], surcharges: string[] = [];
  const cls = BUSINESS_CLASSES.find((x) => x.key === c.class_key) ?? BUSINESS_CLASSES[0];
  const limF = ({ '500K/1M': 0.82, '1M/2M': 1, '2M/4M': 1.35 } as Record<string, number>)[c.gl_limit] ?? 1;
  const yrsF = c.years_in_business < 3 ? 1.15 : c.years_in_business <= 10 ? 1 : 0.92;
  const clF = c.claims_5yr === 0 ? 0.95 : 1 + (c.claims_5yr === 1 ? 0.15 : 0.35) * p.incidentWeight;
  if (c.years_in_business < 3) surcharges.push('New venture (<3 yrs)'); else if (c.years_in_business > 10) discounts.push('Established business');
  if (c.claims_5yr === 0) discounts.push('Loss-free'); else surcharges.push(`${c.claims_5yr} claim(s) in 5 yrs`);
  let gl = ((c.revenue / 1000) * cls.glRate + c.employees * 35) * limF * yrsF * clF * territory(c.state, c.zip, STATE_COMM);
  if (packaged) { gl *= 0.85; discounts.push('Package credit 15%'); }
  gl = Math.max(packaged ? 300 : 500, gl);
  const [occ, agg] = c.gl_limit.split('/');
  return {
    annual: gl, discounts, surcharges, notes: [],
    coverages: [
      { cov: { name: 'Each Occurrence', limit: occ }, weight: gl * 0.7 },
      { cov: { name: 'General Aggregate', limit: agg }, weight: gl * 0.2 },
      { cov: { name: 'Products/Completed Ops Aggregate', limit: agg }, weight: gl * 0.1 },
      { cov: { name: 'Personal & Advertising Injury', limit: occ }, weight: 0 },
      { cov: { name: 'Damage to Rented Premises', limit: '100K' }, weight: 0 },
      { cov: { name: 'Medical Expense', limit: '5K' }, weight: 0 },
    ],
  };
}

function rateBOP(c: CommercialInput, p: Profile): LineResult {
  const gl = rateGL(c, p, true);
  const cls = BUSINESS_CLASSES.find((x) => x.key === c.class_key) ?? BUSINESS_CLASSES[0];
  const constF = ({ Frame: 1.2, Masonry: 0.9, 'Brick Veneer': 0.95, Stucco: 1, Log: 1.3, Manufactured: 1.5 } as Record<string, number>)[c.construction] ?? 1;
  const dedF = ({ 500: 1.08, 1000: 1, 2500: 0.92, 5000: 0.85 } as Record<number, number>)[c.deductible] ?? 1;
  const common = constF * protectionF(c.protection_class) * dedF * cls.propertyFactor * territory(c.state, c.zip, STATE_HOME) * (c.claims_5yr ? 1.1 : 1);
  const bldg = c.building_value * 0.0032 * common;
  const bpp = c.bpp_value * 0.0045 * common;
  const bi = (bldg + bpp) * 0.08 + 40;
  if (c.protection_class >= 7) gl.surcharges.push(`Protection class ${c.protection_class}`);
  return {
    annual: gl.annual + bldg + bpp + bi, discounts: gl.discounts, surcharges: gl.surcharges, notes: gl.notes,
    coverages: [
      ...(c.building_value > 0 ? [{ cov: { name: 'Building', limit: k(c.building_value), deductible: money(c.deductible) }, weight: bldg }] : []),
      { cov: { name: 'Business Personal Property', limit: k(c.bpp_value), deductible: money(c.deductible) }, weight: bpp },
      { cov: { name: 'Business Income & Extra Expense', limit: '12 months ALS' }, weight: bi },
      { cov: { name: 'Liability', limit: c.gl_limit }, weight: gl.annual },
    ],
  };
}

function rateWC(w: WCInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [];
  const manual = w.classes.reduce((s, row) => s + (row.payroll / 100) * (WC_CLASSES.find((c) => c.code === row.code)?.rate ?? 1), 0);
  const elF = ({ '100/500/100': 1, '500/500/500': 1.02, '1M/1M/1M': 1.035 } as Record<string, number>)[w.el_limits] ?? 1;
  const stateF = STATE_WC[w.state] ?? 1;
  let modified = manual * stateF * elF * w.experience_mod;
  if (w.experience_mod < 1) discounts.push(`Experience mod ${w.experience_mod.toFixed(2)}`);
  else if (w.experience_mod > 1) surcharges.push(`Experience mod ${w.experience_mod.toFixed(2)}`);
  if (w.claims_5yr > 2) { const f = 1 + 0.05 * (w.claims_5yr - 2) * p.incidentWeight; modified *= f; surcharges.push(`${w.claims_5yr} claims in 5 yrs`); }
  if (w.years_in_business < 3) { modified *= 1.1; surcharges.push('New venture (<3 yrs)'); }
  const premDisc = modified > 10000 ? 0.95 : 1;
  if (premDisc < 1) discounts.push('Premium discount 5%');
  modified *= premDisc;
  const expense = 250;
  return {
    annual: modified + expense, discounts, surcharges, notes: [],
    coverages: [
      { cov: { name: 'Part One — Workers Compensation', limit: `Statutory (${w.state})` }, weight: modified * 0.97 },
      { cov: { name: "Part Two — Employer's Liability", limit: w.el_limits }, weight: modified * 0.03 },
      { cov: { name: 'Expense Constant', limit: '—' }, weight: expense },
      ...w.classes.map((row) => ({ cov: { name: `Class ${row.code} payroll`, limit: `$${money(row.payroll)}` }, weight: 0 })),
    ],
  };
}

function rateCA(c: CAInput, p: Profile): LineResult {
  const discounts: string[] = [], surcharges: string[] = [];
  const cls = BUSINESS_CLASSES.find((x) => x.key === c.class_key) ?? BUSINESS_CLASSES[0];
  const cslF = ({ 500000: 0.85, 1000000: 1, 2000000: 1.2 } as Record<number, number>)[c.csl] ?? 1;
  const radiusF = c.radius.startsWith('Local') ? 1 : c.radius.startsWith('Inter') ? 1.2 : 1.55;
  const yrsF = c.years_in_business < 3 ? 1.15 : c.years_in_business > 10 ? 0.93 : 1;
  const violF = 1 + (c.drivers ? (c.drivers_with_violations / c.drivers) * 0.4 * p.incidentWeight : 0);
  const terr = territory(c.state, '', STATE_AUTO);
  const common = cls.autoFactor * radiusF * yrsF * violF * terr;
  const dedF = (d: number) => (d <= 0 ? 0 : ({ 250: 1.15, 500: 1.05, 1000: 1, 2500: 0.85 } as Record<number, number>)[d] ?? 1);
  let liab = 0, phys = 0;
  c.vehicles.forEach((v) => {
    const base = ({ 'Private Passenger': 1100, 'Light Truck': 1350, 'Medium Truck': 2100, 'Heavy Truck': 3800 } as Record<string, number>)[v.type] ?? 1350;
    liab += base * cslF * common;
    const vAge = thisYear() - v.year;
    phys += v.value * 0.02 * (vAge <= 3 ? 1.1 : 1) * (dedF(c.comp_ded) * 0.3 + dedF(c.coll_ded) * 0.7) * radiusF;
  });
  if (c.vehicles.length >= 5) { liab *= 0.93; discounts.push('Fleet 7%'); }
  if (c.years_in_business > 10) discounts.push('Established business');
  if (c.years_in_business < 3) surcharges.push('New venture (<3 yrs)');
  if (c.drivers_with_violations) surcharges.push(`${c.drivers_with_violations} driver(s) with violations`);
  if (radiusF > 1) surcharges.push(c.radius);
  const hnoa = c.hnoa ? 150 : 0;
  const physCovered = c.comp_ded > 0 || c.coll_ded > 0;
  return {
    annual: liab + (physCovered ? phys : 0) + hnoa, discounts, surcharges, notes: [],
    coverages: [
      { cov: { name: 'Combined Single Limit', limit: money(c.csl) }, weight: liab },
      ...(c.comp_ded > 0 ? [{ cov: { name: 'Comprehensive', limit: 'ACV', deductible: money(c.comp_ded) }, weight: phys * 0.3 }] : []),
      ...(c.coll_ded > 0 ? [{ cov: { name: 'Collision', limit: 'ACV', deductible: money(c.coll_ded) }, weight: phys * 0.7 }] : []),
      ...(c.hnoa ? [{ cov: { name: 'Hired & Non-Owned Auto', limit: money(c.csl) }, weight: hnoa }] : []),
      { cov: { name: 'Scheduled units', limit: String(c.vehicles.length) }, weight: 0 },
    ],
  };
}

function rateLine(line: LineOfBusiness, input: QuoteInput, p: Profile): LineResult | null {
  switch (sectionOf(line)) {
    case 'auto': return input.auto ? rateAuto(input.auto, p) : null;
    case 'home': return input.home ? rateHome(input.home, p) : null;
    case 'renters': return input.renters ? rateRenters(input.renters, p) : null;
    case 'condo': return input.condo ? rateCondo(input.condo, p) : null;
    case 'umbrella': return input.umbrella ? rateUmbrella(input.umbrella, p) : null;
    case 'commercial': return input.commercial ? (line === 'BOP' ? rateBOP(input.commercial, p) : rateGL(input.commercial, p, false)) : null;
    case 'wc': return input.wc ? rateWC(input.wc, p) : null;
    case 'cauto': return input.cauto ? rateCA(input.cauto, p) : null;
  }
}

// ── public API ──

/**
 * Rates `input` for `line` with every carrier in `carriers`.
 * Results are sorted: quoted (lowest premium first), then declined/errors.
 */
export function rateQuote(line: LineOfBusiness, input: QuoteInput, carriers: CarrierLike[]): RatedCarrier[] {
  const term = termFor(line, input);
  const results = carriers.map((c): RatedCarrier => {
    const base: RatedCarrier = { carrier: c.name, premium: null, term_months: term, status: 'Declined', coverages: [] };
    if (!c.lines.includes(line)) return { ...base, message: `${c.name} does not write ${line} in this program` };
    const p = profileFor(c.name);
    const decline = p.appetite(line, input);
    if (decline) return { ...base, message: decline };
    const r = rateLine(line, input, p);
    if (!r || !Number.isFinite(r.annual)) return { ...base, status: 'Error', message: 'Rating inputs are incomplete for this line' };
    const lineMult = (p.line?.[line] ?? 1) * spread(`${c.name}|${line}`, 0.95, 1.05);
    const fee = Math.round(spread(`fee:${c.name}`, 0, 4)) * 10; // $0–$40 policy fee
    const termPremium = Math.max(50, Math.round(r.annual * p.base * lineMult * (term / 12)) + fee);
    const coverages = [
      ...allocate(termPremium - fee, r.coverages),
      ...(p.perks?.[line] ?? []).map((x) => ({ ...x, premium: 0 })),
      ...(fee ? [{ name: 'Policy Fee', limit: '—', premium: fee }] : []),
    ];
    return {
      ...base, status: 'Quoted', premium: termPremium, coverages,
      discounts: r.discounts, surcharges: r.surcharges, notes: r.notes,
      message: r.notes[0],
    };
  });
  return sortRates(results);
}

export function sortRates<T extends CarrierRate>(rates: T[]): T[] {
  const rank = (r: CarrierRate) => (r.status === 'Quoted' ? 0 : r.status === 'Error' ? 1 : 2);
  return [...rates].sort((a, b) => rank(a) - rank(b) || (a.premium ?? 0) - (b.premium ?? 0) || a.carrier.localeCompare(b.carrier));
}

/** Monthly installment estimate: term premium spread over the term plus a $3 installment fee. */
export const monthlyEstimate = (r: Pick<CarrierRate, 'premium' | 'term_months'>) => (r.premium === null ? null : r.premium / Math.max(1, r.term_months) + 3);

export const bestRate = (rates: CarrierRate[] | null | undefined) => sortRates((rates ?? []).filter((r) => r.status === 'Quoted' && r.premium !== null))[0] ?? null;
