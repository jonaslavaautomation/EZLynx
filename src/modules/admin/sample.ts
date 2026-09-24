import { uuid } from '@/lib/db';
import { addDays, today } from '@/lib/format';
import type {
  Account, AppConfig, AutomationWorkflow, BillingCompany, Carrier, CarrierRatingSetup, Department, FormTemplate, Label, LeadSource, LineOfBusiness,
  Policy, ProposalTemplate, Staff,
} from '@/lib/types';
import { CONFIG_DEFAULTS, type ActivityConfig, type CertificateConfig, type EmailSubscriptionsConfig, type LinesConfig, type PluginsConfig } from './config';

/** Local timestamp `days` from today at 9:00, as ISO. */
function at(days: number, hour = 9) {
  const [y, m, d] = addDays(today(), days).split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
}

export const DEFAULT_LEAD_SOURCES = ['Referral', 'Website', 'Walk-in', 'Google Ads', 'Facebook', 'Existing Client', 'Cold Call'];

/**
 * Deterministic Settings administration demo data (labels, lead sources, workflows, templates, config…).
 * Accounts are not modified here: no labels are assigned in sample data.
 */
export function buildAdminSample(d: { accounts: Account[]; policies: Policy[]; staff: Staff[]; carriers: Carrier[] }): {
  app_config: AppConfig[]; labels: Label[]; lead_sources: LeadSource[]; automation_workflows: AutomationWorkflow[]; billing_companies: BillingCompany[];
  departments: Department[]; carrier_rating_setup: CarrierRatingSetup[]; form_templates: FormTemplate[]; proposal_templates: ProposalTemplate[];
} {
  const { staff, carriers } = d;
  const byRole = (role: Staff['role']) => staff.filter((s) => s.role === role).map((s) => s.name);
  const owner = byRole('Agency Owner')[0] ?? staff[0]?.name ?? 'Agency Owner';
  const producers = byRole('Producer');
  const service = [...byRole('CSR'), ...byRole('Account Manager')];

  // ── Labels ──
  const labelDefs: [string, string, string][] = [
    ['VIP Client', '#7c3aed', 'Top-tier households and businesses; white-glove service.'],
    ['Renewal Risk', '#dc2626', 'Shopping or price-sensitive at renewal — review early.'],
    ['Cross-sell Opportunity', '#059669', 'Mono-line accounts that could bundle auto + home or add umbrella.'],
    ['Commercial Prospect', '#2563eb', 'Business owners interested in commercial coverage.'],
    ['Needs Documents', '#d97706', 'Missing signed applications, photos or proof of prior insurance.'],
    ['Spanish Speaking', '#0891b2', 'Prefers communication in Spanish.'],
  ];
  const labels: Label[] = labelDefs.map(([name, color, description], i) => ({ id: uuid(), created_at: at(-120 + i), name, color, description }));

  // ── Lead sources ──
  const lead_sources: LeadSource[] = [
    ...DEFAULT_LEAD_SOURCES.map((name, i) => ({ id: uuid(), created_at: at(-365 + i), name, is_default: true, hidden: false })),
    { id: uuid(), created_at: at(-40), name: 'Chamber of Commerce', is_default: false, hidden: false },
  ];

  // ── Automation workflows ──
  const automation_workflows: AutomationWorkflow[] = [
    {
      id: uuid(), created_at: at(-90), name: 'Renewal review — 60 days out', trigger: 'Renewal Approaching', trigger_config: { days: 60, lines: [] }, active: true,
      steps: [
        { delay_days: 0, action: 'Create Task', subject: 'Renewal review: {policy_number} ({line})', body: 'Review the renewal offer, remarket if the increase is over 10%, and confirm coverages with {first_name}.', assign_to: 'csr', priority: 'Normal' },
        { delay_days: 7, action: 'Send Email', subject: 'Your {line} policy renews {expiration_date}', body: 'Hi {first_name},\n\nYour {line} policy with {carrier} renews on {expiration_date}. We are reviewing your renewal now and will reach out if we find a better option. Reply to this email with any changes to your drivers, vehicles or home.\n\nThank you for trusting {agency}.', template_id: null },
      ],
    },
    {
      id: uuid(), created_at: at(-80), name: 'New applicant welcome', trigger: 'Applicant Created', trigger_config: {}, active: true,
      steps: [
        { delay_days: 0, action: 'Send Email', subject: 'Welcome to {agency}', body: 'Hi {first_name},\n\nThanks for choosing {agency}! Your agent {agent} will be in touch shortly to review your coverage needs. You can reply to this email any time.', template_id: null },
        { delay_days: 3, action: 'Create Task', subject: 'Follow up with new applicant {first_name}', body: 'Call to confirm we received everything needed to quote.', assign_to: 'producer', priority: 'Normal' },
      ],
    },
    {
      id: uuid(), created_at: at(-70), name: 'Claim reported — service check-in', trigger: 'Claim Reported', trigger_config: { lines: [] }, active: true,
      steps: [{ delay_days: 0, action: 'Create Task', subject: 'Check in with {first_name} about their claim', body: 'Confirm the carrier assigned an adjuster and the insured knows next steps.', assign_to: 'csr', priority: 'High' }],
    },
  ];

  // ── Billing companies ──
  const billing_companies: BillingCompany[] = [
    { id: uuid(), created_at: at(-200), name: 'Lone Star Premium Finance', company_type: 'Premium Finance', phone: '(512) 555-0180', email: 'service@lonestarpf.example', address: '600 Congress Ave, Austin, TX 78701', notes: '10-month plans, 20% down. Cancellation notices by fax and email.' },
    { id: uuid(), created_at: at(-190), name: 'Summit Mutual Billing Center', company_type: 'Carrier Direct Bill', phone: '(800) 555-0143', email: 'billing@summitmutual.example', address: 'PO Box 4410, Columbus, OH 43216', notes: 'Direct bill for Summit Mutual personal lines. EFT and card accepted.' },
    { id: uuid(), created_at: at(-150), name: 'Gulf Coast Wholesale Brokers', company_type: 'MGA / Wholesaler', phone: '(713) 555-0126', email: 'accounting@gulfcoastwb.example', address: '1200 Smith St, Houston, TX 77002', notes: 'Surplus lines placements; net-of-commission statements monthly.' },
  ];

  // ── Departments ──
  const departments: Department[] = [
    { id: uuid(), created_at: at(-300), name: 'Personal Lines', description: 'Auto, home, renters and umbrella service.', members: [...new Set([...service, producers[0]].filter(Boolean) as string[])] },
    { id: uuid(), created_at: at(-300), name: 'Commercial Lines', description: 'Business insurance quoting and service.', members: [...new Set([producers[1] ?? producers[0], service[1] ?? service[0]].filter(Boolean) as string[])] },
    { id: uuid(), created_at: at(-300), name: 'Sales', description: 'New business production.', members: [...new Set([owner, ...producers])] },
  ];

  // ── Carrier Quoting Setup (appointed carriers; one still needs a login) ──
  const appointed = carriers.filter((c) => c.appointed);
  const needsLogin = appointed.length > 2 ? appointed[appointed.length - 1].name : null;
  const carrier_rating_setup: CarrierRatingSetup[] = appointed.map((c, i) => {
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 8);
    const ready = c.name !== needsLogin;
    return {
      id: uuid(), created_at: at(-100 + i), carrier: c.name, username: ready ? `northstar.${slug}` : null, agency_code: `NS${String(4100 + i * 37)}`,
      login_set: ready, enabled_lines: [...c.lines] as LineOfBusiness[], active: true,
    };
  });

  // ── Form templates ──
  const form_templates: FormTemplate[] = [
    {
      id: uuid(), created_at: at(-60), name: 'Landlord certificate (standard lease)', form_type: 'ACORD 25',
      fields: {
        certificate_holder: 'Riverside Commercial Properties LLC\n2400 Riverside Dr, Suite 300\nAustin, TX 78741',
        remarks: 'Certificate holder is included as additional insured with respect to general liability as required by written lease agreement.',
        producer_contact: owner, producer_phone: '(512) 555-0100',
      },
    },
    {
      id: uuid(), created_at: at(-55), name: 'Mortgagee evidence (First Texas Bank)', form_type: 'ACORD 27',
      fields: {
        certificate_holder: 'First Texas Bank, ISAOA/ATIMA\nPO Box 961200\nFort Worth, TX 76161',
        remarks: 'Mortgagee clause: First Texas Bank, its successors and/or assigns. Loan # on file.',
        producer_contact: service[0] ?? owner,
      },
    },
  ];

  // ── Proposal / SOI templates ──
  const proposal_templates: ProposalTemplate[] = [
    {
      id: uuid(), created_at: at(-110), name: 'Standard proposal', template_type: 'Proposal', is_default: true, include_coverages: true, include_premium: true,
      intro: 'Hi {first_name}, thank you for the opportunity to quote your insurance. We shopped several carriers to find the right balance of coverage and price. The options below are summarized for easy comparison.',
      closing: 'Ready to move forward or have questions? Call or email us and we will bind coverage and send your documents the same day.',
      disclaimer: 'This proposal is a summary for comparison only and does not bind coverage. Coverage is subject to underwriting approval and the terms, conditions and exclusions of the policy issued.',
    },
    {
      id: uuid(), created_at: at(-100), name: 'Commercial proposal', template_type: 'Proposal', is_default: false, include_coverages: true, include_premium: true,
      intro: 'Thank you for allowing {agency} to review your business insurance program. This proposal summarizes the markets we approached and the terms offered.',
      closing: 'Please review limits carefully with your contracts and lease requirements. Signed applications and a down payment are required to bind.',
      disclaimer: 'Quotes are subject to carrier underwriting, inspection and audit. Coverage is not bound until confirmed in writing by the agency.',
    },
    {
      id: uuid(), created_at: at(-95), name: 'Annual Summary of Insurance', template_type: 'SOI', is_default: true, include_coverages: true, include_premium: true,
      intro: 'Dear {first_name}, here is a summary of the insurance you have in force with {agency}. Please review it and let us know about any changes in your household, vehicles, property or business.',
      closing: 'We appreciate your business. Call us any time you have a question or a change to report.',
      disclaimer: 'This summary is provided for convenience only. It does not amend, extend or alter the coverage afforded by your policies. Refer to your policy documents for complete terms.',
    },
  ];

  // ── app_config ──
  const activity: ActivityConfig = { ...CONFIG_DEFAULTS.activity, default_priority: 'Normal', due_in_days: 2, assignee_rule: 'me', renewal_review_days: 45 };
  const certificates: CertificateConfig = {
    ...CONFIG_DEFAULTS.certificates,
    holder_name: '', holder_address: '',
    remarks: 'Evidence of coverage only. This certificate is issued as a matter of information and confers no rights upon the certificate holder.',
    authorized_rep: owner, include_ai_wording: true,
  };
  const plugins: PluginsConfig = { enabled: { 'carrier-login': true, 'email-addin': true, 'quote-capture': false, 'doc-scanner': false, 'click-to-call': false } };
  const subs: Record<string, string[]> = {};
  staff.filter((s) => s.active).forEach((s) => {
    const base = ['task_digest'];
    if (s.role === 'Producer' || s.role === 'Agency Owner') base.push('new_lead', 'weekly_production');
    if (s.role === 'CSR' || s.role === 'Account Manager') base.push('renewal_alerts', 'claim_updates', 'esign_completed');
    if (s.role === 'Agency Owner') base.push('renewal_alerts');
    subs[s.name] = [...new Set(base)];
  });
  const email_subscriptions: EmailSubscriptionsConfig = { subscriptions: subs };
  const lines: LinesConfig = structuredClone(CONFIG_DEFAULTS.lines);
  lines.Life = { ...lines.Life, enabled: false };
  const cfg = (key: string, value: object, days: number): AppConfig => ({ id: uuid(), created_at: at(days), key, value: value as Record<string, unknown> });
  const app_config: AppConfig[] = [
    cfg('activity', activity, -300), cfg('certificates', certificates, -300), cfg('plugins', plugins, -300),
    cfg('email_subscriptions', email_subscriptions, -300), cfg('lines', lines, -300),
  ];

  return { app_config, labels, lead_sources, automation_workflows, billing_companies, departments, carrier_rating_setup, form_templates, proposal_templates };
}
