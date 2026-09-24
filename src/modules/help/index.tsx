import { BookOpenText } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader, Panel, cx } from '@/components/ui';
import { href, setParam, useRoute } from '@/lib/router';

/* Help & Training: short, task-focused guides for new agency staff, plus the integrations list and release notes. */

const A = ({ to, children }: { to: string; children: ReactNode }) => <a href={href(to)} className="font-semibold">{children}</a>;

const Steps = ({ items }: { items: ReactNode[] }) => (
  <ol className="list-decimal pl-5 space-y-1.5">{items.map((it, i) => <li key={i}>{it}</li>)}</ol>
);

const SECTIONS: { key: string; title: string; group: string; body: ReactNode }[] = [
  {
    key: 'getting-started', group: 'Training', title: 'Getting Started',
    body: <>
      <p>This system manages the full client lifecycle for an independent insurance agency: applicants, quotes, policies, service work, documents and accounting.</p>
      <h4>Your first day</h4>
      <Steps items={[
        <>Pick who you are in <A to="/settings?tab=agency">Settings → Agency Profile → Acting as</A>. Tasks assigned to you appear on the <A to="/">Home Page</A>.</>,
        <>Open <A to="/accounts">List Applicants</A> and open any applicant to see their tabs: policies, quotes, activities, claims, documents, messages and billing.</>,
        <>Check <A to="/activities">Agency Tasks</A> for anything due today or overdue.</>,
        <>Review the <A to="/policies?view=renewals">Renewals Queue</A> — policies expiring soon that need a review or remarket.</>,
      ]} />
      <h4>Golden rule</h4>
      <p><b>Always search before you create.</b> Use the search bar at the top (press <kbd>/</kbd>) to look up the client by name, phone or email so you never create a duplicate applicant.</p>
    </>,
  },
  {
    key: 'navigation', group: 'Training', title: 'Navigating the System',
    body: <>
      <p>Hover over any icon in the dark left rail to open its menu (tap it on a phone). Click an entry to go there.</p>
      <table className="help-table">
        <tbody>
          {[
            ['Dashboard', 'Home page, agency activity & tasks, performance, staff directory'],
            ['Applicants', 'Create, list, search and import applicants; completed quotes; submission center; your recent applicants and quotes'],
            ['Documents', 'Agency document library, eSignature envelopes, text & email inbox'],
            ['Agency Workspace', 'Policies and renewals queue, activities, claims, receivables, payments and commissions'],
            ['Reports', 'Book of business, sales, service and financial reports'],
            ['Settings', 'Agency profile, users, carriers, data import/export'],
            ['Help & Training', 'These guides'],
            ['Marketplace', 'Integrations such as carrier downloads, eSignature and texting'],
            ["What's New", 'Recent changes (shows a badge when there are updates you haven’t seen)'],
          ].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <p>The top bar has global search, <b>Quick Quote</b>, the <b>+</b> menu to create anything, your tasks, and notifications.</p>
    </>,
  },
  {
    key: 'quoting', group: 'Training', title: 'Quoting Walkthrough',
    body: <>
      <p>The comparative rater lets you enter the risk once and compare every appointed carrier side by side.</p>
      <Steps items={[
        <>Open the applicant (or create one with <A to="/accounts?new=Personal">Create New Applicant</A>).</>,
        <>On the <b>Drivers, Vehicles & Property</b> tab, confirm every household driver (with date of birth, license, violations and accidents) and every vehicle (year, make, model, VIN).</>,
        <>Click <b>New quote</b>. The wizard pre-fills from the applicant. Step through Applicant → Risk details → Coverages → Carriers.</>,
        <>Choose limits and deductibles on the Coverages step. Select the carriers to rate, then <b>Rate</b>.</>,
        <>Compare results. Expand a carrier to see coverage-level premiums; declined carriers show the reason.</>,
        <>Click <b>Select & bind</b> on the chosen carrier, confirm the effective date and billing, and the policy is created automatically.</>,
      ]} />
      <p className="help-note">Rates in this training system are simulated by a built-in rating model. They behave like real rates (young drivers, accidents and older roofs cost more) but are not actual carrier quotes.</p>
    </>,
  },
  {
    key: 'servicing', group: 'Training', title: 'Servicing Policies',
    body: <>
      <p>Open a policy from the applicant&apos;s Policies tab or from <A to="/policies">All Policies</A>. Use the buttons and <b>More actions</b> menu:</p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><b>Endorse</b> — mid-term change (add a vehicle, change a deductible). Enter the effective date and the premium change.</li>
        <li><b>Renew</b> — start the next term. Review the renewal premium first; remarket if it went up significantly.</li>
        <li><b>Cancel</b> — enter the cancellation date and reason. The return premium is calculated pro-rata.</li>
        <li><b>Reinstate</b> — reverse a cancellation within the term.</li>
        <li><b>Non-renew</b> — the policy stays in force until expiration, then ends.</li>
        <li><b>Audit</b> — record an audit premium adjustment.</li>
        <li><b>Remarket</b> — jump into a new quote for the same applicant and line.</li>
      </ul>
      <p>Every transaction is recorded on the policy&apos;s <b>History</b> tab and logged as an activity. Log every client call or email as an activity so the whole team can see what happened.</p>
      <h4>Claims</h4>
      <p>Use <A to="/claims">Claims → Report Claim</A> to record a first notice of loss. A follow-up task is created automatically.</p>
    </>,
  },
  {
    key: 'glossary', group: 'Training', title: 'Glossary',
    body: <dl className="help-glossary">
      {[
        ['Applicant', 'A client or prospect record: a household (personal lines) or a business (commercial lines).'],
        ['LOB', 'Line of business — Personal Auto, Homeowners, General Liability, etc.'],
        ['Effective / expiration date', 'When coverage starts and ends. A 6- or 12-month span is a term.'],
        ['Endorsement', 'A change to a policy in the middle of its term.'],
        ['Pro-rata', 'Proportional to the time remaining — used to calculate return premium on cancellation.'],
        ['Direct bill / agency bill', 'Direct bill: the carrier bills the client. Agency bill: the agency invoices and collects.'],
        ['Commission', 'The agency’s share of the premium, as a percentage set by each carrier.'],
        ['FNOL', 'First notice of loss — the first report of a claim.'],
        ['Remarket', 'Re-quote a client with other carriers, usually at renewal.'],
        ['Protection class', 'A 1–10 fire-protection rating for a property’s location (lower is better).'],
      ].map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
    </dl>,
  },
  {
    key: 'marketplace', group: 'Marketplace', title: 'Integrations',
    body: <>
      <p>Integrations connect the system to outside services. None are connected in this training environment; the related screens simulate their behavior.</p>
      <table className="help-table">
        <tbody>
          {[
            ['Carrier downloads', 'Nightly policy and commission downloads from carriers (e.g. IVANS). Until connected, enter policies manually or bind through the rater.'],
            ['eSignature', 'Send applications for electronic signature. Envelope status is simulated on the Documents → eSignature screen.'],
            ['Texting & email', 'Two-way client texting and email. Messages are logged but not delivered until a provider is connected.'],
            ['Payments', 'Online premium payments. Record payments manually under Accounting.'],
          ].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <p>Administrators can see connection status under <A to="/settings?tab=data">Settings → Data & Integrations</A>.</p>
    </>,
  },
  {
    key: 'whats-new', group: "What's New", title: 'Latest Updates',
    body: <>
      <h4>September 2026</h4>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>New navigation: hover the left icons for Dashboard, Applicants, Documents, Agency Workspace and more.</li>
        <li><b>Recent Applicants</b> and <b>Recent Quotes</b> in the Applicants menu.</li>
        <li><A to="/accounts?import=1">Import applicants</A> from a CSV file.</li>
        <li><A to="/quotes?group=commercial">Submission Center</A> for commercial lines quotes.</li>
        <li>This Help & Training center.</li>
      </ul>
    </>,
  },
];

export function HelpPage() {
  const { params } = useRoute();
  const current = SECTIONS.find((s) => s.key === params.get('section')) ?? SECTIONS[0];
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  return (
    <div>
      <PageHeader title="Help & Training" subtitle="Guides for new agency staff" icon={<BookOpenText size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
        <Panel bodyClassName="p-2">
          {groups.map((g) => (
            <div key={g} className="mb-2 last:mb-0">
              <div className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{g}</div>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button key={s.key} onClick={() => setParam('section', s.key)} className={cx('w-full text-left px-2 py-1.5 rounded text-[13px]', s.key === current.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-transparent text-ink-700 hover:bg-ink-50')}>
                  {s.title}
                </button>
              ))}
            </div>
          ))}
        </Panel>
        <Panel title={current.title}>
          <div className="help-body text-[13px] text-ink-700 leading-relaxed space-y-3 max-w-3xl">{current.body}</div>
        </Panel>
      </div>
    </div>
  );
}
