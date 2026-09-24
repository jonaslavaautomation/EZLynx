import {
  BarChart3, BellRing, Building2, CalendarCog, FileBadge, FileSpreadsheet, FileStack, Landmark, Layers, Megaphone, Network, Puzzle, Settings, Tag, Users,
  Workflow, Zap, type LucideIcon,
} from 'lucide-react';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { href, navigate } from '@/lib/router';
import { AutomationPage } from './automation';
import { CarrierQuotingPage } from './carrier-quoting';
import { ActivitySettingsPage, CertificateSettingsPage, EmailSubscriptionsPage, LinesPage, PluginsPage } from './config-pages';
import { LabelsPage, LeadSourcesPage } from './labels';
import { BillingCompaniesPage, DepartmentsPage } from './org';
import { FormTemplatesPage, ProposalTemplatesPage } from './templates';
import { UsagePage } from './usage';

export { AutomationTicker, enqueueAutomation, runAutomationsTick } from './automation-engine';

type Card = { to: string; label: string; description: string; icon: LucideIcon };

const GROUPS: { title: string; cards: Card[] }[] = [
  { title: 'Agency Management', cards: [
    { to: '/admin/activity', label: 'Activity Settings', description: 'Default priority, due date, assignee and activity types for new tasks.', icon: CalendarCog },
    { to: '/admin/automation', label: 'Automation Center', description: 'Workflows whose steps run at timed intervals: tasks, emails, texts, labels.', icon: Workflow },
    { to: '/admin/certificates', label: 'Certificate Settings', description: 'Master certificate holder, remarks and authorized representative.', icon: FileBadge },
    { to: '/admin/plugins', label: 'Plugins', description: 'Browser and desktop tools available to staff.', icon: Puzzle },
    { to: '/admin/email-subscriptions', label: 'Manage Email Subscriptions', description: 'Which notification emails each staff member receives.', icon: BellRing },
    { to: '/admin/labels', label: 'Manage Labels', description: 'Labels for filtering applicants and triggering workflows.', icon: Tag },
    { to: '/admin/lead-sources', label: 'Manage Lead Sources', description: 'Where applicants come from; hide defaults, add your own.', icon: Megaphone },
  ] },
  { title: 'Carriers and Lines of Business', cards: [
    { to: '/admin/billing-companies', label: 'Manage Billing Companies', description: 'Premium finance, carrier billing centers and wholesalers.', icon: Landmark },
    { to: '/settings?tab=carriers', label: 'Manage Carriers/Markets', description: 'Carrier appointments, lines written and commission rates.', icon: Building2 },
    { to: '/admin/departments', label: 'Manage Departments', description: 'Group staff into departments.', icon: Network },
    { to: '/admin/lines', label: 'Manage Lines of Business', description: 'Lines offered in policy entry and the rater, with default terms.', icon: Layers },
  ] },
  { title: 'Rating', cards: [
    { to: '/admin/carrier-quoting', label: 'Carrier Quoting Setup', description: 'Carrier logins required before a carrier returns quotes.', icon: Zap },
  ] },
  { title: 'Templates', cards: [
    { to: '/admin/form-templates', label: 'Manage Form Templates', description: 'Saved default values for ACORD forms.', icon: FileSpreadsheet },
    { to: '/admin/proposal-templates', label: 'Proposal / SOI Templates', description: 'Proposal wording and client Summaries of Insurance.', icon: FileStack },
  ] },
  { title: 'Administration', cards: [
    { to: '/admin/usage', label: 'Product Usage Report', description: 'Activity, quoting and messaging by staff member.', icon: BarChart3 },
    { to: '/settings?tab=users', label: 'Users', description: 'Staff accounts, roles and the signed-in user.', icon: Users },
    { to: '/settings', label: 'Agency Profile & Data', description: 'Agency details, sample data and data tools.', icon: Settings },
  ] },
];

function Overview() {
  return (
    <div className="max-w-6xl">
      <PageHeader title="Settings" subtitle="Agency-wide configuration for the management system" icon={<Settings size={20} />} />
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.cards.map((c) => (
                <a key={c.to} href={href(c.to)} className="group bg-white border border-[#e3e3e3] rounded shadow-card p-4 flex items-start gap-3 min-w-0 hover:border-brand-200 transition-colors">
                  <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0"><c.icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink-900 group-hover:text-brand-600">{c.label}</span>
                    <span className="block text-xs text-ink-500 mt-0.5">{c.description}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Settings administration router. `segments` are the path parts after `admin`. */
export function AdminRoutes({ segments }: { segments: string[] }) {
  switch (segments[0]) {
    case undefined: return <Overview />;
    case 'activity': return <ActivitySettingsPage />;
    case 'automation': return <AutomationPage />;
    case 'certificates': return <CertificateSettingsPage />;
    case 'plugins': return <PluginsPage />;
    case 'email-subscriptions': return <EmailSubscriptionsPage />;
    case 'labels': return <LabelsPage />;
    case 'lead-sources': return <LeadSourcesPage />;
    case 'billing-companies': return <BillingCompaniesPage />;
    case 'departments': return <DepartmentsPage />;
    case 'lines': return <LinesPage />;
    case 'carrier-quoting': return <CarrierQuotingPage />;
    case 'form-templates': return <FormTemplatesPage />;
    case 'proposal-templates': return <ProposalTemplatesPage />;
    case 'usage': return <UsagePage />;
    default:
      return <EmptyState title="Page not found" message="This Settings page doesn't exist." action={<Button size="sm" onClick={() => navigate('/admin')}>Go to Settings</Button>} />;
  }
}
