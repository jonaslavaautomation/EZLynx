/*
 * Knowledge base: short, task-focused articles about this system's real screens.
 * Inline markup in text: **bold** and [label](/app/path) links (rendered by <RichText>).
 */

export type KbBlock = { h: string } | { p: string } | { steps: string[] } | { list: string[] } | { note: string };

export type KbArticle = {
  slug: string;
  title: string;
  category: KbCategory;
  summary: string;
  tags: string[];
  body: KbBlock[];
  /** Screens this article is about, shown as "Open in the app" buttons. */
  links: { label: string; to: string }[];
  popular?: boolean;
};

export const KB_CATEGORIES = [
  'Getting Started',
  'Applicants & Quoting',
  'Policy Servicing',
  'Claims',
  'Documents & eSignature',
  'Communication Center',
  'Commissions & Accounting',
  'Reports',
  'Settings & Administration',
  'Data & Integrations',
] as const;
export type KbCategory = (typeof KB_CATEGORIES)[number];

export const KB_ARTICLES: KbArticle[] = [
  {
    slug: 'first-day-checklist',
    title: 'Your first day: setting who you are and finding your work',
    category: 'Getting Started',
    summary: 'Choose the staff member you act as, then find your tasks, renewals and recent applicants.',
    tags: ['acting as', 'me', 'current user', 'tasks', 'home page', 'navigation', 'menu'],
    popular: true,
    body: [
      { p: 'Everything assigned to "me" (tasks, tickets, training progress) follows the staff member selected as the current user.' },
      { steps: [
        'Open [Settings → Agency Profile](/settings?tab=agency) and pick your name under **Acting as**, then save.',
        'Go to the [Home Page](/) to see tasks due today and overdue for you.',
        'Hover (or tap) the icons in the dark left rail to open each menu. Every entry opens a working screen.',
        'Use the search bar at the top (press **/**) to find a client by name, phone or email before creating anything.',
      ] },
      { note: 'Golden rule: always search before you create, so you never add a duplicate applicant.' },
    ],
    links: [{ label: 'Agency Profile', to: '/settings?tab=agency' }, { label: 'Home Page', to: '/' }, { label: 'Getting Started guide', to: '/help?section=getting-started' }],
  },
  {
    slug: 'create-applicant',
    title: 'Creating a personal or commercial applicant',
    category: 'Applicants & Quoting',
    summary: 'Add a household or business, assign producer/CSR and lead source, then add drivers, vehicles and property.',
    tags: ['applicant', 'account', 'client', 'prospect', 'new', 'create', 'household', 'business', 'commercial', 'lead source'],
    popular: true,
    body: [
      { steps: [
        'Search first. If the client is not found, open **Applicants → Create New Applicant** (or **Create Commercial Applicant** for a business).',
        'Enter the name, contact details and address. Set **Status** to Prospect until a policy is bound.',
        'Assign the **Producer** and **CSR**, and choose a **Lead Source** so reports can credit the marketing channel.',
        'Save. On the applicant, open the **Drivers, Vehicles & Property** tab and add every household driver, vehicle and dwelling.',
      ] },
      { p: 'Commercial applicants use the business name as the display name. Labels (Settings → Manage Labels) can be added to group applicants and trigger automations.' },
    ],
    links: [{ label: 'Create New Applicant', to: '/accounts?new=Personal' }, { label: 'Create Commercial Applicant', to: '/accounts?new=Commercial' }, { label: 'List Applicants', to: '/accounts' }],
  },
  {
    slug: 'quote-and-bind',
    title: 'Quoting with the comparative rater and binding a policy',
    category: 'Applicants & Quoting',
    summary: 'Enter the risk once, rate all set-up carriers side by side, then Select & bind to create the policy.',
    tags: ['quote', 'rater', 'rating', 'bind', 'carrier', 'premium', 'comparative', 'quick quote', 'wizard'],
    popular: true,
    body: [
      { steps: [
        'Open the applicant and confirm drivers (DOB, license, violations, accidents) and vehicles (year, make, model, VIN).',
        'Click **New quote** (or **Quick Quote** in the top bar). The wizard pre-fills from the applicant.',
        'Step through Applicant → Risk details → Coverages → Carriers. Choose limits and deductibles on Coverages.',
        'Select carriers and click **Rate**. Expand a carrier to see coverage-level premiums; declined carriers show the reason.',
        'Click **Select & bind** on the chosen carrier, confirm the effective date and billing, and the policy is created.',
      ] },
      { note: 'Rates in this training system come from a built-in rating model, not live carrier connections.' },
      { p: 'A carrier only returns quotes when it has a login saved under [Carrier Quoting Setup](/admin/carrier-quoting).' },
    ],
    links: [{ label: 'Start a quote', to: '/quotes/new' }, { label: 'Completed Quotes', to: '/quotes?status=Rated' }, { label: 'Quoting walkthrough', to: '/help?section=quoting' }],
  },
  {
    slug: 'endorsements',
    title: 'Endorsing a policy (mid-term changes)',
    category: 'Policy Servicing',
    summary: 'Record a mid-term change with an effective date and premium change; it lands on the policy history.',
    tags: ['endorse', 'endorsement', 'change', 'add vehicle', 'deductible', 'mid-term', 'transaction'],
    body: [
      { steps: [
        'Open the policy from the applicant\'s Policies tab or [All Policies](/policies).',
        'Click **Endorse**. Enter the **Effective date**, a **Description of change** and the **Premium change (±)**.',
        'Optionally tick **Invoice the additional premium** for agency-billed policies.',
        'Save. The transaction appears on the policy History tab and in [Policy Transactions](/policy-mgmt/transactions).',
      ] },
      { p: 'Update the coverages grid on the policy too, so the declarations match what the carrier issued.' },
    ],
    links: [{ label: 'All Policies', to: '/policies' }, { label: 'Policy Transactions', to: '/policy-mgmt/transactions' }],
  },
  {
    slug: 'renewals',
    title: 'Working the renewals queue',
    category: 'Policy Servicing',
    summary: 'Review policies expiring inside the renewal window, then Renew or Remarket.',
    tags: ['renewal', 'renew', 'remarket', 'expiring', 'retention', 'queue', 'reminder days'],
    popular: true,
    body: [
      { p: 'The [Renewals Queue](/policies?view=renewals) lists policies expiring within the renewal window set in Agency Profile (renewal reminder days).' },
      { steps: [
        'Open each policy and compare the renewal premium with the current term.',
        'If the increase is acceptable, click **Renew**, confirm the new dates and renewal premium.',
        'If it went up significantly, use **More actions → Remarket** to start a new quote for the same line.',
        'Log a call or email activity so the team can see the client was contacted.',
      ] },
    ],
    links: [{ label: 'Renewals Queue', to: '/policies?view=renewals' }, { label: 'Servicing guide', to: '/help?section=servicing' }],
  },
  {
    slug: 'cancel-reinstate',
    title: 'Cancellations, reinstatements, non-renewals and rewrites',
    category: 'Policy Servicing',
    summary: 'Cancel with a pro-rata return premium, reinstate within the term, non-renew, or rewrite into a new policy.',
    tags: ['cancel', 'cancellation', 'reinstate', 'non-renew', 'rewrite', 'return premium', 'pro-rata', 'audit'],
    body: [
      { list: [
        '**Cancel** — enter the cancellation date and reason; use **Use pro-rata** to calculate the return premium.',
        '**Reinstate** — reverses a cancellation within the term; enter the reinstatement date and premium reinstated.',
        '**Non-renew** — the policy stays in force until expiration, then ends.',
        '**Audit** — record an audit premium adjustment (common for Workers Comp and GL).',
        '**Rewrite** — replace a policy with a new one (new number or carrier); the link is kept under [Policy Rewrites](/policy-mgmt/rewrites).',
      ] },
      { note: 'Every transaction is written to the policy History tab and logged as an activity.' },
    ],
    links: [{ label: 'Policy Rewrites', to: '/policy-mgmt/rewrites' }, { label: 'All Policies', to: '/policies' }],
  },
  {
    slug: 'claims-fnol',
    title: 'Reporting a claim (first notice of loss)',
    category: 'Claims',
    summary: 'Record the loss, attach it to the policy, and track reserves and payments.',
    tags: ['claim', 'fnol', 'first notice of loss', 'loss', 'adjuster', 'reserve', 'payment', 'accident'],
    popular: true,
    body: [
      { steps: [
        'Open [Claims](/claims) and click **Report Claim** (or use the **+** menu in the top bar).',
        'Choose the account and policy, the **Date of Loss**, **Loss Type** and a clear description of what happened.',
        'Add the carrier **Claim Number** and adjuster details when the carrier provides them.',
        'Save. A follow-up task is created automatically.',
      ] },
      { p: 'Record reserves, payments, expenses and recoveries under [Claim Transactions](/policy-mgmt/claim-transactions).' },
    ],
    links: [{ label: 'Claims', to: '/claims' }, { label: 'Claim Transactions', to: '/policy-mgmt/claim-transactions' }],
  },
  {
    slug: 'documents-esignature',
    title: 'Uploading documents and sending for eSignature',
    category: 'Documents & eSignature',
    summary: 'Upload files to an applicant or policy, categorize them, and track signature envelopes.',
    tags: ['document', 'upload', 'file', 'esignature', 'signature', 'sign', 'envelope', 'template', 'id card'],
    body: [
      { steps: [
        'Open the applicant\'s Documents tab or the agency [Documents](/documents) library and click **Upload**.',
        'Pick a category (Application, ID Card, Declarations, Proof of Insurance, Correspondence, Other).',
        'To request a signature, choose **Send for eSignature**, enter the signer name and email and a message.',
        'Track envelopes (Pending, Completed, Declined, Expired, Canceled) and **Resend** or void as needed.',
      ] },
      { note: 'No signature provider is connected in this training system; signing is simulated on the document.' },
      { p: 'Reusable messages live in [eSignature Templates](/comm/esign-templates). In browser-storage mode, files must be under 1.5 MB.' },
    ],
    links: [{ label: 'Documents', to: '/documents' }, { label: 'eSignature Templates', to: '/comm/esign-templates' }],
  },
  {
    slug: 'texting-clients',
    title: 'Texting and emailing clients',
    category: 'Communication Center',
    summary: 'Send SMS or email from an applicant, use templates, log inbound replies, and respect opt-outs.',
    tags: ['text', 'sms', 'message', 'email', 'template', 'reply', 'opt-out', 'stop', 'conversation'],
    popular: true,
    body: [
      { steps: [
        'Open [Calls and Messages](/messages) and click **New message**, or use the applicant\'s Messages tab.',
        'Pick the channel (SMS or Email). Use **Insert template** for common messages from [Text Templates](/comm/templates).',
        'Send. Replies the client sent outside the system can be recorded with **Log reply**.',
      ] },
      { p: 'Numbers and addresses on the [Suppression List](/comm/suppression?channel=SMS) are never contacted — the send is blocked with an explanation.' },
      { note: 'Messages are logged but not delivered until a texting/email provider is connected under Marketplace.' },
    ],
    links: [{ label: 'Calls and Messages', to: '/messages' }, { label: 'Text Templates', to: '/comm/templates' }],
  },
  {
    slug: 'email-campaigns',
    title: 'Email campaigns, recipient lists and suppression lists',
    category: 'Communication Center',
    summary: 'Build a recipient list from filters, write the campaign, then send now or schedule it.',
    tags: ['campaign', 'bulk email', 'newsletter', 'recipient list', 'suppression', 'unsubscribe', 'bounce', 'schedule'],
    body: [
      { steps: [
        'Create a [Recipient List](/comm/lists) with filters (status, account type, lines, producer, state, has email).',
        'Open [New Campaign](/comm/campaigns/new), choose the list, and write the subject and body. Merge fields like {first_name} are supported.',
        'Click **Send now** or set **Send at** to schedule. Drafts can be saved and edited later.',
      ] },
      { p: 'Anyone on the Email [Suppression List](/comm/suppression?channel=Email) (unsubscribed, bounced or manually added) is skipped and counted as suppressed on the campaign.' },
      { p: 'The From name, reply-to address and footer are set in [Communication Center Settings](/comm/settings).' },
    ],
    links: [{ label: 'Campaigns', to: '/comm/campaigns' }, { label: 'Recipient Lists', to: '/comm/lists' }, { label: 'Suppression List', to: '/comm/suppression?channel=Email' }],
  },
  {
    slug: 'commission-statements',
    title: 'Entering and reconciling carrier commission statements',
    category: 'Commissions & Accounting',
    summary: 'Enter a statement, auto-match its lines to policies, reconcile, then post.',
    tags: ['commission', 'statement', 'reconcile', 'post', 'carrier', 'auto-match', 'csv', 'accounting'],
    popular: true,
    body: [
      { steps: [
        'Open [Statements](/policy-mgmt/statements) and click **New statement**. Enter the carrier, statement date, period and total.',
        'Add lines manually or **Import CSV**. Each line has a policy number, insured, transaction type, premium and commission.',
        'Click **Auto-match** to link lines to policies by policy number; fix any unmatched lines.',
        'When the line total equals the statement total, click **Mark Reconciled**, then **Post**.',
      ] },
      { p: 'Posted commission flows into the commission reports and is split among the Service Team by the rules below.' },
    ],
    links: [{ label: 'Statements', to: '/policy-mgmt/statements' }, { label: 'Commission reports', to: '/reports?category=commission' }],
  },
  {
    slug: 'service-team-rules',
    title: 'Service Team rules: splitting commission among staff',
    category: 'Commissions & Accounting',
    summary: 'Define who earns what share of agency commission by business type, line and carrier.',
    tags: ['service team', 'rules', 'split', 'producer', 'csr', 'commission split', 'external producer'],
    body: [
      { p: 'Only staff marked as Service Team members are paid commission or tracked on commission reports. Manage them under [Manage Service Team](/policy-mgmt/team).' },
      { steps: [
        'Open [Service Team Rules](/policy-mgmt/rules) and click **New rule**.',
        'Choose the team member, business type (All, New Business, Renewal), and optionally a line and carrier.',
        'Enter the **Split %** — the share of agency commission this person earns on matching policies.',
      ] },
      { note: 'Keep rules specific: a rule limited to a carrier or line is easier to audit than one broad rule.' },
    ],
    links: [{ label: 'Service Team Rules', to: '/policy-mgmt/rules' }, { label: 'Manage Service Team', to: '/policy-mgmt/team' }],
  },
  {
    slug: 'reports-5',
    title: 'Reports 5.0: favorites, saved, scheduled and shared reports',
    category: 'Reports',
    summary: 'Run any report, filter it, then favorite, save, share or schedule it.',
    tags: ['report', 'reports', 'favorite', 'schedule', 'share', 'saved', 'export', 'csv', 'book of business'],
    popular: true,
    body: [
      { steps: [
        'Browse [All Reports](/reports?view=all) or pick a category such as Book of Business, Commission or Policy Transaction.',
        'Open a report and adjust its filters. Export to CSV or print.',
        'Click the star to add it to [Favorite Reports](/reports?view=favorites).',
        'Use **Save as…** for a named copy, **Share** it with the team, or **Schedule…** daily, weekly or monthly.',
      ] },
      { note: 'Scheduled email delivery is simulated in this training system.' },
    ],
    links: [{ label: 'All Reports', to: '/reports?view=all' }, { label: 'Reports guide', to: '/help?section=reports' }],
  },
  {
    slug: 'labels-lead-sources',
    title: 'Managing labels and lead sources',
    category: 'Settings & Administration',
    summary: 'Labels group applicants and drive automations; lead sources can be hidden but not renamed.',
    tags: ['label', 'labels', 'tag', 'lead source', 'marketing', 'settings', 'admin'],
    body: [
      { p: '[Manage Labels](/admin/labels) creates colored labels (e.g. "VIP", "Needs umbrella"). Add labels on the applicant to filter lists and to trigger Automation Center workflows.' },
      { p: '[Manage Lead Sources](/admin/lead-sources) controls the Lead Source picker on applicants. Once added, a source can be hidden (so it is no longer offered) but not renamed, which keeps historical reporting accurate.' },
    ],
    links: [{ label: 'Manage Labels', to: '/admin/labels' }, { label: 'Manage Lead Sources', to: '/admin/lead-sources' }],
  },
  {
    slug: 'automation-center',
    title: 'Automation Center: workflows with timed steps',
    category: 'Settings & Administration',
    summary: 'Trigger tasks, emails, texts or labels when applicants are created, renewals approach and more.',
    tags: ['automation', 'workflow', 'trigger', 'drip', 'task', 'follow-up', 'renewal approaching', 'quote not bound'],
    body: [
      { p: 'A workflow has one trigger (Applicant Created, Label Added, Renewal Approaching, Quote Not Bound, Claim Reported, Policy Cancelled) and one or more steps.' },
      { list: [
        'Each step waits its delay (in days) and then runs one action: Create Task, Send Email, Send Text or Add Label.',
        'Tasks can be assigned to a staff member or to the account\'s producer or CSR.',
        'Pausing a workflow stops future steps; steps already run are kept in its history.',
      ] },
    ],
    links: [{ label: 'Automation Center', to: '/admin/automation' }],
  },
  {
    slug: 'carrier-quoting-setup',
    title: 'Carrier Quoting Setup: enabling carriers in the rater',
    category: 'Settings & Administration',
    summary: 'A carrier needs a saved login and enabled lines before it can return quotes.',
    tags: ['carrier', 'quoting setup', 'rater', 'login', 'credentials', 'agency code', 'appointed', 'markets'],
    popular: true,
    body: [
      { steps: [
        'Make sure the carrier exists and is appointed under [Manage Carriers/Markets](/settings?tab=carriers).',
        'Open [Carrier Quoting Setup](/admin/carrier-quoting), select the carrier and enter the username and agency code.',
        'Choose the lines of business to rate with that carrier and save.',
      ] },
      { note: 'Passwords are never stored here; only the username and whether a login has been set.' },
      { p: 'Carrier phone numbers, websites and NAIC codes are listed in the [Carrier Library](/support/carriers).' },
    ],
    links: [{ label: 'Carrier Quoting Setup', to: '/admin/carrier-quoting' }, { label: 'Carrier Library', to: '/support/carriers' }],
  },
  {
    slug: 'users-and-roles',
    title: 'Adding users, roles and departments',
    category: 'Settings & Administration',
    summary: 'Add staff with a role, mark Service Team and external producers, and group them in departments.',
    tags: ['user', 'staff', 'role', 'department', 'producer code', 'deactivate', 'team'],
    body: [
      { p: 'Add and edit staff under [Settings → Users](/settings?tab=users). Roles: Agency Owner, Admin, Producer, CSR, Account Manager.' },
      { list: [
        'Deactivate staff who leave instead of deleting them, so history keeps their name.',
        'Tick **Service Team member** for anyone paid or tracked on commission reports; tick **External producer** for non-employees.',
        'Group staff into [Departments](/admin/departments) (e.g. Personal Lines, Commercial Lines).',
      ] },
    ],
    links: [{ label: 'Users', to: '/settings?tab=users' }, { label: 'Manage Departments', to: '/admin/departments' }],
  },
  {
    slug: 'import-export',
    title: 'Importing applicants and exporting data',
    category: 'Data & Integrations',
    summary: 'Bulk-create applicants from CSV, export any table, and back up or restore all data.',
    tags: ['import', 'export', 'csv', 'backup', 'restore', 'data export', 'template', 'bulk'],
    body: [
      { steps: [
        'Open **Applicants → Import** and click **Download template**. The first row must be column headers.',
        'Recognized columns: type, first_name, last_name, business_name, email, phone, mobile_phone, address, city, state, zip, dob, status, lead_source, notes.',
        'Personal rows need first and last name; commercial rows need a business name. Errors are listed by row before anything is saved.',
      ] },
      { p: '[Data Export](/reports?report=data-export) downloads any table as CSV. [Settings → Data & Integrations](/settings?tab=data) has **Export all data** (JSON backup) and **Import backup**.' },
    ],
    links: [{ label: 'Import applicants', to: '/accounts?import=1' }, { label: 'Data Export', to: '/reports?report=data-export' }, { label: 'Data & Integrations', to: '/settings?tab=data' }],
  },
  {
    slug: 'connect-supabase',
    title: 'Connecting Supabase (moving off browser storage)',
    category: 'Data & Integrations',
    summary: 'Run the migrations in your Supabase project so data is shared by the whole team.',
    tags: ['supabase', 'database', 'browser storage', 'demo mode', 'migration', 'connect', 'sql', 'server'],
    popular: true,
    body: [
      { p: 'Without a database the system runs in browser-storage demo mode: data lives only in this browser. The footer shows which mode you are in.' },
      { steps: [
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the app.',
        'In your Supabase project\'s **SQL editor**, run the migration files listed on [Settings → Data & Integrations](/settings?tab=data), in order.',
        'Reload. The app detects the schema and switches to Supabase; use **Export all data** / **Import backup** to move demo data across.',
      ] },
      { note: 'The demo database policies allow anonymous full access. Add authentication and row-level security before storing real client data.' },
    ],
    links: [{ label: 'Data & Integrations', to: '/settings?tab=data' }, { label: 'API documentation', to: '/support/api' }],
  },
  {
    slug: 'marketplace-integrations',
    title: 'Activating Marketplace integrations',
    category: 'Data & Integrations',
    summary: 'Browse partner integrations and manage the ones your agency activated.',
    tags: ['marketplace', 'integration', 'plugin', 'partner', 'downloads', 'ivans', 'payments', 'connect'],
    body: [
      { p: 'The [Marketplace](/marketplace) lists integrations such as carrier downloads, eSignature, texting and payments. Activating one records it under [My Integrations](/marketplace/mine) with its settings.' },
      { note: 'In this training environment no outside services are called; related screens simulate their behavior.' },
    ],
    links: [{ label: 'Marketplace', to: '/marketplace' }, { label: 'My Integrations', to: '/marketplace/mine' }],
  },
  {
    slug: 'tasks-activities',
    title: 'Logging activities and managing tasks',
    category: 'Getting Started',
    summary: 'Log every call, email and note on the applicant, and assign follow-up tasks with due dates.',
    tags: ['activity', 'task', 'note', 'call', 'follow-up', 'due date', 'assign', 'priority'],
    body: [
      { steps: [
        'On the applicant (or policy), open **Activities** and add a Call, Email, Meeting, Note or Task.',
        'For tasks, set the due date, priority and **Assigned to**.',
        'Mark tasks Completed when done. [Agency Tasks](/activities) shows everything open across the agency.',
      ] },
      { p: 'Activity settings (default types, reminders) are under [Settings → Activity Settings](/admin/activity).' },
    ],
    links: [{ label: 'Agency Tasks', to: '/activities' }, { label: 'Agency Activity', to: '/activities?view=all' }],
  },
];

export const kbBySlug = (slug: string) => KB_ARTICLES.find((a) => a.slug === slug) ?? null;

/** Plain text of an article (markup stripped) for searching and snippets. */
export function articleText(a: KbArticle) {
  const parts: string[] = [];
  for (const b of a.body) {
    if ('h' in b) parts.push(b.h);
    else if ('p' in b) parts.push(b.p);
    else if ('note' in b) parts.push(b.note);
    else if ('steps' in b) parts.push(...b.steps);
    else parts.push(...b.list);
  }
  return stripMarkup(parts.join(' '));
}

export const stripMarkup = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '');

const STOP = new Set('a an and are as at be by can do does for from get how i in is it me my of on or the to what when where which who why with you your we our this that there not'.split(' '));

/** Very small stemmer so "renewals"/"renewing"/"renew" match each other. */
export function stem(w: string) {
  let s = w.toLowerCase();
  if (s.length > 5 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('als')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('al')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

export function tokenize(s: string) {
  return stripMarkup(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

type Indexed = { a: KbArticle; title: Set<string>; tags: Set<string>; summary: Set<string>; body: Map<string, number> };
let index: Indexed[] | null = null;

function getIndex() {
  index ??= KB_ARTICLES.map((a) => {
    const body = new Map<string, number>();
    for (const t of tokenize(articleText(a))) body.set(t, (body.get(t) ?? 0) + 1);
    return { a, title: new Set(tokenize(a.title)), tags: new Set(a.tags.flatMap(tokenize)), summary: new Set(tokenize(a.summary)), body };
  });
  return index;
}

/** Keyword scoring over title, tags, summary and body. Returns best matches first (score > 0 only). */
export function searchKb(query: string, limit = 10): { article: KbArticle; score: number }[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const results = getIndex().map((ix) => {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let s = 0;
      if (ix.title.has(t)) s += 6;
      if (ix.tags.has(t)) s += 4;
      if (ix.summary.has(t)) s += 2;
      s += Math.min(3, ix.body.get(t) ?? 0);
      if (s) matched++;
      score += s;
    }
    // Reward articles that match more of the question's words.
    if (matched > 1) score *= 1 + (matched - 1) * 0.35;
    return { article: ix.a, score };
  });
  return results.filter((r) => r.score > 0).sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Related articles: same category first, then by shared tags. */
export function relatedArticles(a: KbArticle, n = 4) {
  const tags = new Set(a.tags);
  return KB_ARTICLES.filter((o) => o.slug !== a.slug)
    .map((o) => ({ o, s: (o.category === a.category ? 3 : 0) + o.tags.filter((t) => tags.has(t)).length }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.o);
}
