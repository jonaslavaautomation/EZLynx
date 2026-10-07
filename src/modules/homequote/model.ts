import { addDays, age, today } from '@/lib/format';
import type { Account, CarrierRate, Property } from '@/lib/types';
import type { HomeInput } from '@/modules/quotes/inputs';

/*
 * Home quoting workflow model: rating, policy / underwriting, dwelling, coverage, endorsements and carrier questions,
 * its validation, and the mapping onto the comparative rater's Homeowners model. Stored in `quotes.input.workflow`.
 */

export const STEPS = [
  { key: 'rating', label: 'Rating' },
  { key: 'policy', label: 'Policy Info' },
  { key: 'dwelling', label: 'Dwelling Info' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'endorsements', label: 'Endorsements' },
  { key: 'carrier', label: 'Carrier Questions' },
  { key: 'review', label: 'Valid' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];
export type View = StepKey | 'submit' | 'results';
export const isView = (s: string | null): s is View => !!s && (s === 'submit' || s === 'results' || STEPS.some((x) => x.key === s));

// ── Reference lists ──

export const YES_NO = ['Yes', 'No'];
export const FORM_TYPES = ['HO2 - Broad Form', 'HO3 - Dwelling', 'HO5 - Comprehensive', 'HO8 - Modified Coverage'];
export const NO_PRIOR = 'No Prior Insurance';
export const OTHER_PRIORS = ['Other Standard Carrier', 'Other Non-Standard Carrier', NO_PRIOR];
export const YEARS = Array.from({ length: 11 }, (_, i) => (i === 10 ? '10+' : String(i)));
export const MONTHS = Array.from({ length: 12 }, (_, i) => String(i));
export const LOSSES = ['0', '1', '2', '3', '4+'];
export const DWELLING_USAGE = ['Primary', 'Secondary', 'Seasonal'];
export const OCCUPANCY = ['Owner Occupied', 'Tenant Occupied', 'Vacant'];
export const DWELLING_TYPE = ['One Family', 'Two Family', 'Three Family', 'Four Family', 'Townhouse', 'Row House'];
export const OCCUPANTS = Array.from({ length: 10 }, (_, i) => String(i + 1));
export const STORIES = ['1', '1.5', '2', '2.5', '3', '4+'];
export const CONSTRUCTION_STYLE = ['Dwelling', 'Ranch', 'Colonial', 'Cape Cod', 'Contemporary', 'Split Level', 'Bi-Level', 'Victorian', 'Townhouse', 'Mobile/Manufactured'];
export const ROOF_TYPE = ['Asphalt Shingles', 'Architectural Shingles', 'Metal', 'Clay Tile', 'Concrete Tile', 'Slate', 'Wood Shake', 'Tar & Gravel'];
export const FOUNDATION = ['Slab', 'Crawl Space', 'Basement - Finished', 'Basement - Unfinished', 'Pier & Beam'];
export const ROOF_DESIGN = ['Gable', 'Hip', 'Flat', 'Gambrel', 'Mansard', 'Shed'];
export const EXTERIOR_WALLS = ['Brick Veneer', 'Brick / Masonry', 'Stone Veneer', 'Stucco', 'Vinyl Siding', 'Wood Siding', 'Aluminum Siding', 'Fiber Cement', 'Log'];
export const BATHS = ['1', '2', '3', '4', '5+'];
export const HALF_BATHS = ['0', '1', '2', '3'];
export const STOVES = ['0', '1', '2', '3'];
export const HEATING = ['Electric', 'Gas - Forced Air', 'Heat Pump', 'Oil', 'Propane', 'Wood', 'Solar'];
export const SECONDARY_HEAT = ['None', 'Fireplace', 'Wood Stove', 'Space Heater', 'Pellet Stove'];
export const ALARM = ['None', 'Local', 'Central Station'];
export const ROOF_UL = ['None', 'Class 1', 'Class 2', 'Class 3', 'Class 4 (Impact resistant)'];
export const DETECTION = ['None', 'Local', 'Central Station'];
export const SPRINKLER = ['None', 'Partial', 'Full'];
export const DISTANCE_MILES = Array.from({ length: 15 }, (_, i) => String(i + 1));
export const HYDRANT_FEET = ['1-500', '501-1000', '1001-1500', 'Over 1500', 'No hydrant'];
export const LIABILITY = ['100000', '200000', '300000', '400000', '500000', '1000000'];
export const MEDPAY = ['1000', '2000', '3000', '4000', '5000', '10000'];
export const DEDUCTIBLE = ['250', '500', '1000', '1500', '2000', '2500', '5000', '1%', '2%', '3%', '5%'];
export const THEFT_DED = ['Same as All Perils', '500', '1000', '2500'];
export const WIND_DED = ['Same as All Perils', '1%', '2%', '5%', '1000', '2500'];
export const HURRICANE_DED = ['None', '2%', '5%', '10%'];
export const OTHER_STRUCT_PCT = ['2%', '5%', '10%', '15%', '20%'];
export const PERSONAL_PROPERTY_PCT = ['25%', '40%', '50%', '60%', '70%', '75%'];
export const LOSS_OF_USE_PCT = ['10%', '20%', '30%'];
export const NONE = 'None';
export const E_ADDITIONS = [NONE, '5,000', '10,000', '25,000'];
export const E_INCREASED_RC = [NONE, '25%', '50%'];
export const E_LOSS_ASSESSMENT = [NONE, '5,000', '10,000', '25,000'];
export const E_ORDINANCE = [NONE, '10%', '25%', '50%'];
export const E_CREDIT_CARD = [NONE, '1,000', '5,000', '10,000'];
export const E_JEWELRY = [NONE, '2,500', '5,000', '10,000'];
export const E_WATER_BACKUP = [NONE, '5,000', '10,000', '25,000'];
export const E_MOLD = [NONE, '10,000', '25,000', '50,000'];
export const EQ_ZONE = [NONE, 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];
export const EQ_DED = ['10%', '15%', '20%', '25%'];
export const EQ_VENEER = ['0%', '1-10%', '11-25%', '26-50%', 'Over 50%'];
export const BUSINESS_CLASS = ['', 'Office / Professional', 'Retail sales (no inventory)', 'Tutoring / Teaching', 'Crafts', 'Photography', 'Consulting', 'Other'];
export const SPP_CLASSES = [
  { key: 'coins', label: 'Coins', rate: 1.2 },
  { key: 'fine_arts', label: 'Fine Arts', rate: 0.25 },
  { key: 'furs', label: 'Furs', rate: 0.4 },
  { key: 'guns', label: 'Guns', rate: 0.8 },
] as const;
export type SppKey = (typeof SPP_CLASSES)[number]['key'];
export const INTERESTS = [
  { key: 'first_mortgagee', label: 'First mortgagee' },
  { key: 'second_mortgagee', label: 'Second mortgagee' },
  { key: 'third_mortgagee', label: 'Third mortgagee' },
  { key: 'cosigner', label: 'Cosigner' },
  { key: 'equity_line', label: 'Equity line of credit' },
] as const;
export type InterestKey = (typeof INTERESTS)[number]['key'];

// ── Workflow state ──

export type Interest = { on: boolean; name: string; loan: string };

export type HomeWorkflow = {
  v: 1; kind: 'home';
  rating: { state: string; template_id: string; description: string; carrier_prefill: boolean; carriers: string[]; form: string };
  policy: {
    prior_carrier: string; prior_exp: string; prior_premium: string; years_prior: string; months_prior: string; years_cont: string; months_cont: string;
    credit_auth: string; new_term: string; package: string; effective: string;
    cancelled: boolean; under_construction: boolean; trampoline: boolean; business: boolean; employees: string; pool: boolean; losses: string;
    dogs: boolean; dog_breed: string; dog_bite: string;
  };
  dwelling: {
    alt_address: { address: string; city: string; state: string; zip: string } | null;
    usage: string; occupancy: string; type: string; occupants: string; stories: string; sqft: string; year_built: string; style: string;
    roof_type: string; roof_year: string; foundation: string; roof_design: string; walls: string; full_baths: string; half_baths: string; stoves: string;
    heating: string; secondary_heat: string; burglar_alarm: string; roof_ul: string; dead_bolt: boolean; extinguisher: boolean;
    fire_detection: string; sprinkler: string; smoke_detector: string;
    purchase_price: string; purchase_date: string; station_miles: string; hydrant_feet: string;
    prefilled_at?: string;
  };
  coverage: {
    dwelling: string; replacement: string; liability: string; medpay: string; deductible: string;
    other_pct: string; pp_pct: string; lou_pct: string; theft_ded: string; wind_ded: string; hurricane_ded: string;
    interests: Record<InterestKey, Interest>; other_interests: string;
  };
  endorsements: {
    additions: string; increased_rc: string; loss_assessment: string; ordinance: string; credit_card: string; jewelry: string; water_backup: string; mold: string;
    identity_theft: boolean; rc_contents: boolean; personal_injury: boolean; special_pp: boolean; sinkhole: boolean;
    eq_zone: string; eq_ded: string; eq_veneer: string; eq_exclude_veneer: boolean;
    biz_name: string; biz_class: string; incidental_business: boolean;
    spp: Record<SppKey, { amount: string; breakage: boolean }>;
  };
  answers: Record<string, string>;
  prefilled: string[];
  visited: StepKey[];
  submitted_at?: string;
  broker_fees?: Record<string, string>;
  dismissed?: string[];
  ssn_last4?: string;
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function newHomeWorkflow(account: Account | null, property: Property | null, carriers: string[], preferAll: boolean): HomeWorkflow {
  const blankInterest = (): Interest => ({ on: false, name: '', loan: '' });
  return {
    v: 1, kind: 'home',
    rating: { state: s(property?.state) || s(account?.state) || 'TX', template_id: '', description: '', carrier_prefill: false, carriers: preferAll ? carriers : [], form: 'HO3 - Dwelling' },
    policy: {
      prior_carrier: '', prior_exp: '', prior_premium: '', years_prior: '', months_prior: '', years_cont: '', months_cont: '',
      credit_auth: '', new_term: '12 Month', package: '', effective: '',
      cancelled: false, under_construction: false, trampoline: false, business: false, employees: '', pool: false, losses: '0',
      dogs: false, dog_breed: '', dog_bite: '',
    },
    dwelling: {
      alt_address: null,
      usage: 'Primary', occupancy: 'Owner Occupied', type: 'One Family', occupants: '', stories: '', sqft: s(property?.square_feet), year_built: s(property?.year_built), style: '',
      roof_type: '', roof_year: s(property?.roof_year), foundation: '', roof_design: '', walls: '', full_baths: '', half_baths: '', stoves: '0',
      heating: '', secondary_heat: '', burglar_alarm: '', roof_ul: '', dead_bolt: false, extinguisher: false,
      fire_detection: '', sprinkler: '', smoke_detector: '',
      purchase_price: '', purchase_date: '', station_miles: '', hydrant_feet: '',
    },
    coverage: {
      dwelling: s(property?.dwelling_value), replacement: '', liability: '300000', medpay: '5000', deductible: '1000',
      other_pct: '10%', pp_pct: '50%', lou_pct: '10%', theft_ded: 'Same as All Perils', wind_ded: 'Same as All Perils', hurricane_ded: 'None',
      interests: { first_mortgagee: blankInterest(), second_mortgagee: blankInterest(), third_mortgagee: blankInterest(), cosigner: blankInterest(), equity_line: blankInterest() },
      other_interests: '0',
    },
    endorsements: {
      additions: NONE, increased_rc: NONE, loss_assessment: NONE, ordinance: NONE, credit_card: NONE, jewelry: NONE, water_backup: NONE, mold: NONE,
      identity_theft: false, rc_contents: false, personal_injury: false, special_pp: false, sinkhole: false,
      eq_zone: NONE, eq_ded: '', eq_veneer: '', eq_exclude_veneer: false,
      biz_name: '', biz_class: '', incidental_business: false,
      spp: { coins: { amount: '', breakage: false }, fine_arts: { amount: '', breakage: false }, furs: { amount: '', breakage: false }, guns: { amount: '', breakage: false } },
    },
    answers: {}, prefilled: [], visited: ['rating'],
    ssn_last4: s(account?.ssn_last4),
  };
}

// ── Replacement cost & protection class ──

const n = (x: string, d = 0) => (x !== '' && Number.isFinite(Number(String(x).replace(/[,$%]/g, ''))) ? Number(String(x).replace(/[,$%]/g, '')) : d);
export const num = n;

/** Rough replacement cost: square feet × a construction cost per foot, adjusted for stories, baths and foundation. */
export function replacementCost(d: HomeWorkflow['dwelling']) {
  const sqft = n(d.sqft);
  if (!sqft) return 0;
  const perFt = ({ 'Brick / Masonry': 185, 'Brick Veneer': 170, 'Stone Veneer': 178, Stucco: 165, 'Fiber Cement': 160, 'Vinyl Siding': 150, 'Wood Siding': 155, 'Aluminum Siding': 148, Log: 190 } as Record<string, number>)[d.walls] ?? 160;
  const baths = n(d.full_baths, 2) * 12000 + n(d.half_baths) * 6000;
  const basement = /Basement - Finished/.test(d.foundation) ? 1.08 : /Basement/.test(d.foundation) ? 1.04 : 1;
  const story = n(d.stories, 1) >= 2 ? 0.96 : 1;
  return Math.round((sqft * perFt * basement * story + baths) / 1000) * 1000;
}

/** Protection class from fire station distance and hydrant distance (ISO-style 1–10). */
export function protectionClass(miles: string, hydrant: string) {
  const m = n(miles, 5);
  if (m > 5) return 10;
  if (hydrant === '1-500') return m <= 2 ? 3 : 4;
  if (hydrant === '501-1000') return m <= 2 ? 4 : 5;
  if (hydrant === '1001-1500') return 7;
  return 9;
}

// ── Carrier questions ──

export type CarrierQuestion = {
  id: string; label: string; options: string[]; required?: boolean; step: 'policy' | 'dwelling' | 'carrier'; prefill?: string; help: string;
};

const Q: Record<string, CarrierQuestion> = {
  paperless: { id: 'paperless', label: 'Paperless', options: YES_NO, step: 'policy', prefill: 'Yes', help: 'Customer agrees to receive policy documents electronically.' },
  prior_liability: { id: 'prior_liability', label: 'Prior Liability Limit', options: ['Less than $300,000', '$300,000 or more', 'No prior coverage'], required: true, step: 'policy', help: 'Personal liability limit on the prior home policy.' },
  payment_method: { id: 'payment_method', label: 'Payment Method', options: ['Mortgage Billed', 'Direct Bill', 'EFT', 'Credit Card'], required: true, step: 'policy', help: 'How the premium will be paid; escrowed policies are billed to the mortgage company.' },
  roof_updated: { id: 'roof_updated', label: 'Has the roof been replaced in the last 10 years?', options: YES_NO, step: 'dwelling', prefill: 'No', help: 'A recently replaced roof earns a credit with this carrier.' },
  leak_device: { id: 'leak_device', label: 'Is a water leak detection / automatic shut-off device installed?', options: YES_NO, step: 'dwelling', prefill: 'No', help: 'Water shut-off devices earn a credit.' },
  loss_settlement_roof: { id: 'loss_settlement_roof', label: 'Loss Settlement-Wind/Hail Losses to Roof', options: ['Replacement Cost', 'Actual Cash Value'], required: true, step: 'carrier', prefill: 'Replacement Cost', help: 'Actual cash value roof settlement lowers the premium but depreciates roof claims.' },
  open_claims: { id: 'open_claims', label: 'Are there any open claims or pending litigation on the property?', options: YES_NO, required: true, step: 'carrier', help: 'Open claims make the property ineligible with this carrier.' },
  near_water: { id: 'near_water', label: 'Is the dwelling within 1,000 feet of a body of water?', options: YES_NO, required: true, step: 'carrier', help: 'Used for water exposure underwriting.' },
  green_home: { id: 'green_home', label: 'Is the home certified green / energy efficient?', options: YES_NO, step: 'carrier', prefill: 'No', help: 'Certified homes earn a small credit.' },
};

const SETS: string[][] = [
  ['paperless', 'prior_liability', 'payment_method', 'loss_settlement_roof'],
  ['paperless', 'roof_updated', 'leak_device', 'open_claims'],
  ['paperless', 'payment_method', 'near_water'],
  ['paperless', 'roof_updated', 'green_home', 'loss_settlement_roof'],
];

export function questionsFor(carrier: string, homeCarriers: string[]): CarrierQuestion[] {
  const i = Math.max(0, [...homeCarriers].sort().indexOf(carrier));
  return SETS[i % SETS.length].map((id) => Q[id]);
}
export const answerKey = (carrier: string, q: string) => `${carrier}|${q}|`;

export function stepQuestions(step: CarrierQuestion['step'], carriers: string[], homeCarriers: string[]) {
  const byQ = new Map<string, { q: CarrierQuestion; carriers: string[] }>();
  for (const c of carriers) for (const q of questionsFor(c, homeCarriers)) {
    if (q.step !== step) continue;
    const e = byQ.get(q.id) ?? { q, carriers: [] };
    e.carriers.push(c);
    byQ.set(q.id, e);
  }
  return [...byQ.values()];
}

export function applyPrefill(w: HomeWorkflow, homeCarriers: string[]): HomeWorkflow {
  if (!w.rating.carrier_prefill) return w;
  const answers = { ...w.answers };
  const prefilled = new Set(w.prefilled);
  for (const c of w.rating.carriers) for (const q of questionsFor(c, homeCarriers)) {
    if (!q.prefill) continue;
    const k = answerKey(c, q.id);
    if (!answers[k]) { answers[k] = q.prefill; prefilled.add(k); }
  }
  return { ...w, answers, prefilled: [...prefilled] };
}

export function clearPrefill(w: HomeWorkflow): HomeWorkflow {
  const answers = { ...w.answers };
  for (const k of w.prefilled) delete answers[k];
  return { ...w, answers, prefilled: [] };
}

// ── Validation ──

export type Issue = { step: StepKey; field: string; label: string; message: string };

export function validate(w: HomeWorkflow, homeCarriers: string[]): Issue[] {
  const out: Issue[] = [];
  const req = (step: StepKey, field: string, label: string, value: unknown, message = `${label} is required for rating`) => {
    if (value === '' || value === null || value === undefined) out.push({ step, field, label, message });
  };
  const thisYear = new Date().getFullYear();

  if (!w.rating.carriers.length) out.push({ step: 'rating', field: 'carriers', label: 'Carriers', message: 'You must select at least one carrier.' });
  req('rating', 'rating.state', 'Rating State', w.rating.state);
  req('rating', 'rating.form', 'Policy/Form Type', w.rating.form, 'Policy/Form Type is required');

  const p = w.policy;
  const noPrior = p.prior_carrier === NO_PRIOR;
  req('policy', 'policy.prior_carrier', 'Prior Carrier', p.prior_carrier);
  if (!noPrior) {
    req('policy', 'policy.prior_exp', 'Expiration Date (current policy)', p.prior_exp, 'Expiration date is required for rating');
    req('policy', 'policy.years_prior', 'Years with Prior Carrier', p.years_prior);
    req('policy', 'policy.months_prior', 'Months', p.months_prior, 'Months is required for rating');
    req('policy', 'policy.years_cont', 'Years with Continuous Coverage', p.years_cont);
    req('policy', 'policy.months_cont', 'Months', p.months_cont, 'Months is required for rating');
    if (p.prior_premium && !(n(p.prior_premium, -1) >= 0)) out.push({ step: 'policy', field: 'policy.prior_premium', label: 'Prior Policy Premium', message: 'Enter a dollar amount' });
  }
  req('policy', 'policy.credit_auth', 'Credit Check Authorized', p.credit_auth, 'This is required for rating');
  req('policy', 'policy.package', 'Quote as Package', p.package, 'Package is required for rating');
  req('policy', 'policy.effective', 'Effective Date (New Policy)', p.effective, 'Effective Date is required for rating');
  if (p.effective && p.effective < today()) out.push({ step: 'policy', field: 'policy.effective', label: 'Effective Date (New Policy)', message: 'Effective date cannot be in the past' });
  if (p.effective && p.effective > addDays(today(), 90)) out.push({ step: 'policy', field: 'policy.effective', label: 'Effective Date (New Policy)', message: 'Effective date must be within 90 days' });
  req('policy', 'policy.losses', 'Property losses in the last 5 years', p.losses, 'Required');
  if (p.business && !(n(p.employees, -1) >= 0)) out.push({ step: 'policy', field: 'policy.employees', label: '# of Employees', message: '# of Employees is required' });
  if (p.dogs) {
    req('policy', 'policy.dog_breed', 'Dog breed', p.dog_breed.trim(), 'Dog breed is required');
    req('policy', 'policy.dog_bite', 'Bite history', p.dog_bite, 'Bite history is required');
  }

  const d = w.dwelling;
  for (const [k, label] of [
    ['usage', 'Dwelling Usage'], ['occupancy', 'Occupancy Type'], ['type', 'Dwelling Type'], ['stories', 'Number of Stories'], ['sqft', 'Square Footage'], ['year_built', 'Year Built'],
    ['style', 'Construction Style'], ['roof_type', 'Roof Type'], ['foundation', 'Foundation Type'], ['roof_design', 'Roof Design'], ['walls', 'Exterior Walls'],
    ['full_baths', 'Number Of Full Baths'], ['heating', 'Heating Type'], ['purchase_date', 'Purchase Date'], ['station_miles', 'Distance From Fire Station'], ['hydrant_feet', 'Feet From Hydrant'],
  ] as const) req('dwelling', `dwelling.${k}`, label, d[k]);
  if (d.year_built && (n(d.year_built) < 1800 || n(d.year_built) > thisYear + 1)) out.push({ step: 'dwelling', field: 'dwelling.year_built', label: 'Year Built', message: `Enter a year between 1800 and ${thisYear + 1}` });
  if (d.sqft && (n(d.sqft) < 300 || n(d.sqft) > 20000)) out.push({ step: 'dwelling', field: 'dwelling.sqft', label: 'Square Footage', message: 'Enter 300 to 20,000 square feet' });
  if (d.roof_year && (n(d.roof_year) < n(d.year_built, 0) || n(d.roof_year) > thisYear)) out.push({ step: 'dwelling', field: 'dwelling.roof_year', label: 'Year Roof Replaced', message: 'Roof year must be between the year built and this year' });
  if (d.purchase_date && d.purchase_date > today()) out.push({ step: 'dwelling', field: 'dwelling.purchase_date', label: 'Purchase Date', message: 'Purchase date cannot be in the future' });
  if (d.alt_address) {
    req('dwelling', 'dwelling.alt.address', 'Dwelling address', d.alt_address.address.trim(), 'Address is required');
    if (!/^\d{5}$/.test(d.alt_address.zip)) out.push({ step: 'dwelling', field: 'dwelling.alt.zip', label: 'Dwelling ZIP', message: 'Enter a 5-digit ZIP' });
  }

  const c = w.coverage;
  req('coverage', 'coverage.dwelling', 'Dwelling', c.dwelling, 'Dwelling is required');
  req('coverage', 'coverage.replacement', 'Est. Replacement Cost', c.replacement, 'Est. Replacement Cost is required');
  req('coverage', 'coverage.liability', 'Personal Liability', c.liability, 'Personal Liability is required');
  req('coverage', 'coverage.medpay', 'Medical Payments', c.medpay, 'Medical Payments is required');
  req('coverage', 'coverage.deductible', 'All Perils Deductible', c.deductible, 'All Perils Deductible is required');
  if (c.dwelling && n(c.dwelling) < 50000) out.push({ step: 'coverage', field: 'coverage.dwelling', label: 'Dwelling', message: 'Dwelling must be at least $50,000' });
  if (!(n(c.other_interests, -1) >= 0)) out.push({ step: 'coverage', field: 'coverage.other_interests', label: '# of Other Interests', message: '# of Other Interests is required' });
  for (const it of INTERESTS) {
    const v = c.interests[it.key];
    if (v.on && !v.name.trim()) out.push({ step: 'coverage', field: `coverage.interest.${it.key}`, label: `${it.label} name`, message: `${it.label} name is required` });
  }
  if (c.hurricane_ded !== 'None' && !['TX', 'FL', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC'].includes(w.rating.state)) out.push({ step: 'coverage', field: 'coverage.hurricane_ded', label: 'Hurricane Deductible', message: `Hurricane deductibles don't apply in ${w.rating.state}` });

  const e = w.endorsements;
  if (e.eq_zone !== NONE) {
    req('endorsements', 'endorsements.eq_ded', 'Earthquake Deductible', e.eq_ded, 'Deductible is required');
    req('endorsements', 'endorsements.eq_veneer', 'Percent Veneer', e.eq_veneer, 'Percent Veneer is required');
  }
  if (e.biz_name.trim() && !e.biz_class) out.push({ step: 'endorsements', field: 'endorsements.biz_class', label: 'Business Class', message: 'Business Class is required' });
  for (const sc of SPP_CLASSES) {
    const a = e.spp[sc.key].amount;
    if (a && !(n(a, -1) > 0)) out.push({ step: 'endorsements', field: `endorsements.spp.${sc.key}`, label: sc.label, message: 'Enter the scheduled amount' });
  }

  for (const carrier of w.rating.carriers) for (const q of questionsFor(carrier, homeCarriers)) {
    if (q.required && !w.answers[answerKey(carrier, q.id)]) out.push({ step: q.step, field: `answer.${answerKey(carrier, q.id)}`, label: `${carrier}: ${q.label}`, message: `Required for Carrier: ${carrier}` });
  }
  return out;
}

/** Non-blocking items that improve accuracy (shown on the Valid step). */
export function accuracyItems(w: HomeWorkflow): { field: string; label: string; step: StepKey | 'ssn' }[] {
  const out: { field: string; label: string; step: StepKey | 'ssn' }[] = [];
  if (!w.ssn_last4) out.push({ field: 'ssn', label: 'Applicant SSN is empty.', step: 'ssn' });
  if (w.policy.prior_exp && w.policy.prior_exp > today()) out.push({ field: 'policy.prior_exp', label: 'Prior policy expiration date is in the future.', step: 'policy' });
  if (!w.dwelling.purchase_price) out.push({ field: 'dwelling.purchase_price', label: 'Purchase price is empty.', step: 'dwelling' });
  const rc = n(w.coverage.replacement);
  if (rc && n(w.coverage.dwelling) < rc * 0.8) out.push({ field: 'coverage.dwelling', label: 'Dwelling coverage is below 80% of the estimated replacement cost.', step: 'coverage' });
  if (!w.dwelling.roof_year) out.push({ field: 'dwelling.roof_year', label: 'Year roof replaced is empty (roof age is a major rating factor).', step: 'dwelling' });
  return out;
}

// ── Mapping to the rating engine ──

const pctOf = (x: string) => n(x) / 100;

function engineConstruction(walls: string) {
  if (/Brick \/ Masonry|Stone/.test(walls)) return 'Masonry';
  if (/Brick Veneer/.test(walls)) return 'Brick Veneer';
  if (/Stucco/.test(walls)) return 'Stucco';
  if (/Log/.test(walls)) return 'Log';
  return 'Frame';
}
function engineRoof(roof: string) {
  if (/Architectural/.test(roof)) return 'Architectural Shingle';
  if (/Asphalt/.test(roof)) return 'Composition Shingle';
  if (/Metal/.test(roof)) return 'Metal';
  if (/Tile|Slate/.test(roof)) return 'Tile';
  if (/Wood/.test(roof)) return 'Wood Shake';
  return 'Flat / Built-up';
}
/** Percentage deductibles are converted to dollars, then to the nearest deductible the rater knows. */
function engineDeductible(ded: string, dwelling: number) {
  const dollars = ded.endsWith('%') ? pctOf(ded) * dwelling : n(ded, 1000);
  return [500, 1000, 2500, 5000].reduce((best, x) => (Math.abs(x - dollars) < Math.abs(best - dollars) ? x : best), 1000);
}

/** The insured's property record for this dwelling; null until it has an address. Blank answers stay empty. */
export function propertyValues(w: HomeWorkflow, account: Account | null) {
  const d = w.dwelling;
  const loc = d.alt_address ?? { address: s(account?.address), city: s(account?.city), state: w.rating.state, zip: s(account?.zip) };
  if (!loc.address.trim()) return null;
  const whole = (x: string) => (x.trim() !== '' && Number.isFinite(n(x, NaN)) ? Math.round(n(x)) : null);
  return {
    address: loc.address.trim(), city: loc.city.trim() || null, state: w.rating.state || loc.state || null, zip: loc.zip.trim() || null,
    year_built: whole(d.year_built), square_feet: whole(d.sqft), construction: d.walls ? engineConstruction(d.walls) : null, roof_type: d.roof_type ? engineRoof(d.roof_type) : null,
    roof_year: whole(d.roof_year), protection_class: d.station_miles || d.hydrant_feet ? protectionClass(d.station_miles, d.hydrant_feet) : null,
    dwelling_value: whole(w.coverage.dwelling),
  };
}

export function toHomeInput(w: HomeWorkflow, account: Account | null, propertyId: string | null): HomeInput {
  const d = w.dwelling;
  const loc = d.alt_address ?? { address: s(account?.address), city: s(account?.city), state: w.rating.state, zip: s(account?.zip) };
  const dwelling = n(w.coverage.dwelling, 250000);
  return {
    property_id: propertyId,
    address: loc.address, city: loc.city, state: w.rating.state || loc.state, zip: loc.zip,
    year_built: n(d.year_built, 2000), square_feet: n(d.sqft, 1800), construction: engineConstruction(d.walls), roof_type: engineRoof(d.roof_type),
    roof_year: n(d.roof_year, n(d.year_built, 2000)), protection_class: protectionClass(d.station_miles, d.hydrant_feet),
    dwelling, personal_property_pct: n(w.coverage.pp_pct, 50), deductible: engineDeductible(w.coverage.deductible, dwelling),
    liability: n(w.coverage.liability, 300000), medpay: n(w.coverage.medpay, 5000), claims_5yr: n(w.policy.losses),
    alarm: d.burglar_alarm === 'Central Station', sprinklers: d.sprinkler === 'Full', multi_policy: w.policy.package === 'Yes', paid_in_full: false,
  };
}

export const ageOfHome = (w: HomeWorkflow) => new Date().getFullYear() - n(w.dwelling.year_built, new Date().getFullYear());
export const insuredAge = (dob: string | null | undefined) => age(dob ?? null);
export type Rated = CarrierRate & { discounts?: string[]; surcharges?: string[]; notes?: string[]; endorsements?: { name: string; premium: number }[]; uw?: string[] };
