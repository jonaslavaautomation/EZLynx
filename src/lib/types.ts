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
  /** Label ids (see Manage Labels). */
  labels: string[];
  /** When the customer first came to the agency's attention. */
  customer_since: string | null;
  // Commercial business classification (NAICS lookup), used to pre-fill ACORD forms and guide carrier appetite.
  naics_code: string | null;
  sic_code: string | null;
  nature_of_business: string | null;
  naics_description: string | null;
  operations_description: string | null;
  // Personal Lines Applicant info
  prefix: string | null;
  middle_initial: string | null;
  suffix: string | null;
  maiden_name: string | null;
  nickname: string | null;
  gender: string | null;
  /** Only the last four digits are ever stored. */
  ssn_last4: string | null;
  dl_number: string | null;
  dl_status: string | null;
  dl_state: string | null;
  education: string | null;
  industry: string | null;
  occupation_years: number | null;
  prior_employer_years: number | null;
  account_name: string | null;
  preferred_language: string | null;
  vip: boolean;
  phones: ContactPhone[];
  emails: ContactEmail[];
  /** Send the email address to carriers when rating. */
  bridge_email: boolean;
  contact_method: string | null;
  contact_time: string | null;
  // Commercial Applicant info
  phone_ext: string | null;
  fax: string | null;
  website: string | null;
  legal_entity_type: string | null;
  /** Federal tax ID (FEIN) of the business. */
  tax_id: string | null;
  gl_code: string | null;
  date_business_started: string | null;
  // Lead Info
  lead_priority: string | null;
  probability_of_sale: number | null;
  lead_status: string | null;
};

export type ContactPhone = { type: string; number: string };
export type ContactEmail = { type: string; address: string };

export const ADDRESS_TYPES = ['Mailing', 'Residence', 'Billing', 'Garaging', 'Business Location', 'Vacation / Seasonal Home', 'Previous Address'] as const;

export type AccountAddress = BaseRow & {
  account_id: string;
  address_type: string;
  street: string;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Only used for Mailing addresses (international mail). */
  country: string | null;
  is_primary: boolean;
  county: string | null;
  zip_suffix: string | null;
  unit: string | null;
  years_at_address: number | null;
  months_at_address: number | null;
};

/** A person on the account: the primary (named insured), a co-applicant / secondary contact, or another contact. */
export type AccountContact = BaseRow & {
  account_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  dob: string | null;
  is_primary: boolean;
  /** Co-applicant on personal accounts, secondary contact on commercial accounts. */
  is_secondary: boolean;
  client_center_access: boolean;
  // Own address; only used when the contact isn't the primary (the primary uses the account's primary address).
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
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
  /** Set when this policy was created by rewriting (replacing) an earlier policy. */
  rewritten_from_policy_id: string | null;
};

export type TransactionType = 'New Business' | 'Endorsement' | 'Renewal' | 'Cancellation' | 'Reinstatement' | 'Audit' | 'Rewrite';

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
  /** Member of the commission Service Team (paid commissions or tracked on commission reports). */
  service_team: boolean;
  /** External producer (not an employee). */
  external: boolean;
  producer_code: string | null;
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
  email_from_name: string | null;
  email_reply_to: string | null;
  email_footer: string | null;
};

export type ClaimTransactionType = 'Reserve' | 'Payment' | 'Expense' | 'Recovery';

export type ClaimTransaction = BaseRow & {
  claim_id: string;
  account_id: string;
  type: ClaimTransactionType;
  amount: number;
  transaction_date: string;
  description: string | null;
};

export type StatementStatus = 'Open' | 'Reconciled' | 'Posted';

/** A carrier commission statement, entered and reconciled against the book. */
export type CommissionStatement = BaseRow & {
  carrier: string;
  statement_date: string;
  period_start: string | null;
  period_end: string | null;
  total_amount: number;
  status: StatementStatus;
  notes: string | null;
};

export type CommissionStatementLine = BaseRow & {
  statement_id: string;
  policy_id: string | null;
  policy_number: string;
  insured_name: string | null;
  transaction_type: string;
  premium: number;
  commission_amount: number;
};

/** Service Team rule: the share of agency commission a team member earns on matching policies. */
export type CommissionRule = BaseRow & {
  name: string;
  staff_name: string;
  business_type: 'All' | 'New Business' | 'Renewal';
  line_of_business: string | null;
  carrier: string | null;
  split_percent: number;
  active: boolean;
};

export type RecipientFilters = {
  account_type?: AccountType | null;
  statuses?: AccountStatus[];
  lines?: string[];
  producer?: string | null;
  states?: string[];
  has_email?: boolean;
};

export type RecipientList = BaseRow & { name: string; filters: RecipientFilters };

export type CampaignStatus = 'Draft' | 'Scheduled' | 'Sent';

export type EmailCampaign = BaseRow & {
  name: string;
  subject: string;
  body: string;
  recipient_list_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  suppressed_count: number;
};

export type Suppression = BaseRow & { channel: 'Email' | 'SMS'; address: string; reason: string };

export type MessageTemplate = BaseRow & { channel: 'SMS' | 'Email'; name: string; subject: string | null; body: string };

export type MailItem = BaseRow & {
  account_id: string | null;
  direction: 'Inbound' | 'Outbound';
  mail_type: string;
  correspondent: string | null;
  description: string | null;
  mail_date: string;
  status: string;
};

export type ESignTemplate = BaseRow & { name: string; description: string | null; category: string; message: string | null };

export type ReportSchedule = 'Daily' | 'Weekly' | 'Monthly';

export type SavedReport = BaseRow & {
  name: string;
  report_key: string;
  owner: string | null;
  favorite: boolean;
  shared: boolean;
  schedule: ReportSchedule | null;
  schedule_email: string | null;
};

/** Keyed JSON settings (activity, certificate, plugins, email subscriptions, lines of business…). */
export type AppConfig = BaseRow & { key: string; value: Record<string, unknown> };

export type Label = BaseRow & { name: string; color: string; description: string | null };

export type LeadSource = BaseRow & { name: string; is_default: boolean; hidden: boolean };

export type AutomationTrigger = 'Applicant Created' | 'Label Added' | 'Renewal Approaching' | 'Quote Not Bound' | 'Claim Reported' | 'Policy Cancelled';
export type AutomationAction = 'Create Task' | 'Send Email' | 'Send Text' | 'Add Label';

/** One step of an Automation Center workflow; steps run after their delay instead of all at once. */
export type AutomationStep = {
  delay_days: number;
  action: AutomationAction;
  subject?: string;
  body?: string;
  template_id?: string | null;
  assign_to?: string | null; // staff name, or 'producer' / 'csr' of the account
  label_id?: string | null;
  priority?: Priority;
};

export type AutomationWorkflow = BaseRow & {
  name: string;
  trigger: AutomationTrigger;
  trigger_config: { days?: number; label_id?: string | null; lines?: string[] };
  steps: AutomationStep[];
  active: boolean;
};

export type AutomationRun = BaseRow & {
  workflow_id: string;
  account_id: string | null;
  policy_id: string | null;
  step_index: number;
  due_at: string;
  status: 'Pending' | 'Done' | 'Skipped' | 'Failed';
  result: string | null;
};

export type BillingCompany = BaseRow & {
  name: string;
  company_type: string; // Premium Finance, Carrier Direct Bill, MGA / Wholesaler, Agency Bill
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export type Department = BaseRow & { name: string; description: string | null; members: string[] };

/** Carrier Quoting Setup: a carrier needs a login before it can return quotes. Passwords are never stored. */
export type CarrierRatingSetup = BaseRow & {
  carrier: string;
  username: string | null;
  agency_code: string | null;
  login_set: boolean;
  enabled_lines: string[];
  active: boolean;
};

export type FormTemplate = BaseRow & { name: string; form_type: string; fields: Record<string, string> };

export type ProposalTemplate = BaseRow & {
  name: string;
  template_type: 'Proposal' | 'SOI';
  intro: string | null;
  closing: string | null;
  disclaimer: string | null;
  include_coverages: boolean;
  include_premium: boolean;
  is_default: boolean;
};

export type TicketMessage = { from: 'user' | 'support' | 'assistant'; author: string; body: string; at: string };

export type SupportTicket = BaseRow & {
  subject: string;
  category: string;
  priority: Priority;
  status: 'Open' | 'Pending' | 'Resolved' | 'Closed';
  requester: string | null;
  messages: TicketMessage[];
};

export type TrainingProgress = BaseRow & { staff_name: string; lesson_key: string; completed_at: string };

export type TrainingRegistration = BaseRow & { session_key: string; staff_name: string };

export type Integration = BaseRow & {
  integration_key: string;
  status: 'Setup Required' | 'Active' | 'Paused';
  config: Record<string, string>;
  activated_by: string | null;
};

/** Per-user settings (User Settings page). Password and TOTP fields drive the training-grade sign-in screen. */
export type UserSettings = BaseRow & {
  staff_name: string;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  role_detail: string | null;
  preferences: Record<string, unknown>;
  acord: Record<string, unknown>;
  /** Sanitized HTML. */
  email_signature: string | null;
  reply_to: string | null;
  signature_insert: 'auto' | 'smart_tag';
  signature_global_default: boolean;
  display_global: boolean;
  password_hash: string | null;
  password_salt: string | null;
  password_updated_at: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
};

export type LoginEvent = BaseRow & {
  staff_name: string;
  event: string; // User Login, User Logout, Failed Login, Password Changed, Two-Factor Enabled…
  ip: string | null;
  user_agent: string | null;
  trusted: boolean;
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
  claim_transactions: ClaimTransaction;
  commission_statements: CommissionStatement;
  commission_statement_lines: CommissionStatementLine;
  commission_rules: CommissionRule;
  recipient_lists: RecipientList;
  email_campaigns: EmailCampaign;
  suppressions: Suppression;
  message_templates: MessageTemplate;
  mail_items: MailItem;
  esign_templates: ESignTemplate;
  saved_reports: SavedReport;
  app_config: AppConfig;
  labels: Label;
  lead_sources: LeadSource;
  automation_workflows: AutomationWorkflow;
  automation_runs: AutomationRun;
  billing_companies: BillingCompany;
  departments: Department;
  carrier_rating_setup: CarrierRatingSetup;
  form_templates: FormTemplate;
  proposal_templates: ProposalTemplate;
  support_tickets: SupportTicket;
  training_progress: TrainingProgress;
  training_registrations: TrainingRegistration;
  integrations: Integration;
  account_addresses: AccountAddress;
  account_contacts: AccountContact;
  user_settings: UserSettings;
  login_events: LoginEvent;
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
