/**
 * Marketplace catalog: the integration listings trainees can browse and "activate".
 *
 * Vendors are well-known companies listed in their real product categories and described generically.
 * Nothing here implies a partnership, and activating a listing only records the setup in this system.
 */

export const CATEGORIES = [
  'eSignature',
  'Texting & Voice',
  'Email Marketing',
  'Payments & Premium Finance',
  'Data Prefill & Intake',
  'Automation',
  'Accounting',
  'Carrier Downloads',
  'Document Management',
  'Websites & Lead Capture',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type SetupField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** Rendered as a password input; the value is never saved — only a "configured" flag. */
  secret?: boolean;
};

export type CatalogItem = {
  key: string;
  name: string;
  vendor: string;
  category: Category;
  /** Tile color for the listing's monogram. */
  color: string;
  short: string;
  long: string;
  features: string[];
  fields: SetupField[];
  docsNote: string;
};

const ENV = ['Sandbox / Test', 'Production'];

export const CATALOG: CatalogItem[] = [
  // ── eSignature ──
  {
    key: 'docusign', name: 'DocuSign eSignature', vendor: 'DocuSign', category: 'eSignature', color: '#4c00ff',
    short: 'Send applications, proposals and forms for electronic signature.',
    long: 'Route insurance applications, signed proposals, cancellation requests and other agency forms to clients for electronic signature. Completed envelopes are typically filed back to the client record so producers can see what was signed and when.',
    features: ['Send documents from a client record', 'Track envelope status (sent, viewed, completed)', 'File completed documents automatically', 'Reusable signing templates'],
    fields: [
      { key: 'account_email', label: 'Account admin email', type: 'email', required: true, placeholder: 'admin@agency.com' },
      { key: 'account_id', label: 'Account ID', type: 'text', required: true, placeholder: 'e.g. 1234567' },
      { key: 'environment', label: 'Environment', type: 'select', required: true, options: ENV },
      { key: 'api_key', label: 'Integration key', type: 'text', secret: true, required: true, hint: 'Never stored here — only marked as configured.' },
    ],
    docsNote: 'The account admin usually generates the integration key in the vendor’s admin console. Start in a sandbox account and switch to production after a test envelope completes.',
  },
  {
    key: 'adobe-sign', name: 'Adobe Acrobat Sign', vendor: 'Adobe', category: 'eSignature', color: '#b30b00',
    short: 'Collect e-signatures on PDFs directly from the client record.',
    long: 'Prepare PDF forms with signature and initial fields and send them to one or more signers. Signed copies return as PDFs for the client’s document file.',
    features: ['Multi-signer routing', 'Signature and initial fields on PDFs', 'Reminder emails to signers', 'Audit trail on completed documents'],
    fields: [
      { key: 'account_email', label: 'Account admin email', type: 'email', required: true },
      { key: 'region', label: 'Data region', type: 'select', required: true, options: ['North America', 'Europe', 'Asia Pacific'] },
      { key: 'client_secret', label: 'Client secret', type: 'text', secret: true, required: true },
    ],
    docsNote: 'Create an API application in the vendor’s account settings and choose the same data region as your account.',
  },

  // ── Texting & Voice ──
  {
    key: 'twilio', name: 'Twilio SMS', vendor: 'Twilio', category: 'Texting & Voice', color: '#f22f46',
    short: 'Two-way business texting from a dedicated agency number.',
    long: 'Send and receive SMS with clients from an agency phone number: payment reminders, renewal notices, ID card requests and quick questions. Conversations are logged against the matching client.',
    features: ['Two-way SMS from an agency number', 'Opt-out (STOP) handling', 'Message templates for reminders', 'Conversation history on the client record'],
    fields: [
      { key: 'account_sid', label: 'Account SID', type: 'text', required: true, placeholder: 'AC…' },
      { key: 'from_number', label: 'Sending phone number', type: 'text', required: true, placeholder: '(555) 555-0100' },
      { key: 'auth_token', label: 'Auth token', type: 'text', secret: true, required: true },
    ],
    docsNote: 'Business texting in the US generally requires carrier registration (10DLC) of the brand and campaign before messages are delivered reliably.',
  },
  {
    key: 'ringcentral', name: 'RingCentral', vendor: 'RingCentral', category: 'Texting & Voice', color: '#ff7a00',
    short: 'Click-to-call, call logging and business SMS.',
    long: 'Place calls from a client’s phone number with one click, log call notes as activities, and text from the agency’s business line.',
    features: ['Click-to-call from phone numbers', 'Automatic call logging', 'Business SMS', 'Voicemail notifications'],
    fields: [
      { key: 'main_number', label: 'Main company number', type: 'text', required: true },
      { key: 'admin_email', label: 'Admin email', type: 'email', required: true },
      { key: 'log_calls', label: 'Log calls as activities', type: 'select', required: true, options: ['All calls', 'Outbound only', 'Do not log'] },
    ],
    docsNote: 'Each user usually signs in with their own phone-system login the first time they place a call.',
  },

  // ── Email Marketing ──
  {
    key: 'mailchimp', name: 'Mailchimp', vendor: 'Intuit Mailchimp', category: 'Email Marketing', color: '#d4a106',
    short: 'Sync client lists for newsletters and marketing campaigns.',
    long: 'Keep an audience in sync with your client and prospect lists so marketing can send newsletters, cross-sell campaigns and seasonal reminders. Unsubscribes flow back so suppressed contacts are not emailed.',
    features: ['Audience sync from client lists', 'Tag contacts by line of business', 'Unsubscribe sync', 'Campaign reporting'],
    fields: [
      { key: 'audience', label: 'Audience name', type: 'text', required: true, placeholder: 'Agency clients' },
      { key: 'sync', label: 'Sync frequency', type: 'select', required: true, options: ['Hourly', 'Daily', 'Weekly'] },
      { key: 'api_key', label: 'API key', type: 'text', secret: true, required: true },
    ],
    docsNote: 'Only contacts who have agreed to marketing email should be synced. Transactional notices (e.g. billing) belong in the Communication Center instead.',
  },
  {
    key: 'constant-contact', name: 'Constant Contact', vendor: 'Constant Contact', category: 'Email Marketing', color: '#1856ed',
    short: 'Email newsletters and event invitations for your book of business.',
    long: 'Push contact lists for newsletters, client appreciation events and holiday greetings, and pull back open and click activity.',
    features: ['List sync', 'Newsletter templates', 'Event invitations', 'Open and click tracking'],
    fields: [
      { key: 'account_email', label: 'Account email', type: 'email', required: true },
      { key: 'default_list', label: 'Default list', type: 'text', required: true },
    ],
    docsNote: 'Sign in with the account owner the first time so the list names can be matched.',
  },

  // ── Payments & Premium Finance ──
  {
    key: 'stripe', name: 'Stripe Payments', vendor: 'Stripe', category: 'Payments & Premium Finance', color: '#635bff',
    short: 'Accept card and ACH payments for agency-billed invoices.',
    long: 'Email clients a payment link for agency-billed invoices and fees. Successful payments can be matched back to the invoice so accounting sees what was collected.',
    features: ['Payment links on invoices', 'Card and ACH', 'Automatic receipt emails', 'Payout reporting'],
    fields: [
      { key: 'account_email', label: 'Account email', type: 'email', required: true },
      { key: 'mode', label: 'Mode', type: 'select', required: true, options: ['Test mode', 'Live mode'] },
      { key: 'secret_key', label: 'Secret key', type: 'text', secret: true, required: true },
    ],
    docsNote: 'Card surcharges and convenience fees are regulated differently by state — confirm your agency’s policy before enabling them.',
  },
  {
    key: 'epaypolicy', name: 'ePayPolicy', vendor: 'ePayPolicy', category: 'Payments & Premium Finance', color: '#0f766e',
    short: 'Insurance-focused online payments for premiums and fees.',
    long: 'A payment portal built for insurance agencies: clients pay premiums, deposits and fees online, and funds can be split between agency and carrier trust accounts.',
    features: ['Branded payment page', 'Trust and operating account routing', 'Card and ACH', 'Payment notifications'],
    fields: [
      { key: 'portal_url', label: 'Payment page URL', type: 'url', required: true, placeholder: 'https://…' },
      { key: 'deposit_account', label: 'Default deposit account', type: 'select', required: true, options: ['Trust account', 'Operating account'] },
    ],
    docsNote: 'Premium collected on behalf of carriers generally must go to a trust (fiduciary) account.',
  },

  // ── Data Prefill & Intake ──
  {
    key: 'canopy-connect', name: 'Canopy Connect', vendor: 'Canopy Connect', category: 'Data Prefill & Intake', color: '#0ea5e9',
    short: 'Clients share current policy details to prefill quotes.',
    long: 'Send a prospect a link to securely share their current insurance information. Declarations data such as drivers, vehicles, coverages and prior carrier can then prefill the applicant and quote.',
    features: ['Shareable intake link', 'Imports drivers, vehicles and coverages', 'Prior carrier and expiration date', 'Prefill new applicants'],
    fields: [
      { key: 'team_name', label: 'Team name', type: 'text', required: true },
      { key: 'intake_url', label: 'Public intake link', type: 'url', required: true, placeholder: 'https://…' },
      { key: 'notify_email', label: 'Notify on new pull', type: 'email', required: true },
      { key: 'api_secret', label: 'API secret', type: 'text', secret: true },
    ],
    docsNote: 'Always review prefilled data with the client — imported coverages reflect the prior policy, not what they need now.',
  },
  {
    key: 'typeform', name: 'Typeform Intake', vendor: 'Typeform', category: 'Data Prefill & Intake', color: '#262627',
    short: 'Conversational online forms for new-client intake.',
    long: 'Publish a quote request form on your website or social pages. Each submission can create a prospect with the answers attached for the producer to follow up.',
    features: ['Quote request forms', 'Create prospects from submissions', 'Assign to a producer', 'Email alert on submission'],
    fields: [
      { key: 'form_url', label: 'Form URL', type: 'url', required: true },
      { key: 'assign_to', label: 'Assign new prospects to', type: 'select', required: true, options: ['Round robin', 'Agency owner', 'Unassigned'] },
    ],
    docsNote: 'Avoid collecting SSNs or driver’s license numbers in open web forms.',
  },

  // ── Automation ──
  {
    key: 'zapier', name: 'Zapier', vendor: 'Zapier', category: 'Automation', color: '#ff4f00',
    short: 'Connect agency events to thousands of apps with no code.',
    long: 'Trigger workflows when things happen in the agency — a new prospect, a bound policy, a completed activity — and send the data to other tools such as spreadsheets, chat or a CRM.',
    features: ['Triggers on new accounts and policies', 'No-code multi-step workflows', 'Webhook support', 'Run history'],
    fields: [
      { key: 'account_email', label: 'Account email', type: 'email', required: true },
      { key: 'webhook_url', label: 'Catch hook URL', type: 'url', required: true, placeholder: 'https://hooks…' },
    ],
    docsNote: 'Test each workflow with a sample record first; automations run on real client data once turned on.',
  },
  {
    key: 'make', name: 'Make', vendor: 'Make', category: 'Automation', color: '#6d00cc',
    short: 'Visual scenario builder for advanced automations.',
    long: 'Build visual scenarios that move data between the agency system and other apps, with branching, filters and scheduling.',
    features: ['Visual scenario builder', 'Scheduling', 'Filters and routers', 'Error handling'],
    fields: [
      { key: 'organization', label: 'Organization', type: 'text', required: true },
      { key: 'webhook_url', label: 'Webhook URL', type: 'url', required: true },
    ],
    docsNote: 'Scenario operations are usually metered by the vendor plan.',
  },

  // ── Accounting ──
  {
    key: 'quickbooks-online', name: 'QuickBooks Online', vendor: 'Intuit', category: 'Accounting', color: '#2ca01c',
    short: 'Post commission and agency-bill entries to your general ledger.',
    long: 'Export deposits, commission receipts and agency-bill transactions to the agency’s general ledger so the bookkeeper does not re-key them.',
    features: ['Journal entry export', 'Map income and trust accounts', 'Deposit sync', 'Daily or on-demand export'],
    fields: [
      { key: 'company', label: 'Company name', type: 'text', required: true },
      { key: 'income_account', label: 'Commission income account', type: 'text', required: true, placeholder: '4000 Commission Income' },
      { key: 'export', label: 'Export schedule', type: 'select', required: true, options: ['Daily', 'Weekly', 'On demand'] },
    ],
    docsNote: 'Have your accountant confirm the chart-of-accounts mapping before the first export.',
  },
  {
    key: 'xero', name: 'Xero', vendor: 'Xero', category: 'Accounting', color: '#13b5ea',
    short: 'Cloud accounting sync for invoices and receipts.',
    long: 'Send agency invoices and receipts to cloud accounting and keep payment status in sync.',
    features: ['Invoice export', 'Payment status sync', 'Account mapping'],
    fields: [
      { key: 'organisation', label: 'Organisation', type: 'text', required: true },
      { key: 'admin_email', label: 'Admin email', type: 'email', required: true },
    ],
    docsNote: 'An adviser or standard user role is typically needed to authorise the connection.',
  },

  // ── Carrier Downloads ──
  {
    key: 'ivans-download', name: 'IVANS Download', vendor: 'IVANS', category: 'Carrier Downloads', color: '#003b71',
    short: 'Receive policy, claim and commission downloads from carriers.',
    long: 'Carriers send policy changes, renewals, claims and commission statements electronically. Downloads keep the policy records current without manual entry.',
    features: ['Policy and endorsement downloads', 'Claim downloads', 'Commission statement downloads', 'Per-carrier activation'],
    fields: [
      { key: 'account_number', label: 'Agency account number', type: 'text', required: true },
      { key: 'mailbox', label: 'Mailbox ID', type: 'text', required: true },
      { key: 'contact_email', label: 'Download contact email', type: 'email', required: true },
    ],
    docsNote: 'Downloads are requested carrier by carrier; each carrier needs your agency code on file before it starts sending.',
  },

  // ── Document Management ──
  {
    key: 'box', name: 'Box', vendor: 'Box', category: 'Document Management', color: '#0061d5',
    short: 'Store client documents in secure cloud folders.',
    long: 'Mirror each client’s documents to a cloud folder with retention policies and access controls managed by the agency.',
    features: ['Folder per client', 'Retention policies', 'Version history', 'Shared links with expiration'],
    fields: [
      { key: 'root_folder', label: 'Root folder name', type: 'text', required: true, placeholder: 'Agency Clients' },
      { key: 'admin_email', label: 'Admin email', type: 'email', required: true },
    ],
    docsNote: 'Check your state’s record-retention requirements before setting retention policies.',
  },
  {
    key: 'google-drive', name: 'Google Drive', vendor: 'Google', category: 'Document Management', color: '#1a73e8',
    short: 'Save generated forms and proposals to a shared drive.',
    long: 'Save proposals, ACORD forms and signed documents to a shared drive the whole team can reach.',
    features: ['Shared drive storage', 'Folder per client', 'Search across documents'],
    fields: [
      { key: 'shared_drive', label: 'Shared drive name', type: 'text', required: true },
      { key: 'workspace_domain', label: 'Workspace domain', type: 'text', required: true, placeholder: 'agency.com' },
    ],
    docsNote: 'A workspace administrator usually approves third-party access first.',
  },

  // ── Websites & Lead Capture ──
  {
    key: 'calendly', name: 'Calendly', vendor: 'Calendly', category: 'Websites & Lead Capture', color: '#006bff',
    short: 'Let prospects book a review or quote appointment online.',
    long: 'Share a booking link for policy reviews and quote calls. Booked meetings can become activities on the producer’s calendar.',
    features: ['Online booking link', 'Round-robin across producers', 'Reminder emails', 'Creates calendar activities'],
    fields: [
      { key: 'booking_url', label: 'Booking page URL', type: 'url', required: true, placeholder: 'https://…' },
      { key: 'event_type', label: 'Event type', type: 'select', required: true, options: ['Policy review (30 min)', 'Quote call (15 min)', 'Consultation (60 min)'] },
    ],
    docsNote: 'Connect each producer’s calendar so booked times do not overlap existing appointments.',
  },
  {
    key: 'wordpress-forms', name: 'WordPress Web Forms', vendor: 'WordPress', category: 'Websites & Lead Capture', color: '#21759b',
    short: 'Turn website quote-request forms into new prospects.',
    long: 'Post quote-request submissions from the agency website to create prospects automatically, with the source recorded for marketing reporting.',
    features: ['Website form to prospect', 'Lead source tracking', 'Spam filtering', 'Email notification'],
    fields: [
      { key: 'site_url', label: 'Website URL', type: 'url', required: true, placeholder: 'https://www.agency.com' },
      { key: 'lead_source', label: 'Lead source label', type: 'text', required: true, placeholder: 'Website' },
      { key: 'notify_email', label: 'Notification email', type: 'email' },
    ],
    docsNote: 'Add a consent checkbox if the form will be used for marketing follow-up.',
  },
];

export const CATALOG_BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));

/** Config key that records a secret field was entered (the value itself is never stored). */
export const secretFlag = (fieldKey: string) => `${fieldKey}__configured`;

/** Config key holding when the integration was activated. */
export const ACTIVATED_AT = '_activated_at';
