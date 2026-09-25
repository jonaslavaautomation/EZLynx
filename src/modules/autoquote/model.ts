import { uuid } from '@/lib/db';
import { addDays, age, today } from '@/lib/format';
import type { Account, Driver, Vehicle } from '@/lib/types';
import { estimateVehicleValue, type AutoInput, type PriorInsurance } from '@/modules/quotes/inputs';

/*
 * Auto quoting workflow model: the full applicant / policy / driver / vehicle / incident / coverage / carrier-question
 * state behind the stepper, its validation, and the mapping onto the comparative rating engine.
 * Stored in `quotes.input.workflow` so a quote can be resumed at any step.
 */

export const STEPS = [
  { key: 'rating', label: 'Rating' },
  { key: 'policy', label: 'Policy Info' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'carrier', label: 'Carrier Questions' },
  { key: 'review', label: 'Invalid' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];
export type View = StepKey | 'submit' | 'results';
export const isView = (s: string | null): s is View => !!s && (s === 'submit' || s === 'results' || STEPS.some((x) => x.key === s));

// ── Types ──

export type WDriver = {
  key: string; id: string | null; primary: boolean;
  first_name: string; last_name: string; dob: string; gender: string; marital_status: string; relationship: string;
  ssn_last4: string; industry: string; occupation: string; dl_status: string; age_licensed: string; dl_number: string; dl_state: string;
  rated: 'Rated' | 'Excluded' | 'Never Licensed'; defensive_date: string; license_sus: string; sr22: string; fr44: string;
  good_student: string; student_away: string; driver_ed: string; mature_driver: string; good_driver: string;
};

export type WVehicle = {
  key: string; id: string | null;
  vin: string; year: string; make: string; model: string; sub_model: string; purchase_date: string;
  passive: string; abs: string; drl: string; cost_new: string; anti_theft: string; use: string;
  miles_one_way: string; days_week: string; weeks_month: string; annual_miles: string; odometer: string; performance: string;
  mods_value: string; was_new: string; ownership: string; car_pool: string; telematics: string; tnc: string;
  prior_damage: boolean; alternate_garage: boolean; used_delivery: boolean;
  /** driver key → percent of use */
  assignment: Record<string, string>;
};

export type IncidentKind = 'accidents' | 'violations' | 'comp_losses';
export type Incident = { key: string; driver_key: string; vehicle_key: string; date: string; type: string; amount: string; at_fault: boolean; description: string };

export type VehicleCoverage = { comp: string; coll: string; towing: string; rental: string; stated: string; loan_lease: boolean; liability_not_required: boolean; full_glass: boolean };

export type Workflow = {
  v: 1;
  rating: { state: string; template_id: string; description: string; carrier_prefill: boolean; carriers: string[] };
  policy: {
    prior_carrier: string; prior_exp: string; prior_limits: string; prior_term: string; prior_premium: string;
    years_prior: string; months_prior: string; years_cont: string; months_cont: string;
    credit_auth: string; new_term: string; package: string; effective: string;
  };
  drivers: WDriver[];
  vehicles: WVehicle[];
  alt_garage: { address: string; city: string; state: string; zip: string } | null;
  incidents: Record<IncidentKind, Incident[]>;
  coverage: {
    bi: string; um: string; uim: string; pd: string; medpay: string; umpd: string; pip: string; adi: string;
    residence: string; multipolicy: boolean; retirement: boolean; aaa: boolean; company_car: boolean; apply_all: boolean;
    vehicles: Record<string, VehicleCoverage>;
  };
  /** `${carrier}|${question}|${subject}` → answer */
  answers: Record<string, string>;
  /** answer keys filled by Carrier Answers Prefill (hidden by "Hide Prefilled Answers") */
  prefilled: string[];
  /** steps the user has opened (drives the step icons) */
  visited: StepKey[];
  submitted_at?: string;
  alt_results?: import('@/lib/types').CarrierRate[];
};

// ── Reference lists ──

export const YES_NO = ['Yes', 'No'];
export const TERMS = ['6 Month', '12 Month'];
export const PRIOR_LIMITS = ['State Minimum', '25/50', '30/60', '50/100', '100/300', '250/500', '500/500'];
export const NO_PRIOR = 'No Prior Insurance';
export const OTHER_PRIORS = ['Other Standard Carrier', 'Other Non-Standard Carrier', NO_PRIOR];
export const YEARS = Array.from({ length: 11 }, (_, i) => (i === 10 ? '10+' : String(i)));
export const MONTHS = Array.from({ length: 12 }, (_, i) => String(i));
export const DL_STATUS = ['Valid', 'Permit', 'Suspended', 'Revoked', 'Expired', 'Foreign', 'International'];
export const RELATIONSHIPS = ['Insured', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other Relative', 'Other'];
export const GENDERS = ['Male', 'Female', 'Not specified'];
export const MARITAL = ['Single', 'Married', 'Domestic Partner', 'Divorced', 'Separated', 'Widowed'];
export const RATED = ['Rated', 'Excluded', 'Never Licensed'];
export const AGES_LICENSED = Array.from({ length: 70 }, (_, i) => String(i + 14));
export const INDUSTRIES: Record<string, string[]> = {
  'Arts/Entertainment': ['Actor', 'Artist', 'Musician', 'Designer', 'Other'],
  'Education': ['Teacher', 'Professor', 'Administrator', 'Student', 'Other'],
  'Engineering/Architecture': ['Engineer', 'Architect', 'Technician', 'Other'],
  'Financial/Insurance': ['Accountant', 'Agent/Broker', 'Banker', 'Underwriter', 'Other'],
  'Government/Military': ['Officer - Enlisted', 'Officer - Commissioned', 'Civil Servant', 'Other'],
  'Healthcare': ['Nurse', 'Physician', 'Pharmacist', 'Technician', 'Other'],
  'Homemaker/Retired/Unemployed': ['Homemaker', 'Retired', 'Unemployed', 'Disabled'],
  'Legal/Law Enforcement': ['Attorney', 'Paralegal', 'Police Officer', 'Other'],
  'Manufacturing/Construction': ['Laborer', 'Foreman', 'Electrician', 'Plumber', 'Other'],
  'Sales/Marketing': ['Sales Representative', 'Manager', 'Marketing Specialist', 'Other'],
  'Sports/Recreation': ['Athlete', 'Coach', 'Trainer', 'Other'],
  'Technology': ['Software Developer', 'IT Specialist', 'Analyst', 'Other'],
  'Transportation': ['Driver', 'Pilot', 'Dispatcher', 'Other'],
};
export const PASSIVE = ['Airbag Both Sides', 'Airbag Driver Side', 'Automatic Seatbelts', 'None'];
export const ANTI_THEFT = ['None', 'Alarm Only', 'Active Disabling', 'Passive Disabling', 'VIN Etching', 'Tracking Device'];
export const VEHICLE_USE = ['Pleasure', 'To/From Work', 'To/From School', 'Business', 'Farm'];
export const PERFORMANCE = ['Standard', 'Intermediate', 'High Performance', 'Sports', 'Super Car'];
export const OWNERSHIP = ['Owned', 'Financed', 'Leased'];
export const DAYS_WEEK = ['1', '2', '3', '4', '5', '6', '7'];
export const WEEKS_MONTH = ['1', '2', '3', '4', '5'];
export const MAKES = ['Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Rivian', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'];
export const vehicleYears = () => Array.from({ length: 46 }, (_, i) => String(new Date().getFullYear() + 1 - i));

export const ACCIDENT_TYPES = ['At-fault collision', 'Not-at-fault collision', 'Hit while parked', 'Single-vehicle accident', 'Hit and run (not at fault)'];
export const VIOLATION_TYPES = ['Speeding 1-10 over', 'Speeding 11-20 over', 'Speeding 21+ over', 'Running red light / stop sign', 'Failure to yield', 'Improper lane change', 'Texting / handheld device', 'Reckless driving', 'DUI / DWI', 'Driving without insurance', 'Other minor violation'];
export const COMP_TYPES = ['Glass', 'Theft', 'Vandalism', 'Hail / Weather', 'Animal collision', 'Fire', 'Other'];

export const BI_OPTIONS = ['30/60', '50/100', '100/300', '250/500'];
export const UM_OPTIONS = ['No Coverage', ...BI_OPTIONS];
export const PD_OPTIONS = ['25000', '50000', '100000', '250000'];
export const MEDPAY_OPTIONS = ['No Coverage', '1000', '5000', '10000'];
export const UMPD_OPTIONS = ['No Coverage', '25000', '50000', '100000'];
export const PIP_OPTIONS = ['No Coverage', '2500', '5000', '10000'];
export const ADI_OPTIONS = ['No Coverage', '5000', '10000'];
export const RESIDENCE = ['Home (owned)', 'Condo (owned)', 'Mobile home (owned)', 'Apartment', 'Rental home', 'With parents', 'Other'];
export const COMP_DED = ['No Coverage', '100', '250', '500', '1000', '2500'];
export const COLL_DED = ['No Coverage', '250', '500', '1000', '2500'];
export const TOWING = ['No Coverage', '50', '75', '100'];
export const RENTAL = ['No Coverage', '30/900', '40/1200', '50/1500'];

// ── Carrier questions ──

export type CarrierQuestion = {
  id: string; label: string; options: string[]; required?: boolean;
  /** where it is asked; subject = per driver / per vehicle / once per quote */
  step: 'policy' | 'drivers' | 'incidents' | 'coverage' | 'carrier'; per: 'quote' | 'driver' | 'vehicle';
  /** answer used by Carrier Answers Prefill */
  prefill?: string;
  help: string;
};

const Q: Record<string, CarrierQuestion> = {
  paperless: { id: 'paperless', label: 'Paperless', options: YES_NO, step: 'policy', per: 'quote', prefill: 'Yes', help: 'Customer agrees to receive policy documents electronically.' },
  residents: { id: 'residents', label: 'Total number of residents living in the home including listed drivers, excluded drivers, children and roommates', options: ['1', '2', '3', '4', '5', '6', '7', '8+'], required: true, step: 'policy', per: 'quote', help: 'Used to confirm all household drivers are listed.' },
  telematics_discount: { id: 'telematics_discount', label: 'Driver telematics / usage-based discount', options: YES_NO, step: 'drivers', per: 'driver', prefill: 'Yes', help: 'Driver agrees to a usage-based driving program.' },
  license_type: { id: 'license_type', label: 'Driver License Type', options: ['Operator - Personal Auto', 'Commercial (CDL)', 'Chauffeur', 'Learner Permit'], step: 'drivers', per: 'driver', prefill: 'Operator - Personal Auto', help: 'Class of license held by the driver.' },
  pip_claims: { id: 'pip_claims', label: 'How many injury claims (PIP) were made within the last 3 years on insurance policies where any of the drivers listed on this quote were insured?', options: ['0', '1', '2', '3+'], step: 'incidents', per: 'quote', prefill: '0', help: 'Personal injury protection claims by any listed driver.' },
  branded_title: { id: 'branded_title', label: 'Has this vehicle ever had a branded title (salvage, dismantled, flood, junk, manufacturer buyback, rebuilt, reconstructed as examples)?', options: YES_NO, step: 'coverage', per: 'vehicle', prefill: 'No', help: 'Branded-title vehicles are not eligible for physical damage coverage with this carrier.' },
  other_policy: { id: 'other_policy', label: 'Other policy with this carrier', options: ['None', 'Homeowners Policy', 'Renters Policy', 'Condo Policy', 'Life Policy', 'Umbrella Policy'], step: 'carrier', per: 'quote', prefill: 'None', help: 'An existing policy with the carrier may qualify for a multi-policy discount.' },
  education: { id: 'education', label: 'Education Level for the driver', options: ['High School or less', 'Some College', 'Associate Degree', "Bachelor's Degree", "Master's Degree", 'Doctorate'], required: true, step: 'carrier', per: 'driver', help: 'Education level is a rating factor for this carrier.' },
  owned_duration: { id: 'owned_duration', label: 'How long have you had the vehicle', options: ['Less than 1 year', '1-2 years', '3-5 years', 'More than 5 years'], required: true, step: 'carrier', per: 'vehicle', help: 'Length of ownership for each vehicle.' },
  rideshare: { id: 'rideshare', label: 'I also use this vehicle for ridesharing, delivery, or rental (peer-to-peer car sharing, food or package delivery, etc.)', options: ['No', 'Yes - Ridesharing', 'Yes - Delivery', 'Yes - Peer-to-peer rental'], step: 'carrier', per: 'quote', prefill: 'No', help: 'Commercial use of a personal vehicle is surcharged.' },
  eft_discount: { id: 'eft_discount', label: 'Apply the EFT discount to Full Pay Premium?', options: YES_NO, step: 'carrier', per: 'quote', prefill: 'Yes', help: 'Electronic funds transfer discount.' },
  telematics_enroll: { id: 'telematics_enroll', label: 'Enroll all eligible drivers in the telematics program', options: YES_NO, required: true, step: 'carrier', per: 'quote', help: 'Enrollment earns an initial participation discount.' },
};

/** Question set each auto carrier asks, assigned by the carrier's position among the agency's auto carriers. */
const SETS: string[][] = [
  ['paperless', 'telematics_discount', 'other_policy', 'education'],
  ['paperless', 'residents', 'license_type', 'pip_claims', 'owned_duration'],
  ['paperless', 'branded_title', 'rideshare'],
  ['paperless', 'eft_discount', 'telematics_enroll'],
];

export function questionsFor(carrier: string, autoCarriers: string[]): CarrierQuestion[] {
  const i = Math.max(0, [...autoCarriers].sort().indexOf(carrier));
  return SETS[i % SETS.length].map((id) => Q[id]);
}

export const answerKey = (carrier: string, q: string, subject = '') => `${carrier}|${q}|${subject}`;

/** Questions to render for a step: one row per question, grouped by carrier (shared questions merged as "Multiple"). */
export function stepQuestions(step: CarrierQuestion['step'], carriers: string[], autoCarriers: string[]) {
  const byQ = new Map<string, { q: CarrierQuestion; carriers: string[] }>();
  for (const c of carriers) for (const q of questionsFor(c, autoCarriers)) {
    if (q.step !== step) continue;
    const e = byQ.get(q.id) ?? { q, carriers: [] };
    e.carriers.push(c);
    byQ.set(q.id, e);
  }
  return [...byQ.values()];
}

// ── Defaults & prefill ──

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function blankDriver(primary = false): WDriver {
  return {
    key: uuid(), id: null, primary, first_name: '', last_name: '', dob: '', gender: '', marital_status: '', relationship: primary ? 'Insured' : '',
    ssn_last4: '', industry: '', occupation: '', dl_status: 'Valid', age_licensed: '16', dl_number: '', dl_state: '', rated: 'Rated', defensive_date: '',
    license_sus: 'No', sr22: 'No', fr44: 'No', good_student: '', student_away: '', driver_ed: '', mature_driver: '', good_driver: '',
  };
}

export function blankVehicle(drivers: WDriver[]): WVehicle {
  const rated = drivers.filter((d) => d.rated === 'Rated');
  return {
    key: uuid(), id: null, vin: '', year: '', make: '', model: '', sub_model: '', purchase_date: '', passive: '', abs: '', drl: '', cost_new: '',
    anti_theft: '', use: '', miles_one_way: '', days_week: '5', weeks_month: '4', annual_miles: '0', odometer: '0', performance: '', mods_value: '0',
    was_new: '', ownership: '', car_pool: '', telematics: 'No', tnc: 'No', prior_damage: false, alternate_garage: false, used_delivery: false,
    assignment: Object.fromEntries(rated.map((d, i) => [d.key, i === 0 ? '100' : '0'])),
  };
}

export const blankVehicleCoverage = (): VehicleCoverage => ({ comp: '500', coll: '500', towing: 'No Coverage', rental: 'No Coverage', stated: '', loan_lease: false, liability_not_required: false, full_glass: false });

function driverFrom(d: Driver, primary: boolean, account: Account | null): WDriver {
  return {
    ...blankDriver(primary), id: d.id, first_name: d.first_name, last_name: d.last_name, dob: s(d.dob), gender: s(d.gender), marital_status: s(d.marital_status),
    relationship: primary ? 'Insured' : s(d.relationship) || 'Other', dl_number: s(d.license_number), dl_state: s(d.license_state) || s(account?.state),
    ssn_last4: primary ? s(account?.ssn_last4) : '', industry: primary ? s(account?.industry) : '', occupation: primary ? s(account?.occupation) : '',
  };
}

function vehicleFrom(v: Vehicle, drivers: WDriver[]): WVehicle {
  const use = v.usage === 'Commute' ? 'To/From Work' : v.usage === 'Business' ? 'Business' : v.usage ? 'Pleasure' : '';
  return {
    ...blankVehicle(drivers), id: v.id, vin: s(v.vin), year: s(v.year), make: v.make, model: v.model, use,
    annual_miles: s(v.annual_miles ?? 0), ownership: s(v.ownership), cost_new: String(estimateVehicleValue(v.year, v.make)),
  };
}

/** New workflow prefilled from the applicant record. Household drivers/vehicles come in via "Prefill". */
export function newWorkflow(account: Account | null, carriers: string[], preferAll: boolean): Workflow {
  const primary = blankDriver(true);
  if (account) Object.assign(primary, {
    first_name: account.first_name, last_name: account.last_name, dob: s(account.dob), gender: s(account.gender), marital_status: s(account.marital_status),
    ssn_last4: s(account.ssn_last4), dl_number: s(account.dl_number), dl_state: s(account.dl_state) || s(account.state), dl_status: s(account.dl_status) || 'Valid',
    industry: INDUSTRIES[s(account.industry)] ? s(account.industry) : '', occupation: s(account.occupation),
  });
  const drivers = [primary];
  return {
    v: 1,
    rating: { state: s(account?.state) || 'TX', template_id: '', description: '', carrier_prefill: false, carriers: preferAll ? carriers : [] },
    policy: {
      prior_carrier: '', prior_exp: '', prior_limits: '', prior_term: '', prior_premium: '', years_prior: '', months_prior: '', years_cont: '', months_cont: '',
      credit_auth: '', new_term: '', package: '', effective: '',
    },
    drivers,
    vehicles: [blankVehicle(drivers)],
    alt_garage: null,
    incidents: { accidents: [], violations: [], comp_losses: [] },
    coverage: {
      bi: '50/100', um: '50/100', uim: '50/100', pd: '50000', medpay: '5000', umpd: '50000', pip: 'No Coverage', adi: 'No Coverage',
      residence: '', multipolicy: false, retirement: false, aaa: false, company_car: false, apply_all: false, vehicles: {},
    },
    answers: {}, prefilled: [], visited: ['rating'],
  };
}

/** Household drivers from the applicant record ("Prefill drivers"): adds anyone not already on the quote. */
export function prefillDrivers(w: Workflow, rows: Driver[], account: Account | null): { drivers: WDriver[]; added: number } {
  const has = (d: Driver) => w.drivers.some((x) => x.id === d.id || (x.first_name.trim().toLowerCase() === d.first_name.trim().toLowerCase() && x.last_name.trim().toLowerCase() === d.last_name.trim().toLowerCase()));
  const fresh = rows.filter((d) => !has(d));
  // The applicant's own driver row fills the primary insured instead of duplicating it.
  const drivers = w.drivers.map((x) => {
    if (!x.primary || x.id) return x;
    const match = rows.find((d) => d.relationship === 'Insured' || (d.first_name === x.first_name && d.last_name === x.last_name));
    return match ? { ...driverFrom(match, true, account), key: x.key, ssn_last4: x.ssn_last4 || s(account?.ssn_last4), industry: x.industry, occupation: x.occupation } : x;
  });
  const added = fresh.filter((d) => !drivers.some((x) => x.id === d.id)).map((d) => driverFrom(d, false, account));
  return { drivers: [...drivers, ...added], added: added.length };
}

export function prefillVehicles(w: Workflow, rows: Vehicle[]): { vehicles: WVehicle[]; added: number } {
  const fresh = rows.filter((v) => !w.vehicles.some((x) => x.id === v.id || (v.vin && x.vin.toUpperCase() === v.vin.toUpperCase())));
  // Replace a still-empty first vehicle instead of leaving a blank card on top.
  const keep = w.vehicles.filter((x) => x.id || x.vin || x.make || x.year);
  const added = fresh.map((v) => vehicleFrom(v, w.drivers));
  return { vehicles: [...keep, ...added].length ? [...keep, ...added] : w.vehicles, added: added.length };
}

/** Annual miles from a commute: one-way × 2 × days × weeks × 12, plus 5,000 pleasure miles. */
export function commuteMiles(v: WVehicle) {
  const n = (x: string) => Number(x) || 0;
  return Math.round(n(v.miles_one_way) * 2 * n(v.days_week) * n(v.weeks_month) * 12 + 5000);
}
export const isCommute = (use: string) => use === 'To/From Work' || use === 'To/From School';

// ── Validation ──

export type Issue = { step: StepKey; field: string; label: string; message: string };

const ageOf = (dob: string) => age(dob) ?? null;
export const youthful = (d: WDriver) => { const a = ageOf(d.dob); return a !== null && a < 25; };
export const mature = (d: WDriver) => { const a = ageOf(d.dob); return a !== null && a >= 55; };
export const driverName = (d: WDriver) => [d.first_name, d.last_name].filter(Boolean).join(' ') || 'New driver';
export const vehicleName = (v: WVehicle, i: number) => [v.year, v.make, v.model, v.sub_model].filter(Boolean).join(' ').toUpperCase() || `Vehicle ${i + 1}`;

export function validate(w: Workflow, autoCarriers: string[]): Issue[] {
  const out: Issue[] = [];
  const req = (step: StepKey, field: string, label: string, value: unknown, message = `${label} is required for rating`) => {
    if (value === '' || value === null || value === undefined) out.push({ step, field, label, message });
  };

  // Rating
  if (!w.rating.carriers.length) out.push({ step: 'rating', field: 'carriers', label: 'Carriers', message: 'You must select at least one carrier.' });
  req('rating', 'rating.state', 'Rating State', w.rating.state);

  // Policy info
  const p = w.policy;
  const noPrior = p.prior_carrier === NO_PRIOR;
  req('policy', 'policy.prior_carrier', 'Prior Carrier', p.prior_carrier);
  if (!noPrior) {
    req('policy', 'policy.prior_exp', 'Prior Policy Expiration Date', p.prior_exp, 'Prior policy expiration date is required for rating');
    req('policy', 'policy.prior_limits', 'Prior Liability Limits', p.prior_limits);
    req('policy', 'policy.prior_term', 'Prior Policy Term', p.prior_term);
    req('policy', 'policy.years_prior', 'Years with Prior Carrier', p.years_prior);
    req('policy', 'policy.months_prior', 'Months', p.months_prior, 'Months is required for rating');
    req('policy', 'policy.years_cont', 'Years with Continuous Coverage', p.years_cont);
    req('policy', 'policy.months_cont', 'Months', p.months_cont, 'Months is required for rating');
    if (p.prior_premium && !(Number(p.prior_premium) >= 0)) out.push({ step: 'policy', field: 'policy.prior_premium', label: 'Prior Policy Premium', message: 'Enter a dollar amount' });
  }
  req('policy', 'policy.credit_auth', 'Credit Check and Other Underwriting Reports Authorized', p.credit_auth, 'This is required for rating');
  req('policy', 'policy.new_term', 'New Policy Term', p.new_term);
  req('policy', 'policy.package', 'Quote as Package', p.package, 'Package is required for rating');
  req('policy', 'policy.effective', 'Effective Date (New Policy)', p.effective, 'Effective Date is required for rating');
  if (p.effective && p.effective < today()) out.push({ step: 'policy', field: 'policy.effective', label: 'Effective Date (New Policy)', message: 'Effective date cannot be in the past' });
  if (p.effective && p.effective > addDays(today(), 90)) out.push({ step: 'policy', field: 'policy.effective', label: 'Effective Date (New Policy)', message: 'Effective date must be within 90 days' });

  // Drivers
  if (!w.drivers.some((d) => d.rated === 'Rated')) out.push({ step: 'drivers', field: 'drivers', label: 'Drivers', message: 'At least one rated driver is required' });
  w.drivers.forEach((d) => {
    const f = (k: string) => `driver.${d.key}.${k}`;
    const who = driverName(d);
    for (const [k, label] of [['first_name', 'First Name'], ['last_name', 'Last Name'], ['dob', 'DOB'], ['gender', 'Gender'], ['marital_status', 'Marital Status'], ['relationship', 'Relationship']] as const) {
      req('drivers', f(k), `${who}: ${label}`, d[k], `${label} is required`);
    }
    if (d.dob) {
      const a = ageOf(d.dob);
      if (a === null || a < 14 || a > 110) out.push({ step: 'drivers', field: f('dob'), label: `${who}: DOB`, message: 'Enter a valid date of birth' });
    }
    if (d.rated === 'Rated') {
      req('drivers', f('industry'), `${who}: Occupation Industry`, d.industry, 'Occupation Industry is required');
      req('drivers', f('occupation'), `${who}: Occupation Title`, d.occupation, 'Occupation Title is required');
      req('drivers', f('dl_status'), `${who}: DL Status`, d.dl_status, 'DL Status is required');
      req('drivers', f('age_licensed'), `${who}: Age Licensed`, d.age_licensed, 'Age Licensed is required');
      req('drivers', f('dl_state'), `${who}: DL State`, d.dl_state, 'DL State is required');
      req('drivers', f('license_sus'), `${who}: License Sus/Rev`, d.license_sus, 'Required');
      const a = ageOf(d.dob);
      if (a !== null && Number(d.age_licensed) > a) out.push({ step: 'drivers', field: f('age_licensed'), label: `${who}: Age Licensed`, message: 'Age licensed cannot be greater than current age' });
    }
  });

  // Vehicles
  if (!w.vehicles.length) out.push({ step: 'vehicles', field: 'vehicles', label: 'Vehicles', message: 'At least one vehicle is required' });
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  w.vehicles.forEach((v, i) => {
    const f = (k: string) => `vehicle.${v.key}.${k}`;
    const who = `Vehicle ${i + 1}`;
    req('vehicles', f('vin'), `${who}: VIN`, v.vin, 'VIN is required for rating');
    if (v.vin && !validVin(v.vin)) out.push({ step: 'vehicles', field: f('vin'), label: `${who}: VIN`, message: 'VIN must be 17 characters (no I, O or Q)' });
    req('vehicles', f('year'), `${who}: Year`, v.year, 'Year is required for rating');
    req('vehicles', f('make'), `${who}: Make`, v.make, 'Make is required for rating');
    req('vehicles', f('model'), `${who}: Model`, v.model, 'Model is required for rating');
    req('vehicles', f('purchase_date'), `${who}: Purchase Date`, v.purchase_date, 'Vehicle Purchase Date is required for rating.');
    req('vehicles', f('use'), `${who}: Vehicle Use`, v.use, 'Vehicle Use is required for rating');
    req('vehicles', f('ownership'), `${who}: Ownership Type`, v.ownership, 'Ownership Type is required for rating');
    if (isCommute(v.use)) {
      req('vehicles', f('miles_one_way'), `${who}: Miles One Way`, v.miles_one_way, 'Miles One Way is required');
      req('vehicles', f('days_week'), `${who}: Days/Week`, v.days_week, 'Required');
      req('vehicles', f('weeks_month'), `${who}: Weeks/Month`, v.weeks_month, 'Required');
    }
    if (!(Number(v.annual_miles) >= 1000)) out.push({ step: 'vehicles', field: f('annual_miles'), label: `${who}: Annual Miles`, message: 'Annual Miles can not be less than 1,000' });
    if (v.purchase_date && v.purchase_date > today()) out.push({ step: 'vehicles', field: f('purchase_date'), label: `${who}: Purchase Date`, message: 'Purchase date cannot be in the future' });
    if (v.alternate_garage && !w.alt_garage) out.push({ step: 'vehicles', field: f('alternate_garage'), label: `${who}: Alternate Garage`, message: 'Add the alternate garage address' });
    if (rated.length) {
      const total = rated.reduce((sum, d) => sum + (Number(v.assignment[d.key]) || 0), 0);
      if (total !== 100) out.push({ step: 'vehicles', field: f('assignment'), label: `${who}: Vehicle Assignment`, message: `Total use must equal 100% (currently ${total}%)` });
    }
  });
  if (w.alt_garage) {
    req('vehicles', 'alt_garage.address', 'Alternate garage: Address', w.alt_garage.address.trim(), 'Address is required');
    if (!/^\d{5}$/.test(w.alt_garage.zip)) out.push({ step: 'vehicles', field: 'alt_garage.zip', label: 'Alternate garage: ZIP', message: 'Enter a 5-digit ZIP' });
  }

  // Incidents
  (Object.keys(w.incidents) as IncidentKind[]).forEach((kind) => w.incidents[kind].forEach((x, i) => {
    const label = `${kind === 'comp_losses' ? 'Comp loss' : kind === 'accidents' ? 'Accident' : 'Violation'} ${i + 1}`;
    if (!x.date) out.push({ step: 'incidents', field: `incident.${x.key}`, label, message: 'Date is required' });
    if (kind !== 'comp_losses' && !w.drivers.some((d) => d.key === x.driver_key)) out.push({ step: 'incidents', field: `incident.${x.key}`, label, message: 'Choose the driver' });
  }));

  // Coverage
  const c = w.coverage;
  for (const [k, label] of [['bi', 'Bodily Injury'], ['um', 'Uninsured Motorist'], ['uim', 'Underinsured Motorist'], ['pd', 'Property Damage'], ['medpay', 'Medical Payments'], ['residence', 'Residence is']] as const) {
    req('coverage', `coverage.${k}`, label, c[k], `${label} is required`);
  }
  w.vehicles.forEach((v, i) => {
    const vc = c.vehicles[v.key] ?? blankVehicleCoverage();
    if (vc.coll !== 'No Coverage' && vc.comp === 'No Coverage') out.push({ step: 'coverage', field: `vcov.${v.key}.comp`, label: `Vehicle ${i + 1}: Comprehensive`, message: 'Collision requires comprehensive coverage' });
    if ((v.ownership === 'Financed' || v.ownership === 'Leased') && (vc.comp === 'No Coverage' || vc.coll === 'No Coverage')) out.push({ step: 'coverage', field: `vcov.${v.key}.coll`, label: `Vehicle ${i + 1}: Physical damage`, message: 'Financed/leased vehicles require comprehensive and collision' });
  });

  // Carrier questions (required ones for selected carriers, wherever they are asked)
  for (const carrier of w.rating.carriers) {
    for (const q of questionsFor(carrier, autoCarriers)) {
      if (!q.required) continue;
      const subjects = q.per === 'driver' ? rated.map((d) => [d.key, driverName(d)]) : q.per === 'vehicle' ? w.vehicles.map((v, i) => [v.key, vehicleName(v, i)]) : [['', '']];
      for (const [subj, name] of subjects) {
        if (!w.answers[answerKey(carrier, q.id, subj)]) {
          out.push({ step: q.step as StepKey, field: `answer.${answerKey(carrier, q.id, subj)}`, label: `${carrier}: ${q.label}${name ? ` (${name})` : ''}`, message: `Required for Carrier: ${carrier}` });
        }
      }
    }
  }
  return out;
}

/** Items that don't block submission but improve accuracy. */
export function accuracyItems(w: Workflow): { field: string; label: string; step: StepKey | 'ssn' }[] {
  const out: { field: string; label: string; step: StepKey | 'ssn' }[] = [];
  const primary = w.drivers.find((d) => d.primary);
  if (primary && !primary.ssn_last4) out.push({ field: 'ssn', label: 'Applicant SSN is empty.', step: 'ssn' });
  w.drivers.filter((d) => d.rated === 'Rated' && !d.dl_number).forEach((d) => out.push({ field: `driver.${d.key}.dl_number`, label: `${driverName(d)}: Driver license number is empty.`, step: 'drivers' }));
  w.vehicles.filter((v) => !v.cost_new).forEach((v, i) => out.push({ field: `vehicle.${v.key}.cost_new`, label: `${vehicleName(v, i)}: Cost new value is empty.`, step: 'vehicles' }));
  return out;
}

// ── VIN ──

const TRANSLIT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
export const validVin = (vin: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase());

/** North American check digit (position 9). Informational: some imports don't use it. */
export function vinCheckDigitOk(vin: string) {
  const v = vin.toUpperCase();
  if (!validVin(v)) return false;
  const sum = [...v].reduce((acc, ch, i) => acc + (/\d/.test(ch) ? Number(ch) : TRANSLIT[ch] ?? 0) * WEIGHTS[i], 0);
  const r = sum % 11;
  return v[8] === (r === 10 ? 'X' : String(r));
}

// ── Mapping to the rating engine ──

const num = (x: string, d = 0) => (Number.isFinite(Number(x)) && x !== '' ? Number(x) : d);
const within = (date: string, years: number) => !!date && date >= addDays(today(), -365 * years);

export function priorInsurance(w: Workflow): PriorInsurance {
  if (w.policy.prior_carrier === NO_PRIOR || !w.policy.prior_carrier) return 'None';
  const years = w.policy.years_cont === '10+' ? 10 : num(w.policy.years_cont) + num(w.policy.months_cont) / 12;
  return years < 1 ? 'Under 1 year' : years < 3 ? '1-3 years' : '3+ years';
}

/** Stated amount (when entered) replaces the vehicle's estimated value. */
const vcovStated = (c: VehicleCoverage) => (c.stated && Number(c.stated) > 0 ? Number(c.stated) : null);

export function toAutoInput(w: Workflow, zip: string, vehicleKeys?: string[], dedFrom?: string): AutoInput {
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  const vehicles = w.vehicles.filter((v) => !vehicleKeys || vehicleKeys.includes(v.key));
  const cov = (key: string) => w.coverage.vehicles[key] ?? blankVehicleCoverage();
  const ref = cov(dedFrom ?? vehicles[0]?.key ?? '');
  const ded = (x: string) => (x === 'No Coverage' ? 0 : num(x));
  return {
    state: w.rating.state,
    drivers: rated.map((d) => {
      const mine = <T extends Incident>(list: T[]) => list.filter((x) => x.driver_key === d.key);
      const violations = mine(w.incidents.violations).filter((x) => within(x.date, 3)).reduce((n, x) => n + (/DUI|Reckless/.test(x.type) ? 3 : 1), 0);
      const accidents = mine(w.incidents.accidents).filter((x) => x.at_fault && within(x.date, 5)).length;
      return {
        key: d.key, id: d.id, first_name: d.first_name, last_name: d.last_name, dob: d.dob, gender: d.gender, marital_status: d.marital_status, relationship: d.relationship,
        license_number: d.dl_number, license_state: d.dl_state, violations, accidents, good_student: youthful(d) && d.good_student === 'Yes',
      };
    }),
    vehicles: vehicles.map((v) => ({
      key: v.key, id: v.id, year: num(v.year, new Date().getFullYear()), make: v.make, model: v.model, vin: v.vin,
      usage: isCommute(v.use) ? 'Commute' : v.use === 'Business' ? 'Business' : 'Pleasure',
      annual_miles: num(v.annual_miles), ownership: v.ownership, garaging_zip: v.alternate_garage && w.alt_garage ? w.alt_garage.zip : zip,
      rental: cov(v.key).rental !== 'No Coverage', towing: cov(v.key).towing !== 'No Coverage',
      value: vcovStated(cov(v.key)) ?? (v.cost_new ? Math.max(2500, Math.round(num(v.cost_new) * Math.pow(0.86, Math.max(0, new Date().getFullYear() - num(v.year, new Date().getFullYear()))))) : estimateVehicleValue(num(v.year), v.make)),
    })),
    bi: w.coverage.bi, pd: num(w.coverage.pd, 50000), um: w.coverage.um !== 'No Coverage', um_limit: w.coverage.um !== 'No Coverage' ? w.coverage.um : undefined, medpay: w.coverage.medpay === 'No Coverage' ? 0 : num(w.coverage.medpay),
    comp_ded: ded(ref.comp), coll_ded: ded(ref.coll),
    rental: vehicles.some((v) => cov(v.key).rental !== 'No Coverage'), towing: vehicles.some((v) => cov(v.key).towing !== 'No Coverage'),
    homeowner: /owned/.test(w.coverage.residence), multi_policy: w.coverage.multipolicy, paid_in_full: false,
    prior_insurance: priorInsurance(w), term_months: w.policy.new_term === '12 Month' ? 12 : 6,
  };
}
