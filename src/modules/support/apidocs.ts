/*
 * API documentation data for this system's real data API: Supabase PostgREST over the tables in
 * supabase/migrations. Field lists mirror src/lib/types.ts.
 */

export type Field = { name: string; type: string; note?: string; required?: boolean };
export type QueryExample = { title: string; query: string; note?: string };

export type Resource = {
  table: string;
  title: string;
  description: string;
  fields: Field[];
  example: Record<string, unknown>;
  /** Minimal body for a POST example. */
  create: Record<string, unknown>;
  patch: Record<string, unknown>;
  queries: QueryExample[];
};

export type ApiPage = { slug: '' | 'policy' | 'discussion' | 'applicant' | 'web-services'; title: string; menuLabel: string; intro: string; resources: string[] };

const f = (spec: string): Field[] =>
  spec.trim().split(/\n/).map((line) => {
    const [name, type, ...rest] = line.trim().split(/\s+/);
    const required = name.endsWith('*');
    return { name: name.replace('*', ''), type, required, note: rest.join(' ') || undefined };
  });

const BASE_FIELDS = `
id uuid Primary key; generated when omitted
created_at timestamptz Set by the server`;

const ID = {
  account: '5b0c8a54-1f7e-4c6b-9a55-2f3f0f0c1a11',
  policy: '9d2f3b0e-6a41-4e0f-8f35-0b7e5f1c2d22',
  driver: 'c61a7e3d-2b9f-4f7a-8d1e-7a3c9e4b5f33',
  vehicle: 'e7b4c2a1-3d5f-4a6b-9c8d-1e2f3a4b5c44',
  property: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c55',
  doc: 'f0e1d2c3-b4a5-4968-8776-655443322166',
  tx: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c77',
  quote: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d88',
  activity: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e99',
  message: '3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6faa',
};
const TS = '2026-09-24T14:05:11.482+00:00';

export const RESOURCES: Record<string, Resource> = {
  accounts: {
    table: 'accounts', title: 'Applicants', description: 'Clients and prospects: a household (Personal) or a business (Commercial).',
    fields: f(`${BASE_FIELDS}
first_name* text
last_name* text
email* text Use '' when unknown
phone text
mobile_phone text
address text
city text
state text 2-letter code
zip text
account_type text Personal | Commercial (default Personal)
business_name text Display name for Commercial
status text Prospect | Active | Pending | Inactive (default Active)
policy_type text Primary line (legacy)
dob date YYYY-MM-DD
marital_status text
occupation text
producer text Staff name
csr text Staff name
lead_source text
labels jsonb Array of label ids (default [])
notes text`),
    example: { id: ID.account, created_at: TS, first_name: 'Sarah', last_name: 'Mitchell', email: 'sarah.mitchell@example.com', phone: '(512) 555-0142', mobile_phone: '(512) 555-0199', address: '418 Oak Hollow Dr', city: 'Austin', state: 'TX', zip: '78745', account_type: 'Personal', business_name: null, status: 'Active', policy_type: 'Personal Auto', dob: '1986-03-14', marital_status: 'Married', occupation: 'Teacher', producer: 'Dana Whitfield', csr: 'Marcus Lee', lead_source: 'Referral', labels: [], notes: null },
    create: { first_name: 'Jane', last_name: 'Sample', email: 'jane.sample@example.com', phone: '(512) 555-0100', state: 'TX', status: 'Prospect', account_type: 'Personal', lead_source: 'Website' },
    patch: { status: 'Active', csr: 'Marcus Lee' },
    queries: [
      { title: 'Search by last name (case-insensitive contains)', query: 'accounts?select=id,first_name,last_name,email&last_name=ilike.*mitch*' },
      { title: 'Active commercial accounts in TX', query: 'accounts?account_type=eq.Commercial&status=eq.Active&state=eq.TX&order=business_name.asc' },
      { title: 'Applicant with drivers, vehicles and policies (embedded)', query: `accounts?id=eq.${ID.account}&select=*,drivers(*),vehicles(*),policies(policy_number,carrier,status)` },
    ],
  },
  drivers: {
    table: 'drivers', title: 'Drivers', description: 'Household drivers on an applicant (used by the auto rater).',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
first_name* text
last_name* text
dob date
gender text
marital_status text
relationship text Insured | Spouse | Child | Other
license_number text
license_state text
violations int default 0
accidents int default 0`),
    example: { id: ID.driver, created_at: TS, account_id: ID.account, first_name: 'Sarah', last_name: 'Mitchell', dob: '1986-03-14', gender: 'F', marital_status: 'Married', relationship: 'Insured', license_number: 'TX12345678', license_state: 'TX', violations: 0, accidents: 0 },
    create: { account_id: ID.account, first_name: 'Evan', last_name: 'Mitchell', dob: '2008-07-02', relationship: 'Child', license_state: 'TX' },
    patch: { violations: 1 },
    queries: [{ title: 'Drivers on an applicant', query: `drivers?account_id=eq.${ID.account}&order=dob.asc` }],
  },
  vehicles: {
    table: 'vehicles', title: 'Vehicles', description: 'Vehicles on an applicant.',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
year* int
make* text
model* text
vin text
usage text Commute | Pleasure | Business
annual_miles int
ownership text Owned | Financed | Leased
garaging_zip text`),
    example: { id: ID.vehicle, created_at: TS, account_id: ID.account, year: 2022, make: 'Toyota', model: 'RAV4', vin: '2T3P1RFV8NW123456', usage: 'Commute', annual_miles: 12000, ownership: 'Financed', garaging_zip: '78745' },
    create: { account_id: ID.account, year: 2019, make: 'Honda', model: 'Civic', usage: 'Pleasure' },
    patch: { annual_miles: 8000 },
    queries: [{ title: 'Vehicles newer than 2020', query: 'vehicles?year=gte.2020&select=account_id,year,make,model' }],
  },
  properties: {
    table: 'properties', title: 'Properties', description: 'Dwellings and locations on an applicant (used by the home rater).',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
address* text
city text
state text
zip text
year_built int
square_feet int
construction text Frame | Masonry | Brick Veneer …
roof_type text
roof_year int
protection_class int 1–10
dwelling_value numeric`),
    example: { id: ID.property, created_at: TS, account_id: ID.account, address: '418 Oak Hollow Dr', city: 'Austin', state: 'TX', zip: '78745', year_built: 2004, square_feet: 2150, construction: 'Frame', roof_type: 'Composition Shingle', roof_year: 2018, protection_class: 3, dwelling_value: 385000 },
    create: { account_id: ID.account, address: '12 Lake View Rd', state: 'TX', year_built: 1998, construction: 'Masonry' },
    patch: { roof_year: 2026 },
    queries: [{ title: 'Roofs older than 15 years', query: 'properties?roof_year=lt.2011&select=account_id,address,roof_year' }],
  },
  documents: {
    table: 'documents', title: 'Documents', description: 'Document metadata. Files live in the private Storage bucket `documents` at storage_path.',
    fields: f(`${BASE_FIELDS}
account_id uuid → accounts.id (cascade delete)
policy_id uuid → policies.id (set null)
name* text
category text Application | ID Card | Declarations | Proof of Insurance | Correspondence | Other
mime_type text
size_bytes int
storage_path text Path in the documents bucket
data_url text Inline content (browser-storage mode only)
esign_status text Pending | Completed | Declined | Expired | Canceled | Failed
esign_signer_email text
esign_sent_at timestamptz
esign_completed_at timestamptz`),
    example: { id: ID.doc, created_at: TS, account_id: ID.account, policy_id: ID.policy, name: 'Auto ID Cards.pdf', category: 'ID Card', mime_type: 'application/pdf', size_bytes: 84211, storage_path: '7c1d…/Auto_ID_Cards.pdf', data_url: null, esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null },
    create: { account_id: ID.account, name: 'Signed application.pdf', category: 'Application', mime_type: 'application/pdf' },
    patch: { category: 'Correspondence' },
    queries: [
      { title: 'Envelopes awaiting signature', query: 'documents?esign_status=eq.Pending&select=id,name,esign_signer_email,esign_sent_at' },
      { title: 'Download a file (Storage API, signed URL)', query: 'POST /storage/v1/object/sign/documents/{storage_path}  body: {"expiresIn":600}', note: 'Storage is a separate endpoint: {SUPABASE_URL}/storage/v1.' },
    ],
  },
  policies: {
    table: 'policies', title: 'Policies', description: 'Policy headers: carrier, line, term, premium, commission and coverages.',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
policy_number* text
carrier* text Carrier name
line_of_business* text Personal Auto | Homeowners | … | Commercial Property
status text Active | Pending | Cancelled | Expired | Non-Renewed (default Active)
effective_date* date
expiration_date* date
term_months int default 12
premium numeric default 0
commission_rate numeric Percent (default 10)
billing_type text Direct Bill | Agency Bill
payment_plan text
source text Manual | Download | Rater
producer text Staff name
coverages jsonb [{name, limit, deductible?, premium?}]
notes text
rewritten_from_policy_id uuid → policies.id (set null)`),
    example: { id: ID.policy, created_at: TS, account_id: ID.account, policy_number: 'PA-4418820', carrier: 'Progressive', line_of_business: 'Personal Auto', status: 'Active', effective_date: '2026-03-01', expiration_date: '2026-09-01', term_months: 6, premium: 1284.5, commission_rate: 12, billing_type: 'Direct Bill', payment_plan: 'Monthly', source: 'Rater', producer: 'Dana Whitfield', coverages: [{ name: 'Bodily Injury', limit: '100/300' }, { name: 'Collision', limit: 'ACV', deductible: '$500' }], notes: null, rewritten_from_policy_id: null },
    create: { account_id: ID.account, policy_number: 'HO-2210044', carrier: 'Travelers', line_of_business: 'Homeowners', effective_date: '2026-10-01', expiration_date: '2027-10-01', premium: 1810, commission_rate: 15, billing_type: 'Direct Bill' },
    patch: { premium: 1875.25, notes: 'Renewal premium confirmed with carrier' },
    queries: [
      { title: 'Active policies expiring in the next 60 days', query: 'policies?status=eq.Active&expiration_date=gte.2026-09-24&expiration_date=lte.2026-11-23&order=expiration_date.asc' },
      { title: 'Book by carrier (only the columns you need)', query: 'policies?carrier=eq.Progressive&select=policy_number,line_of_business,premium,status' },
      { title: 'Policies with the insured name (embedded)', query: 'policies?select=policy_number,premium,accounts(first_name,last_name,business_name)&limit=50' },
    ],
  },
  policy_transactions: {
    table: 'policy_transactions', title: 'Policy transactions', description: 'New business, endorsements, renewals, cancellations, reinstatements, audits and rewrites.',
    fields: f(`${BASE_FIELDS}
policy_id* uuid → policies.id (cascade delete)
account_id* uuid → accounts.id (cascade delete)
type* text New Business | Endorsement | Renewal | Cancellation | Reinstatement | Audit | Rewrite
effective_date* date
premium_change numeric ± amount (default 0)
description text`),
    example: { id: ID.tx, created_at: TS, policy_id: ID.policy, account_id: ID.account, type: 'Endorsement', effective_date: '2026-06-15', premium_change: 142.0, description: 'Added 2022 Toyota RAV4' },
    create: { policy_id: ID.policy, account_id: ID.account, type: 'Endorsement', effective_date: '2026-10-05', premium_change: -35, description: 'Raised collision deductible to $1,000' },
    patch: { description: 'Raised collision deductible to $1,000 (carrier confirmed)' },
    queries: [
      { title: 'History of one policy', query: `policy_transactions?policy_id=eq.${ID.policy}&order=effective_date.desc` },
      { title: 'Cancellations this month', query: 'policy_transactions?type=eq.Cancellation&effective_date=gte.2026-09-01&effective_date=lt.2026-10-01' },
    ],
  },
  quotes: {
    table: 'quotes', title: 'Quotes', description: 'Rater quotes with the inputs captured by the wizard and per-carrier results.',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
line_of_business* text
status text Draft | Rated | Bound | Lost (default Draft)
effective_date* date
input jsonb Rating inputs (default {})
results jsonb [{carrier, premium, term_months, status, message?, coverages}]
selected_carrier text
selected_premium numeric
policy_id uuid → policies.id (set null) Set when bound`),
    example: { id: ID.quote, created_at: TS, account_id: ID.account, line_of_business: 'Personal Auto', status: 'Rated', effective_date: '2026-10-01', input: { liability: '100/300', collision_deductible: 500 }, results: [{ carrier: 'Progressive', premium: 1242, term_months: 6, status: 'Quoted', coverages: [] }, { carrier: 'Travelers', premium: null, term_months: 6, status: 'Declined', message: 'Driver under 18', coverages: [] }], selected_carrier: null, selected_premium: null, policy_id: null },
    create: { account_id: ID.account, line_of_business: 'Homeowners', effective_date: '2026-11-01', status: 'Draft', input: {} },
    patch: { status: 'Lost' },
    queries: [{ title: 'Rated quotes not yet bound', query: 'quotes?status=eq.Rated&policy_id=is.null&order=created_at.desc' }],
  },
  activities: {
    table: 'activities', title: 'Activities (notes & tasks)', description: 'Tasks, calls, emails, meetings, notes, renewal reviews and follow-ups on an applicant or policy.',
    fields: f(`${BASE_FIELDS}
account_id uuid → accounts.id (cascade delete)
policy_id uuid → policies.id (set null)
type text Task | Call | Email | Meeting | Note | Renewal Review | Follow-up (default Task)
subject* text
description text
due_date date
priority text Low | Normal | High (default Normal)
status text Open | In Progress | Completed (default Open)
assigned_to text Staff name
completed_at timestamptz`),
    example: { id: ID.activity, created_at: TS, account_id: ID.account, policy_id: ID.policy, type: 'Task', subject: 'Call about renewal increase', description: 'Premium up 14%; offer remarket.', due_date: '2026-09-28', priority: 'High', status: 'Open', assigned_to: 'Marcus Lee', completed_at: null },
    create: { account_id: ID.account, type: 'Note', subject: 'Client asked about umbrella', description: 'Wants a quote for $1M umbrella.', status: 'Completed' },
    patch: { status: 'Completed', completed_at: '2026-09-24T16:20:00Z' },
    queries: [
      { title: 'Open tasks for one staff member, due first', query: 'activities?type=eq.Task&status=neq.Completed&assigned_to=eq.Marcus%20Lee&order=due_date.asc' },
      { title: 'Notes on an applicant', query: `activities?account_id=eq.${ID.account}&type=eq.Note&order=created_at.desc` },
      { title: 'Overdue tasks agency-wide', query: 'activities?status=in.(Open,In%20Progress)&due_date=lt.2026-09-24' },
    ],
  },
  messages: {
    table: 'messages', title: 'Messages (texts & email)', description: 'Two-way SMS and email conversation log per applicant.',
    fields: f(`${BASE_FIELDS}
account_id* uuid → accounts.id (cascade delete)
channel text SMS | Email (default SMS)
direction text Outbound | Inbound (default Outbound)
to_address text Phone or email
subject text Email only
body* text
status text Sent | Delivered | Received | Failed (default Sent)
read boolean default true`),
    example: { id: ID.message, created_at: TS, account_id: ID.account, channel: 'SMS', direction: 'Inbound', to_address: '(512) 555-0199', subject: null, body: 'Can you send my new ID cards?', status: 'Received', read: false },
    create: { account_id: ID.account, channel: 'SMS', direction: 'Outbound', to_address: '(512) 555-0199', body: 'Hi Sarah, your ID cards are in your email.' },
    patch: { read: true },
    queries: [
      { title: 'Unread inbound messages', query: 'messages?direction=eq.Inbound&read=is.false&order=created_at.desc' },
      { title: 'Conversation with one applicant', query: `messages?account_id=eq.${ID.account}&order=created_at.asc` },
    ],
  },
};

export const API_PAGES: ApiPage[] = [
  { slug: '', title: 'Platform API', menuLabel: 'Overview', intro: 'Every screen in this system reads and writes the same REST API, so anything you can do in the app can be scripted or integrated.', resources: [] },
  { slug: 'applicant', title: 'Applicant API', menuLabel: 'Applicant API', intro: 'Create and update applicants and their household: drivers, vehicles, properties and documents.', resources: ['accounts', 'drivers', 'vehicles', 'properties', 'documents'] },
  { slug: 'policy', title: 'Policy API', menuLabel: 'Policy API', intro: 'Create policy headers and read policy information for accounting, servicing and reporting.', resources: ['policies', 'policy_transactions', 'quotes'] },
  { slug: 'discussion', title: 'Discussion API', menuLabel: 'Discussion API', intro: 'Notes, tasks and the client conversation log.', resources: ['activities', 'messages'] },
  { slug: 'web-services', title: 'Connect Web Services API', menuLabel: 'Web Services', intro: 'Bulk operations, filtering, pagination and change notifications.', resources: [] },
];

export const OPERATORS: [string, string, string][] = [
  ['eq', 'equals', 'status=eq.Active'],
  ['neq', 'not equal', 'status=neq.Completed'],
  ['gt / gte', 'greater than (or equal)', 'premium=gte.1000'],
  ['lt / lte', 'less than (or equal)', 'expiration_date=lte.2026-12-31'],
  ['like / ilike', 'pattern match (* is the wildcard); ilike ignores case', 'last_name=ilike.*son*'],
  ['in', 'one of a list', 'status=in.(Open,Pending)'],
  ['is', 'null / true / false', 'policy_id=is.null'],
  ['not.', 'negates any operator', 'status=not.in.(Cancelled,Expired)'],
  ['or', 'any of several conditions', 'or=(city.eq.Austin,city.eq.Dallas)'],
  ['order', 'sort; add .desc, .nullslast', 'order=expiration_date.asc,premium.desc'],
  ['limit / offset', 'page size and start', 'limit=100&offset=200'],
  ['select', 'columns and embedded relations', 'select=id,policy_number,accounts(last_name)'],
];
