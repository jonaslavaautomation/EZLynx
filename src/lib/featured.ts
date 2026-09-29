import { db, uuid } from '@/lib/db';
import { addMonths, today } from '@/lib/format';
import { OWNER_NAME } from '@/lib/owner';
import type { Account, Coverage, Driver, LineOfBusiness, Policy, PolicyTransaction, Property, Vehicle } from '@/lib/types';

/*
 * Named practice insureds every agency database gets once: two personal households with Auto + Home policies and
 * five commercial insureds. All people, businesses and numbers are fictional. They are matched by email, so they
 * are created only when missing and never duplicated; editing or deleting them later is left alone.
 */

type NewAccount = Omit<Account, 'id' | 'created_at'>;

const BLANK: NewAccount = {
  first_name: '', last_name: '', email: '', phone: null, address: null, city: null, state: null, zip: null, policy_type: null,
  status: 'Active', account_type: 'Personal', business_name: null, dob: null, marital_status: null, occupation: null, mobile_phone: null,
  producer: OWNER_NAME, csr: null, lead_source: 'Referral', notes: null, labels: [], customer_since: null, naics_code: null, sic_code: null,
  nature_of_business: null, naics_description: null, operations_description: null, prefix: null, middle_initial: null, suffix: null,
  maiden_name: null, nickname: null, gender: null, ssn_last4: null, dl_number: null, dl_status: null, dl_state: null, education: null,
  industry: null, occupation_years: null, prior_employer_years: null, account_name: null, preferred_language: 'English', vip: false,
  phones: [], emails: [], bridge_email: false, contact_method: null, contact_time: null, phone_ext: null, fax: null, website: null,
  legal_entity_type: null, tax_id: null, gl_code: null, date_business_started: null, lead_priority: null, probability_of_sale: null, lead_status: null,
};

type PolicySpec = { line: LineOfBusiness; carrier: string; premium: number; term: 6 | 12; startedMonthsAgo: number; coverages: Coverage[]; number: string };
type Featured = {
  account: Partial<NewAccount> & Pick<NewAccount, 'first_name' | 'last_name' | 'email'>;
  drivers?: Omit<Driver, 'id' | 'created_at' | 'account_id'>[];
  vehicles?: Omit<Vehicle, 'id' | 'created_at' | 'account_id'>[];
  property?: Omit<Property, 'id' | 'created_at' | 'account_id'>;
  policies: PolicySpec[];
};

const AUTO_COV: Coverage[] = [
  { name: 'Bodily Injury', limit: '100/300' }, { name: 'Property Damage', limit: '100,000' }, { name: 'Uninsured Motorist', limit: '100/300' },
  { name: 'Medical Payments', limit: '5,000' }, { name: 'Comprehensive', limit: 'ACV', deductible: '500' }, { name: 'Collision', limit: 'ACV', deductible: '500' },
];
const home = (dwelling: number): Coverage[] => [
  { name: 'Dwelling (A)', limit: dwelling.toLocaleString('en-US'), deductible: '1,000' }, { name: 'Other Structures (B)', limit: (dwelling * 0.1).toLocaleString('en-US') },
  { name: 'Personal Property (C)', limit: (dwelling * 0.5).toLocaleString('en-US') }, { name: 'Loss of Use (D)', limit: (dwelling * 0.2).toLocaleString('en-US') },
  { name: 'Personal Liability (E)', limit: '300,000' }, { name: 'Medical Payments (F)', limit: '5,000' },
];
const GL: Coverage[] = [{ name: 'Each Occurrence', limit: '1,000,000' }, { name: 'General Aggregate', limit: '2,000,000' }, { name: 'Products/Completed Ops', limit: '2,000,000' }];
const CA: Coverage[] = [{ name: 'Combined Single Limit', limit: '1,000,000' }, { name: 'Hired & Non-Owned', limit: 'Included' }];
const WC: Coverage[] = [{ name: 'Part One', limit: 'Statutory' }, { name: 'Employers Liability', limit: '500/500/500' }];
const BOP: Coverage[] = [{ name: 'Building', limit: '500,000', deductible: '2,500' }, { name: 'Business Personal Property', limit: '150,000' }, { name: 'Liability', limit: '1,000,000/2,000,000' }];

export const FEATURED: Featured[] = [
  // ── Personal: Auto + Home ──
  {
    account: {
      first_name: 'Daniel', last_name: 'Whitfield', email: 'daniel.whitfield@lava-demo.example', phone: '(512) 555-0147', mobile_phone: '(512) 555-0148',
      address: '4827 Bluebonnet Ridge Dr', city: 'Round Rock', state: 'TX', zip: '78664', policy_type: 'Home + Auto', dob: '1984-03-12',
      marital_status: 'Married', occupation: 'Engineer', gender: 'Male', customer_since: '2023-05-01',
    },
    drivers: [
      { first_name: 'Daniel', last_name: 'Whitfield', dob: '1984-03-12', gender: 'Male', marital_status: 'Married', relationship: 'Insured', license_number: '41872093', license_state: 'TX', violations: 0, accidents: 0 },
      { first_name: 'Rachel', last_name: 'Whitfield', dob: '1986-09-27', gender: 'Female', marital_status: 'Married', relationship: 'Spouse', license_number: '52918374', license_state: 'TX', violations: 0, accidents: 0 },
    ],
    vehicles: [
      { year: 2022, make: 'Toyota', model: 'Highlander', vin: '5TDGZRBH3NS187452', usage: 'Commute', annual_miles: 12000, ownership: 'Financed', garaging_zip: '78664' },
      { year: 2019, make: 'Honda', model: 'Civic', vin: '19XFC2F59KE203871', usage: 'Pleasure', annual_miles: 8000, ownership: 'Owned', garaging_zip: '78664' },
    ],
    property: { address: '4827 Bluebonnet Ridge Dr', city: 'Round Rock', state: 'TX', zip: '78664', year_built: 2006, square_feet: 2850, construction: 'Brick Veneer', roof_type: 'Architectural Shingle', roof_year: 2020, protection_class: 3, dwelling_value: 425000 },
    policies: [
      { line: 'Personal Auto', carrier: 'Summit Mutual', premium: 1486, term: 6, startedMonthsAgo: 2, coverages: AUTO_COV, number: 'PA-4418207' },
      { line: 'Homeowners', carrier: 'Summit Mutual', premium: 3284, term: 12, startedMonthsAgo: 4, coverages: home(425000), number: 'HO-7730915' },
    ],
  },
  {
    account: {
      first_name: 'Carlos', last_name: 'Mendoza', email: 'carlos.mendoza@lava-demo.example', phone: '(210) 555-0163', mobile_phone: '(210) 555-0164',
      address: '1193 Pecan Hollow Ln', city: 'San Antonio', state: 'TX', zip: '78258', policy_type: 'Home + Auto', dob: '1979-11-04',
      marital_status: 'Single', occupation: 'Sales Manager', gender: 'Male', customer_since: '2022-08-15',
    },
    drivers: [
      { first_name: 'Carlos', last_name: 'Mendoza', dob: '1979-11-04', gender: 'Male', marital_status: 'Single', relationship: 'Insured', license_number: '36590218', license_state: 'TX', violations: 1, accidents: 0 },
    ],
    vehicles: [
      { year: 2021, make: 'Ford', model: 'F-150', vin: '1FTEW1EP4MFA52816', usage: 'Commute', annual_miles: 15000, ownership: 'Owned', garaging_zip: '78258' },
    ],
    property: { address: '1193 Pecan Hollow Ln', city: 'San Antonio', state: 'TX', zip: '78258', year_built: 1998, square_feet: 2100, construction: 'Frame', roof_type: 'Composition Shingle', roof_year: 2016, protection_class: 4, dwelling_value: 318000 },
    policies: [
      { line: 'Personal Auto', carrier: 'Keystone Casualty', premium: 1122, term: 6, startedMonthsAgo: 1, coverages: AUTO_COV, number: 'PA-5093368' },
      { line: 'Homeowners', carrier: 'Keystone Casualty', premium: 2791, term: 12, startedMonthsAgo: 7, coverages: home(318000), number: 'HO-6251409' },
    ],
  },
  // ── Commercial ──
  {
    account: {
      account_type: 'Commercial', business_name: 'Hill Country Plumbing LLC', first_name: 'Tom', last_name: 'Reyes', email: 'office@hillcountryplumbing.lava-demo.example',
      phone: '(512) 555-0182', address: '2210 Industrial Blvd', city: 'Austin', state: 'TX', zip: '78745', policy_type: 'Commercial', legal_entity_type: 'LLC',
      naics_code: '238220', naics_description: 'Plumbing, Heating, and Air-Conditioning Contractors', nature_of_business: 'Contractor',
      operations_description: 'Residential and light commercial plumbing repair and installation.', date_business_started: '2011-04-01', website: 'https://example.com/hillcountryplumbing', customer_since: '2021-02-10',
    },
    policies: [
      { line: 'General Liability', carrier: 'Copperline Commercial', premium: 4860, term: 12, startedMonthsAgo: 3, coverages: GL, number: 'GL-2280471' },
      { line: 'Commercial Auto', carrier: 'Copperline Commercial', premium: 7425, term: 12, startedMonthsAgo: 3, coverages: CA, number: 'CA-3317502' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 9340, term: 12, startedMonthsAgo: 5, coverages: WC, number: 'WC-8820163' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Brightside Pediatric Dental PLLC', first_name: 'Aisha', last_name: 'Grant', email: 'admin@brightsidedental.lava-demo.example',
      phone: '(972) 555-0119', address: '5601 W Park Blvd, Suite 210', city: 'Plano', state: 'TX', zip: '75093', policy_type: 'Commercial', legal_entity_type: 'Partnership',
      naics_code: '621210', naics_description: 'Offices of Dentists', nature_of_business: 'Office', operations_description: 'Pediatric dental practice with two dentists and six staff.',
      date_business_started: '2016-09-12', website: 'https://example.com/brightsidedental', customer_since: '2022-01-05',
    },
    policies: [
      { line: 'BOP', carrier: 'Copperline Commercial', premium: 3920, term: 12, startedMonthsAgo: 6, coverages: BOP, number: 'BP-4471926' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 2860, term: 12, startedMonthsAgo: 6, coverages: WC, number: 'WC-9914307' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Trinity River Freight Inc.', first_name: 'Mike', last_name: 'Donovan', email: 'dispatch@trinityriverfreight.lava-demo.example',
      phone: '(817) 555-0175', address: '9800 Freight Way', city: 'Fort Worth', state: 'TX', zip: '76106', policy_type: 'Commercial', legal_entity_type: 'Corporation',
      naics_code: '484121', naics_description: 'General Freight Trucking, Long-Distance, Truckload', nature_of_business: 'Service', operations_description: 'Regional truckload freight hauling with eight power units.',
      date_business_started: '2009-06-20', website: 'https://example.com/trinityriverfreight', customer_since: '2020-11-18',
    },
    policies: [
      { line: 'Commercial Auto', carrier: 'Copperline Commercial', premium: 9780, term: 12, startedMonthsAgo: 2, coverages: CA, number: 'CA-5520839' },
      { line: 'General Liability', carrier: 'Frontier Workers Group', premium: 2410, term: 12, startedMonthsAgo: 2, coverages: GL, number: 'GL-6617284' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Lakeside Coffee Roasters', first_name: 'Jenna', last_name: 'Park', email: 'hello@lakesidecoffee.lava-demo.example',
      phone: '(303) 555-0138', address: '1455 Platte St', city: 'Denver', state: 'CO', zip: '80202', policy_type: 'Commercial', legal_entity_type: 'LLC',
      naics_code: '311920', naics_description: 'Coffee and Tea Manufacturing', nature_of_business: 'Manufacturing', operations_description: 'Small-batch coffee roasting with an attached retail cafe.',
      date_business_started: '2018-03-03', website: 'https://example.com/lakesidecoffee', customer_since: '2023-03-22',
    },
    policies: [
      { line: 'BOP', carrier: 'Copperline Commercial', premium: 4175, term: 12, startedMonthsAgo: 8, coverages: BOP, number: 'BP-7708154' },
      { line: 'General Liability', carrier: 'Copperline Commercial', premium: 1680, term: 12, startedMonthsAgo: 8, coverages: GL, number: 'GL-7708155' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Apex Roofing & Restoration', first_name: 'Brandon', last_name: 'Cole', email: 'info@apexroofing.lava-demo.example',
      phone: '(918) 555-0156', address: '6120 S Memorial Dr', city: 'Tulsa', state: 'OK', zip: '74133', policy_type: 'Commercial', legal_entity_type: 'Sole Proprietor',
      naics_code: '238160', naics_description: 'Roofing Contractors', nature_of_business: 'Contractor', operations_description: 'Residential roof replacement and storm restoration.',
      date_business_started: '2014-05-15', website: 'https://example.com/apexroofing', customer_since: '2021-07-30',
    },
    policies: [
      { line: 'General Liability', carrier: 'Copperline Commercial', premium: 6950, term: 12, startedMonthsAgo: 4, coverages: GL, number: 'GL-8840326' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 11800, term: 12, startedMonthsAgo: 4, coverages: WC, number: 'WC-8840327' },
      { line: 'Commercial Auto', carrier: 'Copperline Commercial', premium: 5230, term: 12, startedMonthsAgo: 1, coverages: CA, number: 'CA-8840328' },
    ],
  },
];

/** Creates any featured insured that isn't in this agency's database yet (matched by email). */
export async function ensureFeaturedInsureds() {
  const emails = FEATURED.map((f) => f.account.email);
  const [existing, carriers, staff] = await Promise.all([
    db.list('accounts', { in: { column: 'email', values: emails } }),
    db.list('carriers'),
    db.list('staff'),
  ]);
  const have = new Set(existing.map((a) => a.email));
  const missing = FEATURED.filter((f) => !have.has(f.account.email));
  if (!missing.length) return 0;
  const csr = staff.find((s) => s.active && s.role === 'CSR')?.name ?? null;
  const t = today();
  const now = new Date().toISOString();

  const accounts: Account[] = [], drivers: Driver[] = [], vehicles: Vehicle[] = [], properties: Property[] = [], policies: Policy[] = [], txns: PolicyTransaction[] = [];
  for (const f of missing) {
    const a: Account = { ...BLANK, csr, ...f.account, id: uuid(), created_at: now };
    accounts.push(a);
    for (const d of f.drivers ?? []) drivers.push({ ...d, id: uuid(), created_at: now, account_id: a.id });
    for (const v of f.vehicles ?? []) vehicles.push({ ...v, id: uuid(), created_at: now, account_id: a.id });
    if (f.property) properties.push({ ...f.property, id: uuid(), created_at: now, account_id: a.id });
    for (const p of f.policies) {
      const effective = addMonths(t, -p.startedMonthsAgo);
      const carrier = carriers.find((c) => c.name === p.carrier) ?? carriers.find((c) => c.lines.includes(p.line));
      const row: Policy = {
        id: uuid(), created_at: now, account_id: a.id, policy_number: p.number, carrier: carrier?.name ?? p.carrier, line_of_business: p.line, status: 'Active',
        effective_date: effective, expiration_date: addMonths(effective, p.term), term_months: p.term, premium: p.premium,
        commission_rate: carrier?.commission_rate ?? 12, billing_type: 'Direct Bill', payment_plan: p.term === 6 ? 'Monthly' : 'Paid in Full',
        source: 'Manual', producer: a.producer, coverages: p.coverages, notes: null, rewritten_from_policy_id: null,
      };
      policies.push(row);
      txns.push({ id: uuid(), created_at: now, policy_id: row.id, account_id: a.id, type: 'New Business', effective_date: effective, premium_change: p.premium, description: `${p.line} term ${effective} – ${row.expiration_date}` });
    }
  }
  await db.insertMany('accounts', accounts, { silent: true });
  if (drivers.length) await db.insertMany('drivers', drivers, { silent: true });
  if (vehicles.length) await db.insertMany('vehicles', vehicles, { silent: true });
  if (properties.length) await db.insertMany('properties', properties, { silent: true });
  await db.insertMany('policies', policies, { silent: true });
  await db.insertMany('policy_transactions', txns, { silent: true });
  db.touchAll(['accounts', 'drivers', 'vehicles', 'properties', 'policies', 'policy_transactions']);
  return missing.length;
}
