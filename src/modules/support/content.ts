import type { KbBlock } from './kb';

/* Product news: release notes and the in-app Product Blog. Same inline markup as the knowledge base. */

export type Release = { version: string; date: string; title: string; items: string[]; tag: 'New' | 'Improved' | 'Fixed' };

export const RELEASES: Release[] = [
  {
    version: '1.3', date: '2026-09-24', tag: 'New', title: 'Settings, Support and Marketplace menus',
    items: [
      'New **Settings** menu: Activity Settings, [Automation Center](/admin/automation), Manage Labels, Lead Sources, Billing Companies, Departments, Lines of Business, [Carrier Quoting Setup](/admin/carrier-quoting), Form and Proposal/SOI templates, and the Product Usage Report.',
      'New **Support** menu: the [Solution Center](/support) with a searchable knowledge base and support tickets, the [Carrier Library](/support/carriers), [Agency University](/support/university) with progress tracking, [Instructor-Led Trainings](/support/instructor-led), and [API documentation](/support/api).',
      'Support **Chat** answers questions from the knowledge base and can turn the conversation into a ticket.',
      'New **Marketplace**: browse integrations and manage them under [My Integrations](/marketplace/mine).',
      'Labels on applicants, plus hide-only lead sources.',
    ],
  },
  {
    version: '1.2', date: '2026-09-24', tag: 'New', title: 'Policy Mgmt, Commissions, Communication Center and Reports 5.0',
    items: [
      '[Policy Transactions](/policy-mgmt/transactions), [Policy Rewrites](/policy-mgmt/rewrites), [Claim Transactions](/policy-mgmt/claim-transactions) and the ACORD Library.',
      'Commission [Statements](/policy-mgmt/statements) with auto-match and reconciliation, [Service Team Rules](/policy-mgmt/rules) and Manage Service Team.',
      'Communication Center: email campaigns, recipient lists, email and SMS suppression lists, text templates, postal mailbox and eSignature templates.',
      'Reports 5.0: favorite, saved, shared and scheduled reports, browsable by category.',
    ],
  },
  {
    version: '1.1', date: '2026-09-24', tag: 'Improved', title: 'Icon rail navigation and Help & Training',
    items: [
      'Hover the icons in the left rail to open flyout menus; tap them on a phone.',
      '**Recent Applicants** and **Recent Quotes** in the Applicants menu.',
      '[Import applicants](/accounts?import=1) from CSV and the commercial [Submission Center](/quotes?group=commercial).',
      'The [Help & Training](/help) guides for new staff.',
    ],
  },
  {
    version: '1.0', date: '2026-09-24', tag: 'New', title: 'Northstar AMS launch',
    items: [
      'Applicants with drivers, vehicles and property; comparative rater with Select & bind.',
      'Policy servicing: endorse, renew, cancel, reinstate, non-renew, audit and remarket.',
      'Claims, documents with eSignature tracking, texting and email, invoices and accounting.',
      'Runs on Supabase or in browser-storage demo mode.',
    ],
  },
];

export type BlogPost = { slug: string; title: string; date: string; author: string; minutes: number; excerpt: string; body: KbBlock[]; tags: string[] };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'renewal-retention-playbook', title: 'A 60-day renewal retention playbook', date: '2026-09-22', author: 'Northstar Team', minutes: 4,
    tags: ['renewals', 'retention'],
    excerpt: 'Most lost renewals are decided before the renewal offer arrives. Start the conversation early.',
    body: [
      { p: 'Clients rarely leave over a single rate increase — they leave when the increase is a surprise. A predictable routine keeps retention high.' },
      { h: 'The routine' },
      { steps: [
        '**Day 60:** open the [Renewals Queue](/policies?view=renewals). Anything with a premium increase over 10% gets a remarket quote.',
        '**Day 45:** call the client. Explain what changed (rate filings, claims, new drivers) before they see the bill.',
        '**Day 30:** present options — current carrier vs. remarket, and coverage adjustments like higher deductibles.',
        '**Day 15:** confirm the decision and log it as an activity.',
      ] },
      { note: 'Set the renewal window under Agency Profile → renewal reminder days so the queue matches your routine.' },
    ],
  },
  {
    slug: 'cross-selling-umbrella', title: 'Cross-selling umbrella: the easiest conversation you are not having', date: '2026-09-15', author: 'Northstar Team', minutes: 3,
    tags: ['cross-sell', 'umbrella'],
    excerpt: 'Clients with auto and home are one question away from an umbrella policy.',
    body: [
      { p: 'An umbrella adds liability limits above auto and home for a modest premium. It protects the client and deepens the account.' },
      { h: 'Who to call first' },
      { list: [
        'Households with both Personal Auto and Homeowners but no Umbrella — find them in the Book of Business reports.',
        'Clients with teen drivers, pools, rental properties or high home values.',
        'Anyone whose auto liability limits already sit at the maximum underlying requirement.',
      ] },
      { p: 'Add a label such as "Umbrella candidate" to the applicant and let an [Automation Center](/admin/automation) workflow create the follow-up task.' },
    ],
  },
  {
    slug: 'suppression-lists', title: 'Why suppression lists protect your agency', date: '2026-09-08', author: 'Northstar Team', minutes: 3,
    tags: ['email', 'compliance', 'suppression'],
    excerpt: 'Unsubscribes and bounces are not just clean-up — they keep you compliant and deliverable.',
    body: [
      { p: 'Every campaign is sent to its recipient list minus the [Suppression List](/comm/suppression?channel=Email). That list holds unsubscribes, bounces and manual blocks.' },
      { list: [
        '**Honor unsubscribes immediately.** Marketing emails must offer a working opt-out.',
        '**Remove bounces.** Repeatedly mailing dead addresses hurts deliverability for every email you send.',
        '**Keep SMS separate.** Text opt-outs ("STOP") live on the SMS suppression list and block one-to-one texts too.',
      ] },
      { note: 'Service messages (a claim update, a cancellation notice) are different from marketing; ask your compliance lead which rules apply in your state.' },
    ],
  },
  {
    slug: 'reconciling-commission-statements', title: 'Reconciling commission statements without the headache', date: '2026-09-01', author: 'Northstar Team', minutes: 4,
    tags: ['commissions', 'accounting'],
    excerpt: 'Auto-match does the heavy lifting; your job is the exceptions.',
    body: [
      { steps: [
        'Enter the statement header exactly as the carrier printed it, including the total.',
        'Import the lines from CSV where possible, then run **Auto-match**.',
        'Work the unmatched lines: a typo in the policy number, a rewritten policy, or business you do not have on file yet.',
        'Only mark the statement reconciled when the line total equals the statement total, then post.',
      ] },
      { p: 'Review [Service Team Rules](/policy-mgmt/rules) quarterly so splits reflect who actually services each book.' },
    ],
  },
  {
    slug: 'texting-best-practices', title: 'Texting clients: best practices and compliance basics', date: '2026-08-25', author: 'Northstar Team', minutes: 3,
    tags: ['texting', 'sms', 'compliance'],
    excerpt: 'Texts get read. Make sure they are welcome, useful and documented.',
    body: [
      { list: [
        'Get consent before texting and note it on the applicant.',
        'Identify the agency in the first message and keep texts short.',
        'Never send full policy numbers, dates of birth or license numbers by text.',
        'Use [Text Templates](/comm/templates) for consistent wording on payment reminders and ID card requests.',
        'Stop immediately when a client opts out; the SMS suppression list enforces it.',
      ] },
      { note: 'This is general guidance, not legal advice. Texting rules (such as the TCPA) vary; confirm your agency policy.' },
    ],
  },
  {
    slug: 'onboarding-vas', title: 'Onboarding virtual assistants in their first two weeks', date: '2026-08-18', author: 'Northstar Team', minutes: 4,
    tags: ['training', 'onboarding'],
    excerpt: 'A structured path through Agency University gets new VAs productive fast.',
    body: [
      { h: 'Week one' },
      { list: [
        'Complete **AMS Foundations** and **Personal Lines Quoting** in [Agency University](/support/university).',
        'Register for the next live Foundations session under [Instructor-Led Trainings](/support/instructor-led).',
        'Shadow: log activities on real applicants while a senior CSR reviews them.',
      ] },
      { h: 'Week two' },
      { list: [
        'Complete **Policy Servicing** and **Communication Center**.',
        'Handle endorsements and renewals with review before submission.',
        'Instructors track progress in the Agency University progress table.',
      ] },
    ],
  },
];

export const blogBySlug = (slug: string) => BLOG_POSTS.find((p) => p.slug === slug) ?? null;
