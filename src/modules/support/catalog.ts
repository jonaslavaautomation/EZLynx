import { addDays, parseDate, today, toISODate } from '@/lib/format';

/* Agency University course catalog and the Instructor-Led Training schedule. */

export type Lesson = {
  key: string; // `${course}.${lesson}` — stored in training_progress.lesson_key
  title: string;
  minutes: number;
  summary: string;
  /** Where the lesson content lives: a KB article, a Help & Training section, or an app screen to practice in. */
  kb?: string;
  help?: string;
  practice?: { label: string; to: string };
};

export type Course = { slug: string; title: string; level: 'Beginner' | 'Intermediate' | 'Advanced'; description: string; lessons: Lesson[] };

const L = (course: string, key: string, title: string, minutes: number, summary: string, extra: Omit<Lesson, 'key' | 'title' | 'minutes' | 'summary'>): Lesson =>
  ({ key: `${course}.${key}`, title, minutes, summary, ...extra });

export const COURSES: Course[] = [
  {
    slug: 'foundations', title: 'AMS Foundations', level: 'Beginner',
    description: 'Find your way around, set yourself up, and learn the habits that keep records clean.',
    lessons: [
      L('foundations', 'getting-started', 'Getting started', 10, 'Pick who you act as and find your daily work.', { help: 'getting-started', kb: 'first-day-checklist' }),
      L('foundations', 'navigation', 'Navigating the menus', 8, 'The icon rail, flyout menus, global search and the + menu.', { help: 'navigation', practice: { label: 'Home Page', to: '/' } }),
      L('foundations', 'applicants', 'Creating applicants', 12, 'Search first, then create a personal or commercial applicant.', { kb: 'create-applicant', practice: { label: 'Create New Applicant', to: '/accounts?new=Personal' } }),
      L('foundations', 'activities', 'Activities and tasks', 10, 'Log calls and notes; assign follow-ups.', { kb: 'tasks-activities', practice: { label: 'Agency Tasks', to: '/activities' } }),
      L('foundations', 'glossary', 'Insurance glossary', 8, 'LOB, endorsement, pro-rata, FNOL and other terms.', { help: 'glossary' }),
    ],
  },
  {
    slug: 'quoting', title: 'Personal Lines Quoting', level: 'Beginner',
    description: 'Collect the right risk details and compare carriers side by side with the rater.',
    lessons: [
      L('quoting', 'household', 'Drivers, vehicles and property', 12, 'Everything the rater needs about the household.', { kb: 'create-applicant' }),
      L('quoting', 'rater', 'Running a comparative quote', 15, 'Applicant → Risk details → Coverages → Carriers.', { help: 'quoting', practice: { label: 'Start a quote', to: '/quotes/new' } }),
      L('quoting', 'bind', 'Selecting and binding', 10, 'Turn the chosen quote into a policy.', { kb: 'quote-and-bind' }),
      L('quoting', 'carrier-setup', 'Carrier Quoting Setup', 8, 'Why a carrier might not return a rate.', { kb: 'carrier-quoting-setup', practice: { label: 'Carrier Quoting Setup', to: '/admin/carrier-quoting' } }),
    ],
  },
  {
    slug: 'servicing', title: 'Policy Servicing', level: 'Intermediate',
    description: 'Endorsements, renewals, cancellations and claims — the day-to-day of a CSR.',
    lessons: [
      L('servicing', 'endorse', 'Endorsements', 10, 'Record mid-term changes with premium impact.', { kb: 'endorsements' }),
      L('servicing', 'renewals', 'Working renewals', 12, 'Renew or remarket from the renewals queue.', { kb: 'renewals', practice: { label: 'Renewals Queue', to: '/policies?view=renewals' } }),
      L('servicing', 'cancel', 'Cancel, reinstate, rewrite', 12, 'Pro-rata returns, reinstatements and rewrites.', { kb: 'cancel-reinstate' }),
      L('servicing', 'claims', 'Claims FNOL', 10, 'Report a claim and track its transactions.', { kb: 'claims-fnol', practice: { label: 'Claims', to: '/claims' } }),
      L('servicing', 'documents', 'Documents and eSignature', 10, 'Upload, categorize and request signatures.', { kb: 'documents-esignature' }),
      L('servicing', 'overview', 'Servicing guide review', 6, 'Recap of every policy action.', { help: 'servicing' }),
    ],
  },
  {
    slug: 'communication', title: 'Communication Center', level: 'Intermediate',
    description: 'Texting, email campaigns, suppression lists and postal mail done right.',
    lessons: [
      L('communication', 'texting', 'Texting clients', 10, 'Two-way SMS with templates and opt-outs.', { kb: 'texting-clients', practice: { label: 'Calls and Messages', to: '/messages' } }),
      L('communication', 'campaigns', 'Email campaigns', 12, 'Recipient lists, merge fields, scheduling.', { kb: 'email-campaigns', practice: { label: 'New Campaign', to: '/comm/campaigns/new' } }),
      L('communication', 'suppression', 'Suppression lists', 8, 'Unsubscribes, bounces and manual blocks.', { kb: 'email-campaigns', practice: { label: 'Suppression List', to: '/comm/suppression?channel=Email' } }),
      L('communication', 'mail', 'Postal mailbox', 6, 'Log inbound and outbound mail.', { practice: { label: 'Mailbox', to: '/comm/mailbox' } }),
    ],
  },
  {
    slug: 'commissions', title: 'Commissions & Reporting', level: 'Advanced',
    description: 'Reconcile carrier statements, split commission and report on the book.',
    lessons: [
      L('commissions', 'statements', 'Commission statements', 15, 'Enter, auto-match, reconcile and post.', { kb: 'commission-statements', practice: { label: 'Statements', to: '/policy-mgmt/statements' } }),
      L('commissions', 'rules', 'Service Team rules', 10, 'Who earns what share, and why.', { kb: 'service-team-rules' }),
      L('commissions', 'reports', 'Reports 5.0', 12, 'Favorites, saved, scheduled and shared reports.', { kb: 'reports-5', help: 'reports' }),
      L('commissions', 'export', 'Exporting data', 6, 'CSV exports and full backups.', { kb: 'import-export', practice: { label: 'Data Export', to: '/reports?report=data-export' } }),
    ],
  },
  {
    slug: 'administration', title: 'Administration', level: 'Advanced',
    description: 'Configure the agency: users, labels, lead sources, automation and integrations.',
    lessons: [
      L('administration', 'users', 'Users, roles and departments', 10, 'Add staff and organize teams.', { kb: 'users-and-roles' }),
      L('administration', 'labels', 'Labels and lead sources', 8, 'Keep reporting clean with consistent picklists.', { kb: 'labels-lead-sources' }),
      L('administration', 'automation', 'Automation Center', 12, 'Workflows with timed steps.', { kb: 'automation-center', practice: { label: 'Automation Center', to: '/admin/automation' } }),
      L('administration', 'supabase', 'Connecting the database', 10, 'Move from browser storage to Supabase.', { kb: 'connect-supabase' }),
      L('administration', 'marketplace', 'Marketplace integrations', 6, 'Activate and manage integrations.', { kb: 'marketplace-integrations', help: 'marketplace' }),
    ],
  },
];

export const ALL_LESSONS = COURSES.flatMap((c) => c.lessons);
export const LESSON_KEYS = new Set(ALL_LESSONS.map((l) => l.key));
export const courseBySlug = (slug: string) => COURSES.find((c) => c.slug === slug) ?? null;

// ── Instructor-led sessions ──

export type SessionTemplate = { slug: string; title: string; description: string; hour: number; minute: number; duration: number; seats: number; everyDays: number; offset: number; instructorIndex: number };

/** Recurring webinars. Dates are computed from a fixed anchor so session keys stay stable day to day. */
const TEMPLATES: SessionTemplate[] = [
  { slug: 'foundations-live', title: 'AMS Foundations Live', description: 'A guided tour for new staff: navigation, applicants, tasks and search habits.', hour: 10, minute: 0, duration: 60, seats: 20, everyDays: 14, offset: 0, instructorIndex: 0 },
  { slug: 'rater-workshop', title: 'Comparative Rater Workshop', description: 'Quote an auto and home package end to end and bind it.', hour: 14, minute: 0, duration: 90, seats: 12, everyDays: 14, offset: 3, instructorIndex: 1 },
  { slug: 'renewal-retention', title: 'Renewal Retention Clinic', description: 'Work the renewals queue, remarket increases and document the conversation.', hour: 11, minute: 0, duration: 45, seats: 15, everyDays: 21, offset: 8, instructorIndex: 2 },
  { slug: 'commission-reconciliation', title: 'Commission Statement Reconciliation', description: 'Enter, auto-match, reconcile and post a carrier statement.', hour: 13, minute: 30, duration: 60, seats: 10, everyDays: 28, offset: 10, instructorIndex: 0 },
  { slug: 'texting-compliance', title: 'Texting & Campaign Compliance', description: 'Consent, opt-outs, suppression lists and message templates.', hour: 15, minute: 0, duration: 45, seats: 25, everyDays: 28, offset: 17, instructorIndex: 3 },
  { slug: 'admin-setup', title: 'Administrator Setup Session', description: 'Users, labels, lead sources, automation and Carrier Quoting Setup.', hour: 9, minute: 30, duration: 75, seats: 8, everyDays: 28, offset: 24, instructorIndex: 1 },
];

const ANCHOR = '2026-01-05'; // a Monday

export type Session = SessionTemplate & { key: string; date: string; start: Date; end: Date };

function nextWeekday(date: string) {
  const d = parseDate(date)!;
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

/** Every session between `fromDays` and `toDays` relative to `base` (default today), sorted by start. */
export function sessionsBetween(fromDays: number, toDays: number, base = today()): Session[] {
  const anchor = parseDate(ANCHOR)!.getTime();
  const from = parseDate(addDays(base, fromDays))!.getTime();
  const to = parseDate(addDays(base, toDays))!.getTime();
  const out: Session[] = [];
  for (const t of TEMPLATES) {
    const period = t.everyDays * 86400000;
    const first = anchor + t.offset * 86400000;
    let n = Math.max(0, Math.floor((from - first) / period));
    for (; ; n++) {
      const raw = toISODate(new Date(first + n * period + 12 * 3600000)); // noon avoids DST edge cases
      if (parseDate(raw)!.getTime() > to) break;
      if (parseDate(raw)!.getTime() < from) continue;
      const date = nextWeekday(raw);
      const [y, m, d] = date.split('-').map(Number);
      const start = new Date(y, m - 1, d, t.hour, t.minute);
      out.push({ ...t, key: `${t.slug}-${raw}`, date, start, end: new Date(start.getTime() + t.duration * 60000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function instructorFor(s: Pick<Session, 'instructorIndex'>, names: string[]) {
  if (!names.length) return 'Agency trainer';
  return names[s.instructorIndex % names.length];
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** An iCalendar file for one session. */
export function sessionIcs(s: Session, instructor: string) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Northstar AMS//Instructor-Led Training//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${s.key}@northstar-ams`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(s.start)}`,
    `DTEND:${icsDate(s.end)}`,
    `SUMMARY:${icsText(s.title)}`,
    `DESCRIPTION:${icsText(`${s.description}\nInstructor: ${instructor}`)}`,
    'LOCATION:Online webinar',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
