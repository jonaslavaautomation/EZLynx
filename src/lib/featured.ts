import { db, uuid } from '@/lib/db';
import { addMonths, today } from '@/lib/format';
import { OWNER_NAME } from '@/lib/owner';
import { DEMO_CARRIERS } from '@/lib/seed';
import type { Account, Coverage, Driver, LineOfBusiness, Policy, PolicyTransaction, Property, Vehicle } from '@/lib/types';
import { BLANK_ASSOCIATION, saveAssociation, type AssociationProfile } from '@/modules/accounts/association';
import { saveAppConfig } from '@/modules/admin/config';

/*
 * Named practice insureds every agency database gets once: two personal households with Auto + Home policies,
 * six commercial businesses and three community associations (two HOAs and a condominium association). All people, businesses and numbers are fictional. They are matched by email, so they
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
  /** Community association underwriting profile (HOA / condo associations only). */
  association?: Partial<AssociationProfile>;
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
const assocPackage = (building: number, outdoor: number, bpp: number, ded: string, windHail: string): Coverage[] => [
  ...(building ? [{ name: 'Building — Common Elements', limit: building.toLocaleString('en-US'), deductible: ded }] : []),
  { name: 'Outdoor Property', limit: outdoor.toLocaleString('en-US'), deductible: ded }, { name: 'Business Personal Property', limit: bpp.toLocaleString('en-US'), deductible: ded },
  { name: 'Wind / Hail deductible', limit: windHail }, { name: 'Liability — Each Occurrence', limit: '1,000,000' }, { name: 'Liability — General Aggregate', limit: '2,000,000' },
  { name: 'Hired & Non-Owned Auto', limit: '1,000,000' },
];
const DO = (limit: string): Coverage[] => [{ name: 'Directors & Officers Liability', limit, deductible: '1,000' }, { name: 'Defense Costs', limit: 'Outside the limit' }, { name: 'Property Manager as Additional Insured', limit: 'Included' }];
const CRIME = (limit: string): Coverage[] => [{ name: 'Employee Theft (incl. board & manager)', limit, deductible: '1,000' }, { name: 'Forgery or Alteration', limit: '25,000' }, { name: 'Computer Fraud', limit: '25,000' }, { name: 'Funds Transfer Fraud', limit: '25,000' }];
const CUMB = (limit: string): Coverage[] => [{ name: 'Each Occurrence', limit }, { name: 'Aggregate', limit }, { name: 'Self-Insured Retention', limit: '10,000' }];
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
  // ── Community associations ──
  {
    account: {
      account_type: 'Commercial', business_name: 'Willow Creek Homeowners Association', first_name: 'Linda', last_name: 'Okafor', email: 'board@willowcreekhoa.lava-demo.example',
      phone: '(512) 555-0191', address: '3300 Willow Creek Pkwy', city: 'Round Rock', state: 'TX', zip: '78665', policy_type: 'Commercial', legal_entity_type: 'Association',
      naics_code: '813990', sic_code: '8641', naics_description: "Homeowners' and Condominium Owners' Associations", nature_of_business: 'Condominiums',
      operations_description: 'Single-family HOA of 312 homes. Maintains a clubhouse, two pools, a fitness room, playground, tennis courts and a 6-acre stocked pond.',
      date_business_started: '2004-06-01', website: 'https://example.com/willowcreekhoa', customer_since: '2022-04-01', tax_id: '74-3318260',
    },
    association: {
      association_type: 'Single-Family HOA', year_established: '2004', total_units: '312', owner_units: '281', rented_units: '29', vacant_units: '2', developer_units: '0',
      developer_controls_board: 'No', under_construction: 'No', short_term_rentals: 'No',
      residential_buildings: '0', other_buildings: '2', max_stories: '1', elevators: '0', year_built: '2005', construction: 'Joisted Masonry', roof_type: 'Architectural Shingle',
      roof_year: '2019', protection_class: '3', sprinklers: 'None', unit_coverage: 'Bare Walls', building_value: '1,850,000', outdoor_value: '380,000', bpp_value: '45,000',
      management: 'Professional management company', management_company: 'Brushy Creek Community Management', property_manager: 'Dana Whitlock', manager_designation: 'PCAM', manager_has_crime: 'Yes',
      board_members: '5', employees: '0',
      amenities: ['Swimming pool', 'Clubhouse', 'Fitness center', 'Playground', 'Sport courts', 'Lake / pond'], pools: '2', pool_fenced: 'Yes', lifeguard: 'No', lake_acres: '6', road_miles: '',
      annual_assessments: '468,000', reserve_balance: '620,000', monthly_dues: '125', delinquency: '0–15% of owners',
      positive_fund_balance: 'Yes', cpa_audit: 'Yes', dual_signatures: 'Yes', independent_reconciliation: 'Yes', special_assessment: 'No', losses_3yr: 'No', do_claims_5yr: 'No',
    },
    policies: [
      { line: 'Commercial Package', carrier: 'Cornerstone Community Assurance', premium: 14850, term: 12, startedMonthsAgo: 5, coverages: assocPackage(1850000, 380000, 45000, '10,000', '2% per building'), number: 'PK-6604218' },
      { line: 'Directors & Officers', carrier: 'Cornerstone Community Assurance', premium: 1980, term: 12, startedMonthsAgo: 5, coverages: DO('1,000,000'), number: 'DO-6604219' },
      { line: 'Crime', carrier: 'Cornerstone Community Assurance', premium: 1140, term: 12, startedMonthsAgo: 5, coverages: CRIME('750,000'), number: 'CR-6604220' },
      { line: 'Commercial Umbrella', carrier: 'Cornerstone Community Assurance', premium: 3420, term: 12, startedMonthsAgo: 5, coverages: CUMB('5,000,000'), number: 'CU-6604221' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Cherry Creek Terrace Condominium Association', first_name: 'Marcus', last_name: 'Feldman', email: 'manager@cherrycreekterrace.lava-demo.example',
      phone: '(303) 555-0172', address: '2450 E 3rd Ave', city: 'Denver', state: 'CO', zip: '80206', policy_type: 'Commercial', legal_entity_type: 'Association',
      naics_code: '813990', sic_code: '8641', naics_description: "Homeowners' and Condominium Owners' Associations", nature_of_business: 'Condominiums',
      operations_description: 'Condominium association of 84 units in three 5-story sprinklered buildings with an underground parking garage, rooftop pool and fitness room.',
      date_business_started: '1998-09-15', website: 'https://example.com/cherrycreekterrace', customer_since: '2021-10-01', tax_id: '84-1527739',
    },
    association: {
      association_type: 'Condominium Association', year_established: '1998', total_units: '84', owner_units: '66', rented_units: '17', vacant_units: '1', developer_units: '0',
      developer_controls_board: 'No', under_construction: 'No', short_term_rentals: 'No',
      residential_buildings: '3', other_buildings: '0', max_stories: '5', elevators: '3', year_built: '1998', construction: 'Masonry Non-Combustible', roof_type: 'Flat (Membrane)',
      roof_year: '2017', protection_class: '2', sprinklers: 'Full (all buildings)', unit_coverage: 'Single Entity (original specifications)',
      building_value: '28,500,000', outdoor_value: '210,000', bpp_value: '35,000',
      management: 'Professional management company', management_company: 'Front Range Association Management', property_manager: 'Marcus Feldman', manager_designation: 'CMCA', manager_has_crime: 'Yes',
      board_members: '5', employees: '2',
      amenities: ['Swimming pool', 'Fitness center', 'Gated entry', 'Parking garage'], pools: '1', pool_fenced: 'Yes', lifeguard: 'No', lake_acres: '', road_miles: '',
      annual_assessments: '488,880', reserve_balance: '910,000', monthly_dues: '485', delinquency: '0–15% of owners',
      positive_fund_balance: 'Yes', cpa_audit: 'Yes', dual_signatures: 'Yes', independent_reconciliation: 'Yes', special_assessment: 'No',
      losses_3yr: 'Yes', do_claims_5yr: 'No', loss_details: '2024: water damage from a failed riser in Building B, $38,400 paid. All supply risers were inspected and two were replaced.',
    },
    policies: [
      { line: 'Commercial Package', carrier: 'Cornerstone Community Assurance', premium: 46200, term: 12, startedMonthsAgo: 9, coverages: assocPackage(28500000, 210000, 35000, '25,000', '2% per building'), number: 'PK-7718340' },
      { line: 'Directors & Officers', carrier: 'Cornerstone Community Assurance', premium: 1640, term: 12, startedMonthsAgo: 9, coverages: DO('1,000,000'), number: 'DO-7718341' },
      { line: 'Crime', carrier: 'Cornerstone Community Assurance', premium: 1880, term: 12, startedMonthsAgo: 9, coverages: CRIME('1,500,000'), number: 'CR-7718342' },
      { line: 'Commercial Umbrella', carrier: 'Cornerstone Community Assurance', premium: 4100, term: 12, startedMonthsAgo: 9, coverages: CUMB('5,000,000'), number: 'CU-7718343' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 2150, term: 12, startedMonthsAgo: 9, coverages: WC, number: 'WC-7718344' },
    ],
  },
  {
    // Small townhome HOA inside Copperline's appetite (under 250 units, up to 4 stories), so it has two markets.
    account: {
      account_type: 'Commercial', business_name: 'Saddlebrook Townhome Association', first_name: 'Teresa', last_name: 'Villanueva', email: 'board@saddlebrooktownhomes.lava-demo.example',
      phone: '(210) 555-0186', address: '7400 Saddlebrook Trl', city: 'San Antonio', state: 'TX', zip: '78249', policy_type: 'Commercial', legal_entity_type: 'Association',
      naics_code: '813990', sic_code: '8641', naics_description: "Homeowners' and Condominium Owners' Associations", nature_of_business: 'Condominiums',
      operations_description: 'Townhome association of 148 units in 37 two-story buildings. Maintains roofs and exteriors, a pool, a playground and private streets.',
      date_business_started: '2012-03-01', website: 'https://example.com/saddlebrooktownhomes', customer_since: '2024-02-15', tax_id: '74-3529184',
    },
    association: {
      association_type: 'Townhome Association', year_established: '2012', total_units: '148', owner_units: '119', rented_units: '27', vacant_units: '2', developer_units: '0',
      developer_controls_board: 'No', under_construction: 'No', short_term_rentals: 'No',
      residential_buildings: '37', other_buildings: '1', max_stories: '2', elevators: '0', year_built: '2013', construction: 'Frame', roof_type: 'Architectural Shingle',
      roof_year: '2021', protection_class: '2', sprinklers: 'None', unit_coverage: 'Bare Walls', building_value: '18,600,000', outdoor_value: '165,000', bpp_value: '20,000',
      management: 'Professional management company', management_company: 'Lone Star Community Management LLC', property_manager: 'Rachel Kim', manager_designation: 'CMCA', manager_has_crime: 'Yes',
      board_members: '5', employees: '0',
      amenities: ['Swimming pool', 'Playground', 'Private roads'], pools: '1', pool_fenced: 'Yes', lifeguard: 'No', lake_acres: '', road_miles: '2',
      annual_assessments: '506,160', reserve_balance: '385,000', monthly_dues: '285', delinquency: '0–15% of owners',
      positive_fund_balance: 'Yes', cpa_audit: 'Yes', dual_signatures: 'Yes', independent_reconciliation: 'Yes', special_assessment: 'No', losses_3yr: 'No', do_claims_5yr: 'No',
    },
    policies: [
      { line: 'Commercial Package', carrier: 'Copperline Commercial', premium: 38400, term: 12, startedMonthsAgo: 3, coverages: assocPackage(18600000, 165000, 20000, '10,000', '1% per building'), number: 'PK-8823516' },
      { line: 'Directors & Officers', carrier: 'Cornerstone Community Assurance', premium: 1390, term: 12, startedMonthsAgo: 3, coverages: DO('1,000,000'), number: 'DO-8823517' },
      { line: 'Crime', carrier: 'Cornerstone Community Assurance', premium: 980, term: 12, startedMonthsAgo: 3, coverages: CRIME('750,000'), number: 'CR-8823518' },
    ],
  },
  {
    // The management company behind several associations: its own office, staff and fidelity exposure.
    account: {
      account_type: 'Commercial', business_name: 'Lone Star Community Management LLC', first_name: 'Rachel', last_name: 'Kim', email: 'office@lonestarcm.lava-demo.example',
      phone: '(512) 555-0164', address: '3801 N Capital of Texas Hwy, Suite 200', city: 'Austin', state: 'TX', zip: '78746', policy_type: 'Commercial', legal_entity_type: 'LLC',
      naics_code: '531311', sic_code: '6531', naics_description: 'Residential Property Managers', nature_of_business: 'Apartments',
      operations_description: 'Community association management for 42 HOAs and condominium associations: accounting, collections, vendor management and board meetings. 18 employees.',
      date_business_started: '2010-08-16', website: 'https://example.com/lonestarcm', customer_since: '2023-06-01', tax_id: '27-4188032',
    },
    policies: [
      { line: 'BOP', carrier: 'Copperline Commercial', premium: 2860, term: 12, startedMonthsAgo: 4, coverages: BOP, number: 'BP-9031742' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 3240, term: 12, startedMonthsAgo: 4, coverages: WC, number: 'WC-9031743' },
      { line: 'Crime', carrier: 'Cornerstone Community Assurance', premium: 2450, term: 12, startedMonthsAgo: 4, coverages: CRIME('2,000,000'), number: 'CR-9031744' },
      { line: 'Commercial Umbrella', carrier: 'Copperline Commercial', premium: 2180, term: 12, startedMonthsAgo: 4, coverages: CUMB('2,000,000'), number: 'CU-9031745' },
    ],
  },
  {
    account: {
      account_type: 'Commercial', business_name: 'Summit Ridge Landscaping & Snow Removal', first_name: 'Derek', last_name: 'Lindqvist', email: 'crew@summitridgelandscape.lava-demo.example',
      phone: '(720) 555-0147', address: '5120 Brighton Blvd', city: 'Denver', state: 'CO', zip: '80216', policy_type: 'Commercial', legal_entity_type: 'S Corporation',
      naics_code: '561730', sic_code: '0782', naics_description: 'Landscaping Services', nature_of_business: 'Service',
      operations_description: 'Commercial and HOA landscape maintenance in summer and snow plowing in winter. 14 employees, 9 trucks with plows and trailers.',
      date_business_started: '2015-04-01', website: 'https://example.com/summitridgelandscape', customer_since: '2022-11-10', tax_id: '84-2290415',
    },
    policies: [
      { line: 'General Liability', carrier: 'Copperline Commercial', premium: 7380, term: 12, startedMonthsAgo: 7, coverages: GL, number: 'GL-5574208' },
      { line: 'Commercial Auto', carrier: 'Copperline Commercial', premium: 14260, term: 12, startedMonthsAgo: 7, coverages: CA, number: 'CA-5574209' },
      { line: 'Workers Comp', carrier: 'Frontier Workers Group', premium: 12940, term: 12, startedMonthsAgo: 7, coverages: WC, number: 'WC-5574210' },
      { line: 'Commercial Umbrella', carrier: 'Copperline Commercial', premium: 3150, term: 12, startedMonthsAgo: 7, coverages: CUMB('2,000,000'), number: 'CU-5574211' },
    ],
  },
];

/**
 * Databases created before the community association program existed: add its carrier, and the association lines
 * Copperline Commercial writes, so association quotes and the practice associations have markets.
 */
export async function ensureAssociationCarriers() {
  // Runs once per agency database, so a carrier the agency later removes stays removed.
  const [cfg] = await db.list('app_config', { eq: { key: 'association_details' } });
  const stored = (cfg?.value ?? {}) as { byAccount?: Record<string, AssociationProfile>; program_installed?: boolean };
  if (stored.program_installed) return 0;
  const carriers = await db.list('carriers');
  let changed = 0;
  for (const name of ['Cornerstone Community Assurance', 'Copperline Commercial']) {
    const spec = DEMO_CARRIERS.find((c) => c.name === name)!;
    const row = carriers.find((c) => c.name === name);
    if (!row) {
      if (name === 'Cornerstone Community Assurance') { await db.insert('carriers', spec); changed++; }
      continue;
    }
    const missing = spec.lines.filter((l) => !row.lines.includes(l) && ['Commercial Package', 'Directors & Officers', 'Crime', 'Commercial Umbrella'].includes(l));
    if (missing.length) { await db.update('carriers', row.id, { lines: [...row.lines, ...missing] }); changed++; }
  }
  // Carrier Quoting Setup: once any carrier is set up, only Ready carriers rate, so set up the program lines too.
  const setups = await db.list('carrier_rating_setup');
  if (setups.length) {
    const corner = DEMO_CARRIERS.find((c) => c.name === 'Cornerstone Community Assurance')!;
    if (!setups.some((r) => r.carrier === corner.name)) {
      await db.insert('carrier_rating_setup', { carrier: corner.name, username: 'northstar.cornerst', agency_code: 'NS4520', login_set: true, enabled_lines: [...corner.lines], active: true });
    }
    const copper = setups.find((r) => r.carrier === 'Copperline Commercial');
    const add = ['Commercial Package', 'Commercial Umbrella'].filter((l) => copper && !copper.enabled_lines.includes(l));
    if (copper && add.length) await db.update('carrier_rating_setup', copper.id, { enabled_lines: [...copper.enabled_lines, ...add] });
  }
  await saveAppConfig('association_details', { byAccount: stored.byAccount ?? {}, program_installed: true });
  return changed;
}

/** Creates any featured insured that isn't in this agency's database yet (matched by email). */
export async function ensureFeaturedInsureds() {
  await ensureAssociationCarriers().catch(() => 0);
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

  const associations: [string, Partial<AssociationProfile>][] = [];
  const accounts: Account[] = [], drivers: Driver[] = [], vehicles: Vehicle[] = [], properties: Property[] = [], policies: Policy[] = [], txns: PolicyTransaction[] = [];
  for (const f of missing) {
    const a: Account = { ...BLANK, csr, ...f.account, id: uuid(), created_at: now };
    accounts.push(a);
    if (f.association) associations.push([a.id, f.association]);
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
  for (const [id, profile] of associations) await saveAssociation(id, { ...BLANK_ASSOCIATION, ...profile });
  return missing.length;
}
