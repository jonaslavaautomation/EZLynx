import { db, uuid } from '@/lib/db';
import { buildAdminSample } from '@/modules/admin/sample';
import { buildCommSample } from '@/modules/comm/sample';
import { buildMarketplaceSample } from '@/modules/marketplace/sample';
import { buildPolicyMgmtSample } from '@/modules/policymgmt/sample';
import { buildReportsSample } from '@/modules/reports/sample';
import { buildSupportSample } from '@/modules/support/sample';
import { addDays, addMonths, today } from '@/lib/format';
import type {
  Account, Activity, Carrier, Claim, Coverage, DocumentRow, Driver, Invoice, LineOfBusiness, Message, Policy, PolicyTransaction,
  Property, Quote, Staff, TableName, Vehicle,
} from '@/lib/types';

/**
 * Generates a realistic demo book of business (dates relative to today) and inserts it.
 * Deterministic: the same seed always produces the same agency.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Sarah', 'James', 'Maria', 'David', 'Emily', 'Michael', 'Olivia', 'Daniel', 'Sophia', 'Robert', 'Ava', 'William', 'Isabella', 'Joseph', 'Mia', 'Thomas', 'Charlotte', 'Anthony', 'Amelia', 'Christopher', 'Harper', 'Matthew', 'Evelyn', 'Andrew', 'Abigail', 'Joshua', 'Ella', 'Ryan', 'Grace', 'Nathan'];
const LAST = ['Mitchell', 'Carter', 'Nguyen', 'Patel', 'Johnson', 'Garcia', 'Brooks', 'Reyes', 'Kim', 'Foster', 'Hughes', 'Ramirez', 'Coleman', 'Bennett', 'Sullivan', 'Price', 'Russell', 'Ortiz', 'Hayes', 'Myers', 'Ford', 'Gibson', 'Wallace', 'Palmer', 'Stone'];
const CITIES: [string, string, string][] = [['Austin', 'TX', '78704'], ['Dallas', 'TX', '75201'], ['Houston', 'TX', '77002'], ['San Antonio', 'TX', '78205'], ['Denver', 'CO', '80205'], ['Phoenix', 'AZ', '85004'], ['Tulsa', 'OK', '74103'], ['Plano', 'TX', '75024'], ['Round Rock', 'TX', '78664'], ['Boulder', 'CO', '80302']];
const STREETS = ['Oakwood Drive', 'Riverside Lane', 'Maple Street', 'Cedar Court', 'Hillcrest Road', 'Lakeview Blvd', 'Sunset Avenue', 'Pine Ridge Way', 'Willow Bend', 'Magnolia Trail'];
const BUSINESSES = ['Lone Star Landscaping LLC', 'Bluebonnet Bakery', 'Summit HVAC Services', 'Red River Logistics', 'Canyon Dental Group', 'Mesa Auto Repair', 'Cypress Creek Cafe', 'Pioneer Roofing Co.'];
const VEHICLES: [string, string][] = [['Toyota', 'Camry'], ['Honda', 'CR-V'], ['Ford', 'F-150'], ['Chevrolet', 'Silverado'], ['Tesla', 'Model 3'], ['Subaru', 'Outback'], ['Jeep', 'Grand Cherokee'], ['Hyundai', 'Tucson'], ['Nissan', 'Altima'], ['Kia', 'Telluride']];
const SOURCES = ['Referral', 'Website', 'Walk-in', 'Google Ads', 'Facebook', 'Existing Client', 'Cold Call'];

export const DEMO_CARRIERS: Omit<Carrier, 'id' | 'created_at'>[] = [
  { name: 'Summit Mutual', naic: '10421', lines: ['Personal Auto', 'Homeowners', 'Renters', 'Condo', 'Umbrella'], commission_rate: 12, phone: '(800) 555-0142', website: 'https://example.com/summit', appointed: true, downloads_enabled: true },
  { name: 'Harbor Point Insurance', naic: '22057', lines: ['Personal Auto', 'Motorcycle', 'Boat', 'Renters'], commission_rate: 10, phone: '(800) 555-0199', website: 'https://example.com/harborpoint', appointed: true, downloads_enabled: true },
  { name: 'Keystone Casualty', naic: '31988', lines: ['Personal Auto', 'Homeowners', 'Dwelling Fire', 'Umbrella'], commission_rate: 13, phone: '(800) 555-0110', website: 'https://example.com/keystone', appointed: true, downloads_enabled: true },
  { name: 'Prairie Shield', naic: '40116', lines: ['Homeowners', 'Condo', 'Dwelling Fire', 'Flood'], commission_rate: 15, phone: '(800) 555-0177', website: 'https://example.com/prairie', appointed: true, downloads_enabled: false },
  { name: 'Evergreen National', naic: '12733', lines: ['Personal Auto', 'Homeowners', 'Life', 'Umbrella'], commission_rate: 11, phone: '(800) 555-0135', website: 'https://example.com/evergreen', appointed: true, downloads_enabled: true },
  { name: 'Copperline Commercial', naic: '28890', lines: ['Commercial Auto', 'General Liability', 'BOP', 'Commercial Property'], commission_rate: 14, phone: '(800) 555-0163', website: 'https://example.com/copperline', appointed: true, downloads_enabled: true },
  { name: 'Frontier Workers Group', naic: '35561', lines: ['Workers Comp', 'General Liability'], commission_rate: 9, phone: '(800) 555-0128', website: 'https://example.com/frontier', appointed: true, downloads_enabled: false },
  { name: 'Bluewater Specialty', naic: '19044', lines: ['Boat', 'Flood', 'Commercial Property'], commission_rate: 12.5, phone: '(800) 555-0184', website: 'https://example.com/bluewater', appointed: true, downloads_enabled: false },
  { name: 'Northgate Assurance', naic: '44270', lines: ['Personal Auto', 'Homeowners', 'BOP'], commission_rate: 12, phone: '(800) 555-0151', website: 'https://example.com/northgate', appointed: false, downloads_enabled: false },
];

export const DEMO_STAFF: Omit<Staff, 'id' | 'created_at'>[] = [
  { name: 'Morgan Nash', email: 'morgan@northstar-agency.example', role: 'Agency Owner', active: true, color: '#684ec2', service_team: true, external: false, producer_code: null },
  { name: 'Priya Desai', email: 'priya@northstar-agency.example', role: 'Producer', active: true, color: '#0f8a7e', service_team: true, external: false, producer_code: null },
  { name: 'Luis Herrera', email: 'luis@northstar-agency.example', role: 'Producer', active: true, color: '#d9622b', service_team: true, external: false, producer_code: null },
  { name: 'Hannah Lee', email: 'hannah@northstar-agency.example', role: 'CSR', active: true, color: '#2f6fbd', service_team: true, external: false, producer_code: null },
  { name: 'Marcus Webb', email: 'marcus@northstar-agency.example', role: 'Account Manager', active: true, color: '#b23a6e', service_team: true, external: false, producer_code: null },
];

const COVERAGES: Partial<Record<LineOfBusiness, Coverage[]>> = {
  'Personal Auto': [
    { name: 'Bodily Injury', limit: '100/300' }, { name: 'Property Damage', limit: '100,000' }, { name: 'Uninsured Motorist', limit: '100/300' },
    { name: 'Medical Payments', limit: '5,000' }, { name: 'Comprehensive', limit: 'ACV', deductible: '500' }, { name: 'Collision', limit: 'ACV', deductible: '500' },
  ],
  Homeowners: [
    { name: 'Dwelling (A)', limit: '350,000', deductible: '1,000' }, { name: 'Other Structures (B)', limit: '35,000' }, { name: 'Personal Property (C)', limit: '175,000' },
    { name: 'Loss of Use (D)', limit: '70,000' }, { name: 'Personal Liability (E)', limit: '300,000' }, { name: 'Medical Payments (F)', limit: '5,000' },
  ],
  Renters: [{ name: 'Personal Property', limit: '30,000', deductible: '500' }, { name: 'Personal Liability', limit: '100,000' }],
  Umbrella: [{ name: 'Personal Umbrella', limit: '1,000,000' }],
  'General Liability': [{ name: 'Each Occurrence', limit: '1,000,000' }, { name: 'General Aggregate', limit: '2,000,000' }, { name: 'Products/Completed Ops', limit: '2,000,000' }],
  BOP: [{ name: 'Building', limit: '500,000', deductible: '2,500' }, { name: 'Business Personal Property', limit: '150,000' }, { name: 'Liability', limit: '1,000,000/2,000,000' }],
  'Commercial Auto': [{ name: 'Combined Single Limit', limit: '1,000,000' }, { name: 'Hired & Non-Owned', limit: 'Included' }],
  'Workers Comp': [{ name: 'Part One', limit: 'Statutory' }, { name: 'Employers Liability', limit: '500/500/500' }],
};

const BASE_PREMIUM: Partial<Record<LineOfBusiness, [number, number]>> = {
  'Personal Auto': [900, 2600], Homeowners: [1100, 3400], Renters: [140, 320], Condo: [380, 900], 'Dwelling Fire': [700, 1600], Umbrella: [220, 480],
  Motorcycle: [260, 900], Boat: [300, 1100], Flood: [450, 1800], Life: [360, 1500], 'Commercial Auto': [3200, 9800], 'General Liability': [1200, 5200],
  BOP: [1800, 6400], 'Workers Comp': [2400, 14000], 'Commercial Property': [2600, 9000],
};

export type SeedData = {
  staff: Staff[]; carriers: Carrier[]; accounts: Account[]; drivers: Driver[]; vehicles: Vehicle[]; properties: Property[]; policies: Policy[];
  policy_transactions: PolicyTransaction[]; quotes: Quote[]; activities: Activity[]; claims: Claim[]; documents: DocumentRow[]; messages: Message[]; invoices: Invoice[];
};

export function buildSeed(seed = 42): SeedData {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const int = (lo: number, hi: number) => Math.floor(lo + r() * (hi - lo + 1));
  const t = today();
  const ts = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000 - int(0, 36000) * 1000).toISOString();
  const base = () => ({ id: uuid() });

  const staff = DEMO_STAFF.map((s, i) => ({ ...s, ...base(), created_at: ts(400 - i) })) as Staff[];
  const carriers = DEMO_CARRIERS.map((c) => ({ ...c, ...base(), created_at: ts(400) })) as Carrier[];
  const producers = staff.filter((s) => s.role === 'Producer' || s.role === 'Agency Owner').map((s) => s.name);
  const csrs = staff.filter((s) => s.role === 'CSR' || s.role === 'Account Manager').map((s) => s.name);

  const out: SeedData = { staff, carriers, accounts: [], drivers: [], vehicles: [], properties: [], policies: [], policy_transactions: [], quotes: [], activities: [], claims: [], documents: [], messages: [], invoices: [] };

  const carrierFor = (line: LineOfBusiness) => pick(carriers.filter((c) => c.appointed && c.lines.includes(line)));

  const makePolicy = (a: Account, line: LineOfBusiness, status: Policy['status'], expiresInDays: number) => {
    const c = carrierFor(line);
    const term = line === 'Personal Auto' && r() < 0.5 ? 6 : 12;
    const expiration = addDays(t, expiresInDays);
    const effective = addMonths(expiration, -term);
    const [lo, hi] = BASE_PREMIUM[line] ?? [500, 2000];
    const premium = Math.round((lo + r() * (hi - lo)) * (term === 6 ? 0.52 : 1));
    const p: Policy = {
      ...base(), created_at: ts(Math.max(1, -expiresInDays + term * 30)), account_id: a.id,
      policy_number: `${line.slice(0, 2).toUpperCase()}-${int(1000000, 9999999)}`, carrier: c.name, line_of_business: line, status,
      effective_date: effective, expiration_date: expiration, term_months: term, premium, commission_rate: c.commission_rate,
      billing_type: r() < 0.8 ? 'Direct Bill' : 'Agency Bill', payment_plan: pick(['Paid in Full', 'Monthly', 'Quarterly', 'Semi-Annual']),
      source: c.downloads_enabled ? 'Download' : 'Manual', producer: a.producer, coverages: COVERAGES[line] ?? [], notes: null, rewritten_from_policy_id: null,
    };
    out.policies.push(p);
    out.policy_transactions.push({ ...base(), created_at: p.created_at, policy_id: p.id, account_id: a.id, type: r() < 0.6 ? 'Renewal' : 'New Business', effective_date: effective, premium_change: premium, description: `${line} term ${effective} – ${expiration}` });
    if (r() < 0.3) out.policy_transactions.push({ ...base(), created_at: ts(int(5, 90)), policy_id: p.id, account_id: a.id, type: 'Endorsement', effective_date: addDays(effective, int(20, 120)), premium_change: int(-120, 240), description: pick(['Added vehicle', 'Changed deductible', 'Added lienholder', 'Address change', 'Removed driver']) });
    if (status === 'Cancelled') out.policy_transactions.push({ ...base(), created_at: ts(int(2, 40)), policy_id: p.id, account_id: a.id, type: 'Cancellation', effective_date: addDays(t, -int(2, 40)), premium_change: -Math.round(premium * 0.4), description: pick(['Insured request', 'Non-payment', 'Moved out of state']) });
    if (p.billing_type === 'Agency Bill') {
      const paid = r() < 0.6;
      out.invoices.push({ ...base(), created_at: p.created_at, account_id: a.id, policy_id: p.id, invoice_number: `INV-${int(10000, 99999)}`, description: `${line} premium — ${p.policy_number}`, amount: premium, amount_paid: paid ? premium : 0, due_date: effective, status: paid ? 'Paid' : 'Unpaid', paid_date: paid ? addDays(effective, int(0, 10)) : null, payment_method: paid ? pick(['Check', 'ACH', 'Credit Card']) : null });
    }
    return p;
  };

  const N = 42;
  for (let i = 0; i < N; i++) {
    const commercial = i % 6 === 5;
    const first = FIRST[(i * 7) % FIRST.length], last = LAST[(i * 11) % LAST.length];
    const [city, state, zip] = pick(CITIES);
    const status: Account['status'] = i < 32 ? 'Active' : i < 37 ? 'Prospect' : i < 40 ? 'Pending' : 'Inactive';
    const a: Account = {
      ...base(), created_at: ts(int(20, 900)), first_name: first, last_name: last,
      email: `${first}.${last}${i}`.toLowerCase() + '@example.com', phone: `(512) 555-${String(1000 + i * 37).slice(-4)}`,
      address: `${int(100, 9999)} ${pick(STREETS)}`, city, state, zip, policy_type: commercial ? 'Commercial' : pick(['Auto', 'Home', 'Auto', 'Home + Auto']),
      status, account_type: commercial ? 'Commercial' : 'Personal', business_name: commercial ? BUSINESSES[Math.floor(i / 6) % BUSINESSES.length] : null,
      dob: commercial ? null : `${int(1955, 2001)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
      marital_status: commercial ? null : pick(['Married', 'Single', 'Married', 'Divorced']), occupation: commercial ? null : pick(['Engineer', 'Teacher', 'Nurse', 'Sales Manager', 'Retired', 'Accountant', 'Contractor']),
      mobile_phone: `(737) 555-${String(2000 + i * 53).slice(-4)}`, producer: pick(producers), csr: pick(csrs), lead_source: pick(SOURCES), notes: null, labels: [], customer_since: null, naics_code: null, sic_code: null, nature_of_business: null, naics_description: null, operations_description: null,
      prefix: null, middle_initial: null, suffix: null, maiden_name: null, nickname: null, gender: null, ssn_last4: null, dl_number: null, dl_status: null,
      dl_state: null, education: null, industry: null, occupation_years: null, prior_employer_years: null, account_name: null, preferred_language: 'English',
      vip: false, phones: [], emails: [], bridge_email: false, contact_method: null, contact_time: null,
    };
    out.accounts.push(a);

    if (!commercial) {
      out.drivers.push({ ...base(), created_at: a.created_at, account_id: a.id, first_name: first, last_name: last, dob: a.dob, gender: pick(['Male', 'Female']), marital_status: a.marital_status, relationship: 'Insured', license_number: `${int(10000000, 99999999)}`, license_state: state, violations: r() < 0.15 ? 1 : 0, accidents: r() < 0.1 ? 1 : 0 });
      if (a.marital_status === 'Married') out.drivers.push({ ...base(), created_at: a.created_at, account_id: a.id, first_name: pick(FIRST), last_name: last, dob: `${int(1958, 2000)}-0${int(1, 9)}-1${int(0, 9)}`, gender: pick(['Male', 'Female']), marital_status: 'Married', relationship: 'Spouse', license_number: `${int(10000000, 99999999)}`, license_state: state, violations: 0, accidents: r() < 0.1 ? 1 : 0 });
      const nVeh = int(1, 2);
      for (let v = 0; v < nVeh; v++) {
        const [make, model] = pick(VEHICLES);
        out.vehicles.push({ ...base(), created_at: a.created_at, account_id: a.id, year: int(2012, 2025), make, model, vin: Array.from({ length: 17 }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[int(0, 32)]).join(''), usage: pick(['Commute', 'Pleasure', 'Commute', 'Business']), annual_miles: int(6, 18) * 1000, ownership: pick(['Owned', 'Financed', 'Leased']), garaging_zip: zip });
      }
      if (a.policy_type !== 'Auto') out.properties.push({ ...base(), created_at: a.created_at, account_id: a.id, address: a.address!, city, state, zip, year_built: int(1965, 2022), square_feet: int(12, 42) * 100, construction: pick(['Frame', 'Masonry', 'Brick Veneer', 'Stucco']), roof_type: pick(['Composition Shingle', 'Metal', 'Tile', 'Architectural Shingle']), roof_year: int(2008, 2024), protection_class: int(1, 6), dwelling_value: int(22, 70) * 10000 });
    }

    if (status === 'Prospect') continue;
    const policyStatus: Policy['status'] = status === 'Inactive' ? pick(['Cancelled', 'Expired', 'Non-Renewed'] as const) : status === 'Pending' ? 'Pending' : 'Active';
    const lines: LineOfBusiness[] = commercial
      ? ['General Liability', ...(r() < 0.6 ? ['BOP' as const] : []), ...(r() < 0.5 ? ['Commercial Auto' as const] : []), ...(r() < 0.4 ? ['Workers Comp' as const] : [])]
      : [...(a.policy_type !== 'Home' ? ['Personal Auto' as const] : []), ...(a.policy_type !== 'Auto' ? ['Homeowners' as const] : []), ...(r() < 0.2 ? ['Umbrella' as const] : []), ...(r() < 0.1 ? ['Motorcycle' as const] : [])];
    const policies = lines.map((line, k) => makePolicy(a, line, policyStatus, policyStatus === 'Active' ? ((i * 17 + k * 29) % 320) - 5 : policyStatus === 'Pending' ? 360 : -int(10, 120)));

    // Activities
    const p0 = policies[0];
    if (p0 && policyStatus === 'Active') {
      const d = daysBetween(t, p0.expiration_date);
      if (d <= 60) out.activities.push({ ...base(), created_at: ts(3), account_id: a.id, policy_id: p0.id, type: 'Renewal Review', subject: `Renewal review — ${p0.line_of_business} ${p0.policy_number}`, description: 'Remarket if premium increase exceeds 10%.', due_date: addDays(p0.expiration_date, -21), priority: d < 21 ? 'High' : 'Normal', status: 'Open', assigned_to: a.csr, completed_at: null });
    }
    if (i % 3 === 0) out.activities.push({ ...base(), created_at: ts(int(1, 20)), account_id: a.id, policy_id: p0?.id ?? null, type: pick(['Call', 'Follow-up', 'Task', 'Email'] as const), subject: pick(['Call back about payment plan', 'Send proof of insurance', 'Collect signed application', 'Review coverage options', 'Update lienholder information', 'Cross-sell umbrella']), description: null, due_date: addDays(t, int(-4, 12)), priority: pick(['Low', 'Normal', 'Normal', 'High'] as const), status: pick(['Open', 'Open', 'In Progress'] as const), assigned_to: pick([a.csr, a.producer]), completed_at: null });
    out.activities.push({ ...base(), created_at: ts(int(20, 200)), account_id: a.id, policy_id: p0?.id ?? null, type: 'Note', subject: pick(['Discussed coverage with client', 'Client requested quote comparison', 'Welcome call completed', 'Verified mailing address']), description: null, due_date: null, priority: 'Normal', status: 'Completed', assigned_to: a.producer, completed_at: ts(int(20, 200)) });

    // Claims
    if (p0 && r() < 0.22) {
      const loss = addDays(t, -int(5, 200));
      const st = pick(['Open', 'Under Review', 'Paid', 'Closed'] as const);
      const reserve = int(8, 150) * 100;
      out.claims.push({ ...base(), created_at: ts(int(3, 200)), account_id: a.id, policy_id: p0.id, claim_number: `CLM-${int(100000, 999999)}`, date_of_loss: loss, reported_date: addDays(loss, int(0, 5)), loss_type: p0.line_of_business === 'Personal Auto' ? pick(['Collision', 'Comprehensive', 'Glass', 'Theft']) : pick(['Wind/Hail', 'Water Damage', 'Fire', 'Theft', 'Liability']), description: 'Reported by insured via phone.', status: st, amount_reserved: reserve, amount_paid: st === 'Paid' || st === 'Closed' ? Math.round(reserve * (0.6 + r() * 0.4)) : null, adjuster_name: `${pick(FIRST)} ${pick(LAST)}`, adjuster_phone: `(800) 555-${int(1000, 9999)}` });
    }

    // Documents & eSignature
    if (p0) {
      out.documents.push({ ...base(), created_at: p0.created_at, account_id: a.id, policy_id: p0.id, name: `${p0.policy_number} Declarations.pdf`, category: 'Declarations', mime_type: 'application/pdf', size_bytes: int(80, 900) * 1024, storage_path: null, data_url: null, esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null });
      const es = pick(['Completed', 'Completed', 'Completed', 'Pending', 'Expired', 'Declined', null] as const);
      if (es) {
        const sent = ts(es === 'Pending' ? int(0, 12) : es === 'Expired' ? int(35, 120) : int(1, 120));
        out.documents.push({ ...base(), created_at: sent, account_id: a.id, policy_id: p0.id, name: `${p0.line_of_business} Application.pdf`, category: 'Application', mime_type: 'application/pdf', size_bytes: int(120, 600) * 1024, storage_path: null, data_url: null, esign_status: es, esign_signer_email: a.email, esign_sent_at: sent, esign_completed_at: es === 'Completed' ? sent : null });
      }
    }

    // Text messages
    if (i % 2 === 0) {
      const when = int(0, 30);
      out.messages.push({ ...base(), created_at: ts(when + 1), account_id: a.id, channel: 'SMS', direction: 'Outbound', to_address: a.mobile_phone, subject: null, body: `Hi ${first}, this is ${a.csr} with Northstar Insurance. Your ${p0?.line_of_business ?? 'policy'} documents are ready — reply here with any questions!`, status: 'Delivered', read: true });
      if (i % 4 === 0) out.messages.push({ ...base(), created_at: ts(when), account_id: a.id, channel: 'SMS', direction: 'Inbound', to_address: a.mobile_phone, subject: null, body: pick(['Thanks! Can you send my ID cards?', 'Got it, thank you.', 'Can we talk about adding my son to the policy?', 'What would it cost to raise my deductible?']), status: 'Received', read: i % 8 !== 0 });
    }
  }

  // A few quotes for prospects
  out.accounts.filter((a) => a.status === 'Prospect').forEach((a, k) => {
    const line: LineOfBusiness = k % 2 ? 'Homeowners' : 'Personal Auto';
    const results = carriers.filter((c) => c.appointed && c.lines.includes(line)).map((c) => ({ carrier: c.name, premium: Math.round((BASE_PREMIUM[line]![0] + r() * 1400)), term_months: 12, status: 'Quoted' as const, coverages: COVERAGES[line] ?? [] }));
    out.quotes.push({ ...base(), created_at: ts(int(1, 14)), account_id: a.id, line_of_business: line, status: 'Rated', effective_date: addDays(t, int(5, 30)), input: {}, results, selected_carrier: null, selected_premium: null, policy_id: null });
    out.activities.push({ ...base(), created_at: ts(2), account_id: a.id, policy_id: null, type: 'Follow-up', subject: `Follow up on ${line} quote`, description: null, due_date: addDays(t, int(0, 6)), priority: 'High', status: 'Open', assigned_to: a.producer, completed_at: null });
  });

  return out;
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const SEED_ORDER: TableName[] = ['staff', 'carriers', 'accounts', 'drivers', 'vehicles', 'properties', 'policies', 'policy_transactions', 'quotes', 'activities', 'claims', 'documents', 'messages', 'invoices'];

type Base = Pick<SeedData, 'accounts' | 'policies' | 'claims' | 'staff' | 'carriers'>;

/** Sample rows for the Policy Mgmt, Communication Center and Reports 5.0 tables, built from the core book. */
function buildExtras(d: Base): Partial<Record<TableName, { id: string }[]>> {
  return {
    ...buildPolicyMgmtSample(d),
    ...buildCommSample(d),
    ...buildReportsSample(d),
    ...buildAdminSample(d),
    ...buildSupportSample(d),
    ...buildMarketplaceSample(d),
  };
}

// FK order for the extra tables.
const EXTRA_ORDER: TableName[] = [
  'claim_transactions', 'commission_rules', 'commission_statements', 'commission_statement_lines', 'recipient_lists', 'email_campaigns',
  'suppressions', 'message_templates', 'mail_items', 'esign_templates', 'saved_reports',
  'app_config', 'labels', 'lead_sources', 'automation_workflows', 'billing_companies', 'departments', 'carrier_rating_setup', 'form_templates',
  'proposal_templates', 'support_tickets', 'training_progress', 'training_registrations', 'integrations',
];

async function insertTables(order: TableName[], data: Partial<Record<TableName, { id: string }[]>>, onProgress?: (msg: string) => void) {
  for (const table of order) {
    const rows = data[table] ?? [];
    onProgress?.(`Loading ${table.replace(/_/g, ' ')}…`);
    for (let i = 0; i < rows.length; i += 200) await db.insertMany(table, rows.slice(i, i + 200) as never[], { silent: true });
  }
}

/** Inserts the demo agency. Settings row is created if missing. */
export async function loadSampleData(onProgress?: (msg: string) => void) {
  const data = buildSeed();
  await insertTables(SEED_ORDER, data as unknown as Partial<Record<TableName, { id: string }[]>>, onProgress);
  await insertTables(EXTRA_ORDER, buildExtras(data), onProgress);
  const existing = await db.list('agency_settings', { limit: 1 });
  if (!existing.length) await db.insertMany('agency_settings', [defaultSettings()], { silent: true });
  db.touchAll([...SEED_ORDER, ...EXTRA_ORDER, 'agency_settings']);
}

/**
 * Browser-storage agencies seeded before the Policy Mgmt / Communication Center / Reports 5.0 tables existed get
 * their sample rows once, built from the book already in the browser. Skips tables that already have rows.
 */
export async function topUpLocalSample() {
  const [accounts, policies, claims, staff, carriers] = await Promise.all([
    db.list('accounts'), db.list('policies'), db.list('claims'), db.list('staff'), db.list('carriers'),
  ]);
  if (!accounts.length || !staff.length) return;
  const empty = (await Promise.all(EXTRA_ORDER.map(async (t) => ((await db.list(t, { limit: 1 })).length ? null : t)))).filter((t): t is TableName => !!t);
  if (!empty.length) return;
  const extras = buildExtras({ accounts, policies, claims, staff, carriers });
  await insertTables(empty, extras);
  db.touchAll(empty);
}

export function defaultSettings() {
  return { name: 'Northstar Insurance Agency', address: '100 Congress Ave, Suite 400', city: 'Austin', state: 'TX', zip: '78701', phone: '(512) 555-0100', email: 'service@northstar-agency.example', license_number: 'TX-2419087', renewal_reminder_days: 60, current_user_name: DEMO_STAFF[0].name };
}

/** Minimal setup for a fresh agency: settings, one owner user and the carrier list — no clients. */
export async function startEmpty() {
  // Skip steps that already ran, so retrying after a failed attempt doesn't duplicate carriers/users.
  if (!(await db.list('carriers', { limit: 1 })).length) await db.insertMany('carriers', DEMO_CARRIERS, { silent: true });
  if (!(await db.list('staff', { limit: 1 })).length) await db.insertMany('staff', [DEMO_STAFF[0]], { silent: true });
  if (!(await db.list('agency_settings', { limit: 1 })).length) await db.insertMany('agency_settings', [defaultSettings()], { silent: true });
  db.touchAll(['carriers', 'staff', 'agency_settings']);
}
