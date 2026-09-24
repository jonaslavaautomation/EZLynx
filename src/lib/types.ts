// Domain model for the Northstar AMS. Every table has `id` (uuid) and `created_at` (ISO string).
// Dates without time (effective_date, dob, due_date…) are stored as 'YYYY-MM-DD' strings.

export type BaseRow = { id: string; created_at: string };

export type AccountType = 'Personal' | 'Commercial';
export type AccountStatus = 'Prospect' | 'Active' | 'Pending' | 'Inactive';

export type Account = BaseRow & {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  policy_type: string | null; // primary line of business (legacy column)
  status: AccountStatus | null;
  account_type: AccountType | null;
  business_name: string | null;
  dob: string | null;
  marital_status: string | null;
  occupation: string | null;
  mobile_phone: string | null;
  producer: string | null; // staff name
  csr: string | null; // staff name
  lead_source: string | null;
  notes: string | null;
};

export type Driver = BaseRow & {
  account_id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  marital_status: string | null;
  relationship: string | null; // Insured, Spouse, Child, Other
  license_number: string | null;
  license_state: string | null;
  violations: number;
  accidents: number;
};

export type Vehicle = BaseRow & {
  account_id: string;
  year: number;
  make: string;
  model: string;
  vin: string | null;
  usage: string | null; // Commute, Pleasure, Business
  annual_miles: number | null;
  ownership: string | null; // Owned, Financed, Leased
  garaging_zip: string | null;
};

export type Property = BaseRow & {
  account_id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  year_built: number | null;
  square_feet: number | null;
  construction: string | null; // Frame, Masonry, Brick Veneer…
  roof_type: string | null;
  roof_year: number | null;
  protection_class: number | null;
  dwelling_value: number | null;
};

export type LineOfBusiness =
  | 'Personal Auto'
  | 'Homeowners'
  | 'Renters'
  | 'Condo'
  | 'Dwelling Fire'
  | 'Umbrella'
  | 'Motorcycle'
  | 'Boat'
  | 'Flood'
  | 'Life'
  | 'Commercial Auto'
  | 'General Liability'
  | 'BOP'
  | 'Workers Comp'
  | 'Commercial Property';

export type PolicyStatus = 'Active' | 'Pending' | 'Cancelled' | 'Expired' | 'Non-Renewed';

export type Coverage = { name: string; limit: string; deductible?: string; premium?: number };

export type Policy = BaseRow & {
  account_id: string;
  policy_number: string;
  carrier: string; // carrier name
  line_of_business: LineOfBusiness;
  status: PolicyStatus;
  effective_date: string;
  expiration_date: string;
  term_months: number;
  premium: number;
  commission_rate: number; // percent, e.g. 12.5
  billing_type: 'Direct Bill' | 'Agency Bill';
  payment_plan: string | null; // Paid in Full, Monthly, Quarterly…
  source: 'Manual' | 'Download' | 'Rater';
  producer: string | null;
  coverages: Coverage[];
  notes: string | null;
};

export type TransactionType = 'New Business' | 'Endorsement' | 'Renewal' | 'Cancellation' | 'Reinstatement' | 'Audit';

export type PolicyTransaction = BaseRow & {
  policy_id: string;
  account_id: string;
  type: TransactionType;
  effective_date: string;
  premium_change: number;
  description: string | null;
};

export type QuoteStatus = 'Draft' | 'Rated' | 'Bound' | 'Lost';

export type CarrierRate = {
  carrier: string;
  premium: number | null; // null when declined
  term_months: number;
  status: 'Quoted' | 'Declined' | 'Error';
  message?: string;
  coverages: Coverage[];
};

export type Quote = BaseRow & {
  account_id: string;
  line_of_business: LineOfBusiness;
  status: QuoteStatus;
  effective_date: string;
  input: Record<string, unknown>; // rating inputs captured by the wizard
  results: CarrierRate[];
  selected_carrier: string | null;
  selected_premium: number | null;
  policy_id: string | null;
};

export type ActivityType = 'Task' | 'Call' | 'Email' | 'Meeting' | 'Note' | 'Renewal Review' | 'Follow-up';
export type ActivityStatus = 'Open' | 'In Progress' | 'Completed';
export type Priority = 'Low' | 'Normal' | 'High';

export type Activity = BaseRow & {
  account_id: string | null;
  policy_id: string | null;
  type: ActivityType;
  subject: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  status: ActivityStatus;
  assigned_to: string | null; // staff name
  completed_at: string | null;
};

export type ClaimStatus = 'Open' | 'Under Review' | 'Paid' | 'Closed' | 'Denied';

export type Claim = BaseRow & {
  account_id: string;
  policy_id: string | null;
  claim_number: string | null;
  date_of_loss: string;
  reported_date: string | null;
  loss_type: string; // Collision, Theft, Water Damage, Wind/Hail…
  description: string | null;
  status: ClaimStatus;
  amount_reserved: number | null;
  amount_paid: number | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
};

export type ESignStatus = 'Pending' | 'Completed' | 'Declined' | 'Expired' | 'Canceled' | 'Failed';

export type DocumentRow = BaseRow & {
  account_id: string | null;
  policy_id: string | null;
  name: string;
  category: string; // Application, ID Card, Declarations, Proof of Insurance, Correspondence, Other
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null; // path in Supabase storage bucket `documents`
  data_url: string | null; // inline content when running in local mode
  esign_status: ESignStatus | null;
  esign_signer_email: string | null;
  esign_sent_at: string | null;
  esign_completed_at: string | null;
};

export type Message = BaseRow & {
  account_id: string;
  channel: 'SMS' | 'Email';
  direction: 'Outbound' | 'Inbound';
  to_address: string | null;
  subject: string | null;
  body: string;
  status: 'Sent' | 'Delivered' | 'Received' | 'Failed';
  read: boolean;
};

export type InvoiceStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Void';

export type Invoice = BaseRow & {
  account_id: string;
  policy_id: string | null;
  invoice_number: string;
  description: string | null;
  amount: number;
  amount_paid: number;
  due_date: string;
  status: InvoiceStatus;
  paid_date: string | null;
  payment_method: string | null;
};

export type Carrier = BaseRow & {
  name: string;
  naic: string | null;
  lines: LineOfBusiness[];
  commission_rate: number;
  phone: string | null;
  website: string | null;
  appointed: boolean;
  downloads_enabled: boolean;
};

export type StaffRole = 'Agency Owner' | 'Admin' | 'Producer' | 'CSR' | 'Account Manager';

export type Staff = BaseRow & {
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  color: string; // avatar color
};

export type AgencySettings = BaseRow & {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  renewal_reminder_days: number;
  current_user_name: string | null; // staff name used as "me"
};

export type TableMap = {
  accounts: Account;
  drivers: Driver;
  vehicles: Vehicle;
  properties: Property;
  policies: Policy;
  policy_transactions: PolicyTransaction;
  quotes: Quote;
  activities: Activity;
  claims: Claim;
  documents: DocumentRow;
  messages: Message;
  invoices: Invoice;
  carriers: Carrier;
  staff: Staff;
  agency_settings: AgencySettings;
};

export type TableName = keyof TableMap;

export const LINES_OF_BUSINESS: LineOfBusiness[] = [
  'Personal Auto', 'Homeowners', 'Renters', 'Condo', 'Dwelling Fire', 'Umbrella', 'Motorcycle', 'Boat', 'Flood', 'Life',
  'Commercial Auto', 'General Liability', 'BOP', 'Workers Comp', 'Commercial Property',
];

export const PERSONAL_LINES: LineOfBusiness[] = LINES_OF_BUSINESS.slice(0, 10);
export const COMMERCIAL_LINES: LineOfBusiness[] = LINES_OF_BUSINESS.slice(10);

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];
