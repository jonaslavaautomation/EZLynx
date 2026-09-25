import type { Carrier, CarrierRate, Coverage } from '@/lib/types';
import { rateQuote, sortRates, type RatedCarrier } from '@/modules/quotes/rating';
import { addDays, today } from '@/lib/format';
import { answerKey, blankVehicleCoverage, mature, questionsFor, toAutoInput, youthful, type Workflow } from './model';

/*
 * Prices a workflow with the comparative rating engine, then applies what the engine doesn't model:
 * per-vehicle deductibles, state coverages (UMPD, PIP, death indemnity), UIM, glass/loan-lease, credits,
 * surcharges and each carrier's own question answers. Also builds optional "Alt Quote" options and the
 * pay-plan prices shown on Quote Results. Illustrative rates only.
 */

type Adj = { factor: number; discounts: string[]; surcharges: string[]; extras: { name: string; limit: string; annual: number }[]; decline: string | null };

const pct = (f: number) => `${Math.round(Math.abs(1 - f) * 100)}%`;
const within3y = (d: string) => !!d && d >= addDays(today(), -365 * 3);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function adjustments(w: Workflow, carrier: string, autoCarriers: string[]): Adj {
  const a: Adj = { factor: 1, discounts: [], surcharges: [], extras: [], decline: null };
  const credit = (label: string, f: number) => { a.factor *= f; a.discounts.push(`${label} ${pct(f)}`); };
  const surcharge = (label: string, f: number) => { a.factor *= f; a.surcharges.push(`${label} +${pct(f)}`); };
  const c = w.coverage;
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  const vcov = (k: string) => c.vehicles[k] ?? blankVehicleCoverage();

  // Eligibility
  if (rated.some((d) => d.dl_status === 'Suspended' || d.dl_status === 'Revoked')) a.decline = 'A rated driver has a suspended or revoked license';

  // State and optional coverages (annual, per vehicle unless noted)
  const perVeh = w.vehicles.length;
  if (c.uim !== 'No Coverage') a.extras.push({ name: 'Underinsured Motorist', limit: c.uim, annual: 38 * perVeh });
  if (c.umpd !== 'No Coverage' && c.um !== 'No Coverage') a.extras.push({ name: 'Uninsured Motorist PD', limit: Number(c.umpd).toLocaleString('en-US'), annual: ({ 25000: 30, 50000: 42, 100000: 60 } as Record<string, number>)[c.umpd] * perVeh || 0 });
  if (c.pip !== 'No Coverage') a.extras.push({ name: 'Personal Injury Protection', limit: Number(c.pip).toLocaleString('en-US'), annual: ({ 2500: 64, 5000: 98, 10000: 150 } as Record<string, number>)[c.pip] * perVeh || 0 });
  if (c.adi !== 'No Coverage' && w.rating.state === 'TX') a.extras.push({ name: 'Auto Death Indemnity', limit: Number(c.adi).toLocaleString('en-US'), annual: ({ 5000: 8, 10000: 14 } as Record<string, number>)[c.adi] * rated.length || 0 });
  const glass = w.vehicles.filter((v) => vcov(v.key).full_glass && vcov(v.key).comp !== 'No Coverage').length;
  if (glass) a.extras.push({ name: 'Full Glass', limit: '$0 ded', annual: 40 * glass });
  const loan = w.vehicles.filter((v) => vcov(v.key).loan_lease && (v.ownership === 'Financed' || v.ownership === 'Leased')).length;
  if (loan) a.extras.push({ name: 'Loan/Lease Gap', limit: '25% ACV', annual: 45 * loan });

  // Credits
  if (c.retirement) credit('Retirement community', 0.97);
  if (c.aaa) credit('Auto club membership', 0.96);
  if (c.company_car) credit('Company car insured elsewhere', 0.98);
  if (w.policy.package === 'Yes') credit('Package', 0.97);
  if (w.vehicles.some((v) => v.telematics === 'Yes')) credit('Vehicle telematics', 0.95);
  if (w.vehicles.some((v) => ['Active Disabling', 'Passive Disabling', 'Tracking Device'].includes(v.anti_theft))) credit('Anti-theft device', 0.98);
  if (w.vehicles.some((v) => v.passive === 'Airbag Both Sides') && w.vehicles.every((v) => v.abs === 'Yes')) credit('Safety equipment', 0.98);
  if (rated.some((d) => d.defensive_date && within3y(d.defensive_date))) credit('Defensive driver course', 0.95);
  if (rated.some((d) => mature(d) && d.mature_driver === 'Yes')) credit('Mature driver', 0.97);
  if (rated.some((d) => d.driver_ed === 'Yes')) credit('Driver education', 0.97);
  if (rated.some((d) => d.good_driver === 'Yes')) credit('Good driver', 0.95);
  if (rated.some((d) => youthful(d) && d.student_away === 'Yes')) credit('Student away at school', 0.96);

  // Surcharges
  const comp = w.incidents.comp_losses.filter((x) => within3y(x.date)).length;
  if (comp) surcharge(`${comp} comprehensive loss${comp > 1 ? 'es' : ''}`, 1 + 0.05 * comp);
  if (w.policy.credit_auth === 'No') surcharge('No credit authorization', 1.1);
  if (rated.some((d) => d.sr22 === 'Yes' || d.fr44 === 'Yes')) surcharge('SR-22 / FR-44 filing', 1.15);
  if (rated.some((d) => d.license_sus === 'Yes')) surcharge('License suspension in last 5 years', 1.25);
  if (w.vehicles.some((v) => v.tnc === 'Yes' || v.used_delivery)) surcharge('Rideshare / delivery use', 1.1);
  if (w.vehicles.some((v) => v.prior_damage)) surcharge('Prior unrepaired damage', 1.03);
  const perf = Math.max(1, ...w.vehicles.map((v) => ({ Sports: 1.08, 'High Performance': 1.12, 'Super Car': 1.35 } as Record<string, number>)[v.performance] ?? 1));
  if (perf > 1) surcharge('Performance vehicle', perf);

  // This carrier's questions
  const qs = questionsFor(carrier, autoCarriers).map((q) => q.id);
  const ans = (q: string, subj = '') => w.answers[answerKey(carrier, q, subj)] ?? '';
  // Only answers about drivers / vehicles still rated on the quote count.
  const subjects = new Set(['', ...rated.map((d) => d.key), ...w.vehicles.map((v) => v.key)]);
  const anyAns = (q: string, value: (v: string) => boolean) => Object.entries(w.answers).some(([k, v]) => k.startsWith(`${carrier}|${q}|`) && subjects.has(k.slice(`${carrier}|${q}|`.length)) && value(v));
  if (qs.includes('paperless') && ans('paperless') === 'Yes') credit('Paperless', 0.98);
  if (qs.includes('telematics_enroll') && ans('telematics_enroll') === 'Yes') credit('Telematics enrollment', 0.93);
  if (qs.includes('telematics_discount') && anyAns('telematics_discount', (v) => v === 'Yes')) credit('Usage-based driving', 0.95);
  if (qs.includes('other_policy') && ans('other_policy') && ans('other_policy') !== 'None') credit(`Existing ${ans('other_policy').replace(' Policy', '').toLowerCase()} policy`, 0.95);
  if (qs.includes('education') && anyAns('education', (v) => /Bachelor|Master|Doctorate/.test(v))) credit('Education', 0.97);
  if (qs.includes('rideshare') && ans('rideshare') && ans('rideshare') !== 'No') surcharge('Commercial use endorsement', 1.12);
  if (qs.includes('owned_duration') && anyAns('owned_duration', (v) => v === 'Less than 1 year')) surcharge('Recently purchased vehicle', 1.03);
  if (qs.includes('license_type') && anyAns('license_type', (v) => v === 'Learner Permit')) surcharge('Permit driver', 1.1);
  if (qs.includes('pip_claims') && Number(ans('pip_claims').replace('+', '')) > 0) surcharge('Prior injury claims', 1 + 0.08 * Number(ans('pip_claims').replace('+', '')));
  if (qs.includes('branded_title') && anyAns('branded_title', (v) => v === 'Yes')) a.decline = 'Branded-title vehicles are ineligible';
  if (qs.includes('residents') && w.policy.credit_auth === 'No') a.decline = 'Credit authorization is required by this carrier';
  return a;
}

function apply(r: RatedCarrier, a: Adj): RatedCarrier {
  if (r.status !== 'Quoted' || r.premium === null) return r;
  if (a.decline) return { ...r, status: 'Declined', premium: null, coverages: [], message: a.decline };
  const termF = r.term_months / 12;
  const fee = r.coverages.find((c) => c.name === 'Policy Fee')?.premium ?? 0;
  const scaled: Coverage[] = r.coverages.map((c) => (c.name === 'Policy Fee' ? c : { ...c, premium: Math.round((c.premium ?? 0) * a.factor) }));
  const extras: Coverage[] = a.extras.map((x) => ({ name: x.name, limit: x.limit, premium: Math.round(x.annual * termF) }));
  const coverages = [...scaled.filter((c) => c.name !== 'Policy Fee'), ...extras, ...(fee ? [{ name: 'Policy Fee', limit: '—', premium: fee }] : [])];
  const premium = coverages.reduce((s, c) => s + (c.premium ?? 0), 0);
  return { ...r, premium, coverages, discounts: [...(r.discounts ?? []), ...a.discounts], surcharges: [...(r.surcharges ?? []), ...a.surcharges] };
}

/** Engine premium per carrier, correcting for vehicles whose deductibles differ from vehicle 1. */
function engineRates(w: Workflow, carriers: Carrier[], zip: string, dedOverride?: { comp: string; coll: string }) {
  const raise = (cur: string, to: string) => (cur === 'No Coverage' ? cur : String(Math.max(Number(cur) || 0, Number(to))));
  const wf: Workflow = dedOverride
    ? { ...w, coverage: { ...w.coverage, vehicles: Object.fromEntries(w.vehicles.map((v) => { const c = w.coverage.vehicles[v.key] ?? blankVehicleCoverage(); return [v.key, { ...c, comp: raise(c.comp, dedOverride.comp), coll: raise(c.coll, dedOverride.coll) }]; })) } }
    : w;
  const names = carriers.map((c) => c.name);
  const base = rateQuote('Personal Auto', { v: 1, carriers: names, auto: toAutoInput(wf, zip) }, carriers);
  if (wf.vehicles.length < 2) return base;
  const first = wf.vehicles[0].key;
  const cov = (k: string) => wf.coverage.vehicles[k] ?? blankVehicleCoverage();
  const differs = wf.vehicles.slice(1).filter((v) => cov(v.key).comp !== cov(first).comp || cov(v.key).coll !== cov(first).coll);
  if (!differs.length) return base;
  return base.map((r) => {
    if (r.status !== 'Quoted' || r.premium === null) return r;
    const carrier = carriers.filter((c) => c.name === r.carrier);
    let delta = 0;
    for (const v of differs) {
      const own = rateQuote('Personal Auto', { v: 1, carriers: [r.carrier], auto: toAutoInput(wf, zip, [v.key], v.key) }, carrier)[0];
      const asFirst = rateQuote('Personal Auto', { v: 1, carriers: [r.carrier], auto: toAutoInput(wf, zip, [v.key], first) }, carrier)[0];
      if (own?.premium != null && asFirst?.premium != null) delta += own.premium - asFirst.premium;
    }
    const physical = (name: string) => name === 'Comprehensive' || name === 'Collision';
    const phys = r.coverages.filter((c) => physical(c.name));
    // Vehicle 1 without physical damage has no Comp/Coll rows: carry the other vehicles' physical damage on its own row.
    const coverages = phys.length
      ? r.coverages.map((c) => (c === phys[0] ? { ...c, premium: Math.max(0, (c.premium ?? 0) + delta), deductible: 'Varies' } : physical(c.name) ? { ...c, deductible: 'Varies' } : c))
      : delta > 0 ? [...r.coverages.filter((c) => c.name !== 'Policy Fee'), { name: 'Comprehensive', limit: 'ACV', deductible: 'Varies', premium: delta }, ...r.coverages.filter((c) => c.name === 'Policy Fee')] : r.coverages;
    return { ...r, premium: Math.max(50, r.premium + delta), coverages };
  });
}

export function rateWorkflow(w: Workflow, carriers: Carrier[], zip: string, autoCarriers: string[]): { results: RatedCarrier[]; alt: RatedCarrier[] } {
  const results = engineRates(w, carriers, zip).map((r) => apply(r, adjustments(w, r.carrier, autoCarriers)));
  // Alt quote: carriers that offer a higher-deductible option when the quote uses deductibles under $1,000.
  const canAlt = w.vehicles.some((v) => { const c = w.coverage.vehicles[v.key] ?? blankVehicleCoverage(); return (c.comp !== 'No Coverage' && Number(c.comp) < 1000) || (c.coll !== 'No Coverage' && Number(c.coll) < 1000); });
  const altCarriers = canAlt ? carriers.filter((c) => hash(`alt:${c.name}`) % 2 === 0 && results.some((r) => r.carrier === c.name && r.status === 'Quoted')) : [];
  const alt = altCarriers.length
    ? engineRates(w, altCarriers, zip, { comp: '1000', coll: '1000' })
      .map((r) => apply(r, adjustments(w, r.carrier, autoCarriers)))
      .filter((r) => r.status === 'Quoted')
      .map((r) => ({ ...r, message: 'Alt Quote: $1,000 comprehensive / collision deductibles' }))
    : [];
  return { results: sortRates(results), alt };
}

// ── Pay plans ──

export type PayPlan = 'full' | 'monthly' | 'eft';
export const PAY_LABEL: Record<PayPlan, string> = { full: 'Full Pay', monthly: 'Monthly', eft: 'EFT' };

/** Displayed price for a pay plan: full-term paid-in-full, or a per-month installment. */
export function planPrice(r: Pick<CarrierRate, 'premium' | 'term_months' | 'carrier'>, plan: PayPlan, w: Workflow): { amount: number; unit: string } | null {
  if (r.premium === null) return null;
  const eftAns = Object.entries(w.answers).find(([k]) => k.startsWith(`${r.carrier}|eft_discount|`))?.[1];
  if (plan === 'full') return { amount: round2(r.premium * 0.95 * (eftAns === 'Yes' ? 0.98 : 1)), unit: `/ ${r.term_months} mo (Paid-In-Full)` };
  if (plan === 'monthly') return { amount: round2(r.premium / r.term_months + 5), unit: '/ mo (Monthly)' };
  return { amount: round2((r.premium * 0.97) / r.term_months + 1), unit: '/ mo (EFT)' };
}
const round2 = (x: number) => Math.round(x * 100) / 100;
export const money2 = (x: number) => x.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** Median of a list. */
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── VIN decoding ──

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
const WMI: Record<string, string> = {
  '1G1': 'Chevrolet', '1GC': 'Chevrolet', '1GN': 'Chevrolet', '2G1': 'Chevrolet', '3GC': 'Chevrolet', '3GN': 'Chevrolet', '1GT': 'GMC', '1GK': 'GMC', '3GT': 'GMC',
  '1FA': 'Ford', '1FT': 'Ford', '1FM': 'Ford', '3FA': 'Ford', '1LN': 'Lincoln', '1HG': 'Honda', '2HG': 'Honda', '5FN': 'Honda', '5J6': 'Honda', '19U': 'Acura',
  'JTD': 'Toyota', 'JTE': 'Toyota', 'JTM': 'Toyota', '4T1': 'Toyota', '5TD': 'Toyota', '5TF': 'Toyota', '2T1': 'Toyota', 'JTH': 'Lexus', '2T2': 'Lexus',
  '1C4': 'Jeep', '1J4': 'Jeep', '1C6': 'Ram', '3C6': 'Ram', '2C3': 'Chrysler', '1C3': 'Chrysler', '2C4': 'Chrysler', '1B3': 'Dodge', '2B3': 'Dodge',
  '5YJ': 'Tesla', '7SA': 'Tesla', 'JN1': 'Nissan', 'JN8': 'Nissan', '1N4': 'Nissan', '3N1': 'Nissan', '5N1': 'Nissan', 'KM8': 'Hyundai', '5NP': 'Hyundai',
  'KNA': 'Kia', 'KND': 'Kia', '5XY': 'Kia', 'WBA': 'BMW', '5UX': 'BMW', 'WDD': 'Mercedes-Benz', 'W1K': 'Mercedes-Benz', '4JG': 'Mercedes-Benz',
  'WAU': 'Audi', 'WA1': 'Audi', 'JF1': 'Subaru', 'JF2': 'Subaru', '4S4': 'Subaru', '3VW': 'Volkswagen', 'WVW': 'Volkswagen', '1VW': 'Volkswagen',
  'JM1': 'Mazda', 'JM3': 'Mazda', 'YV1': 'Volvo', 'YV4': 'Volvo', 'WP0': 'Porsche', 'WP1': 'Porsche', '7FC': 'Rivian', 'KMH': 'Hyundai', 'JA4': 'Mitsubishi',
};

export type VinInfo = { year: string; make: string; model: string; sub_model: string; body: string; passive?: string; abs?: string; drl?: string; source: 'NHTSA' | 'VIN pattern' };

/** Model year from position 10, choosing the most recent cycle not after next year. */
export function vinYear(vin: string) {
  const i = YEAR_CODES.indexOf(vin.toUpperCase()[9] ?? '');
  if (i < 0) return '';
  const max = new Date().getFullYear() + 1;
  let y = 1980 + i;
  while (y + 30 <= max) y += 30;
  return String(y);
}

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bBmw\b/, 'BMW').replace(/\bGmc\b/, 'GMC');

/** Decodes a VIN with NHTSA's public vPIC service; falls back to the VIN's own year/manufacturer codes offline. */
export async function decodeVin(vin: string, signal?: AbortSignal): Promise<VinInfo> {
  const v = vin.toUpperCase();
  const fallback: VinInfo = { year: vinYear(v), make: WMI[v.slice(0, 3)] ?? '', model: '', sub_model: '', body: '', source: 'VIN pattern' };
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(v)}?format=json`, { signal });
    if (!res.ok) return fallback;
    const r = (await res.json())?.Results?.[0] as Record<string, string> | undefined;
    if (!r || !r.Make) return fallback;
    const makeT = title(r.Make);
    const known = ['Mercedes-Benz', 'Land Rover'].find((m) => m.toLowerCase() === r.Make.toLowerCase()) ?? makeT;
    const sub = [r.Series, r.Trim].filter(Boolean).join(' ').trim();
    return {
      year: r.ModelYear || fallback.year, make: known, model: r.Model || '', sub_model: sub, body: r.BodyClass || '', source: 'NHTSA',
      passive: r.AirBagLocFront ? (/1st and 2nd|Driver Seat/.test(r.AirBagLocFront) && /Passenger/.test(r.AirBagLocFront) ? 'Airbag Both Sides' : 'Airbag Driver Side') : undefined,
      abs: r.ABS ? (r.ABS === 'Standard' ? 'Yes' : 'No') : undefined,
      drl: r.DaytimeRunningLight ? (r.DaytimeRunningLight === 'Standard' ? 'Yes' : 'No') : undefined,
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return fallback;
  }
}

/** New-vehicle cost estimate (MSRP-like) for the Cost New Value field. */
export function costNewEstimate(make: string, model: string, body: string) {
  const base: Record<string, number> = {
    toyota: 36000, honda: 34000, ford: 48000, chevrolet: 46000, tesla: 52000, subaru: 35000, jeep: 48000, hyundai: 32000, nissan: 31000, kia: 36000,
    bmw: 62000, 'mercedes-benz': 66000, audi: 58000, lexus: 55000, gmc: 55000, ram: 52000, dodge: 42000, mazda: 32000, volkswagen: 34000, porsche: 110000,
  };
  let v = base[make.toLowerCase()] ?? 38000;
  if (/2500|3500|HD|Heavy Duty/i.test(model) || /Pickup/i.test(body) && /K3500|K2500/i.test(model)) v *= 1.55;
  else if (/Pickup/i.test(body)) v *= 1.15;
  return Math.round(v / 100) * 100;
}
