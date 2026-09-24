import { uuid } from '@/lib/db';
import { addDays, today } from '@/lib/format';
import type { Account, EmailCampaign, ESignTemplate, MailItem, MessageTemplate, Policy, RecipientFilters, RecipientList, Staff, Suppression } from '@/lib/types';
import { matchRecipients, partitionRecipients } from './shared';
import { EMAIL_RE, normalizePhone, suppressionKey } from './suppression';

/** Local timestamp `days` from today at `hour`:`minute`, as ISO. */
function at(days: number, hour: number, minute = 0) {
  const [y, m, d] = addDays(today(), days).split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

/**
 * Deterministic Communication Center demo data built from the seeded book of business.
 * Dates are relative to today; no randomness.
 */
export function buildCommSample(d: { accounts: Account[]; policies: Policy[]; staff: Staff[] }): {
  recipient_lists: RecipientList[]; email_campaigns: EmailCampaign[]; suppressions: Suppression[];
  message_templates: MessageTemplate[]; mail_items: MailItem[]; esign_templates: ESignTemplate[];
} {
  const { accounts, policies, staff } = d;
  const producer = staff.find((s) => s.role === 'Producer')?.name ?? staff[0]?.name ?? null;

  // ── Recipient lists ──
  const listDefs: [string, RecipientFilters, number][] = [
    ['All active clients', { statuses: ['Active'], has_email: true }, -60],
    ['Auto clients in TX', { lines: ['Personal Auto'], states: ['TX'], has_email: true }, -45],
    ['Prospects', { statuses: ['Prospect'], has_email: true }, -30],
  ];
  const recipient_lists: RecipientList[] = listDefs.map(([name, filters, days]) => ({ id: uuid(), created_at: at(days, 9), name, filters }));
  const [allActive, autoTx, prospects] = recipient_lists;

  // ── Suppressions (a couple from real seeded clients) ──
  const withEmail = accounts.filter((a) => a.email && EMAIL_RE.test(a.email));
  const withPhone = accounts.filter((a) => normalizePhone(a.mobile_phone || a.phone || '').length === 10);
  const emailSupp: [string, string, number][] = [
    [withEmail[2]?.email ?? 'former.client@example.com', 'Unsubscribed', -40],
    [withEmail[7]?.email ?? 'bounced.client@example.com', 'Bounced', -20],
    ['old.address@example.com', 'Bounced', -75],
    ['no-marketing@example.net', 'Manual', -12],
  ];
  const smsSupp: [string, string, number][] = [
    [withPhone[3] ? normalizePhone(withPhone[3].mobile_phone || withPhone[3].phone || '') : '5125550187', 'STOP reply', -18],
    ['5125550142', 'Manual', -9],
  ];
  const seenSupp = new Set<string>();
  const suppressions: Suppression[] = [];
  for (const [address, reason, days] of emailSupp) {
    const k = 'Email:' + suppressionKey('Email', address);
    if (seenSupp.has(k)) continue;
    seenSupp.add(k);
    suppressions.push({ id: uuid(), created_at: at(days, 10), channel: 'Email', address: address.toLowerCase(), reason });
  }
  for (const [address, reason, days] of smsSupp) {
    const k = 'SMS:' + suppressionKey('SMS', address);
    if (seenSupp.has(k)) continue;
    seenSupp.add(k);
    suppressions.push({ id: uuid(), created_at: at(days, 11), channel: 'SMS', address, reason });
  }

  // ── Campaigns ──
  const emailSuppKeys = new Set(suppressions.filter((s) => s.channel === 'Email').map((s) => suppressionKey('Email', s.address)));
  const lastWeek = partitionRecipients(matchRecipients(allActive.filters, accounts, policies.filter((p) => p.status === 'Active')), emailSuppKeys);
  const email_campaigns: EmailCampaign[] = [
    {
      id: uuid(), created_at: at(-9, 14), name: 'Fall coverage check-up', recipient_list_id: allActive.id, status: 'Sent',
      subject: 'Time for a quick coverage review, {first_name}',
      body: 'Hi {first_name},\n\nFall is a great time to make sure your coverage still fits your life. New car, home improvements or a teen driver? Reply to this email or give us a call and {agent} will review your policies — it only takes 15 minutes.\n\nThank you for trusting {agency}.\n\n{agent}\n{agency}',
      scheduled_at: null, sent_at: at(-7, 9, 30), sent_count: lastWeek.send.length, suppressed_count: lastWeek.suppressedCount,
    },
    {
      id: uuid(), created_at: at(-2, 16), name: 'Winter driving tips (TX auto)', recipient_list_id: autoTx.id, status: 'Scheduled',
      subject: 'Winter driving safety tips from {agency}',
      body: 'Hi {first_name},\n\nWinter weather can arrive fast in Texas. A few reminders:\n• Check tire tread and pressure\n• Keep an emergency kit in the trunk\n• Slow down on bridges and overpasses\n\nIf anything happens, call us first — we will help you through the claim.\n\n{agent}\n{agency}',
      scheduled_at: at(7, 8), sent_at: null, sent_count: 0, suppressed_count: 0,
    },
    {
      id: uuid(), created_at: at(-1, 11), name: 'Prospect follow-up', recipient_list_id: prospects.id, status: 'Draft',
      subject: 'Still shopping for insurance, {first_name}?',
      body: 'Hi {first_name},\n\nThanks again for considering {agency}. Your quote is still available — reply with any questions, or let us know a good time to talk.\n\n{agent}',
      scheduled_at: null, sent_at: null, sent_count: 0, suppressed_count: 0,
    },
  ];

  // ── Templates ──
  const tpl = (channel: MessageTemplate['channel'], name: string, body: string, subject: string | null, days: number): MessageTemplate => ({ id: uuid(), created_at: at(days, 8), channel, name, subject, body });
  const message_templates: MessageTemplate[] = [
    tpl('SMS', 'Payment due reminder', 'Hi {first_name}, friendly reminder from {agency}: a payment on your policy is due soon. Questions? Just reply here.', null, -90),
    tpl('SMS', 'ID cards sent', 'Hi {first_name}, your new ID cards were just emailed to you. Let us know if you need anything else. - {agent}', null, -88),
    tpl('SMS', 'Missing documents', 'Hi {first_name}, we still need a signed application to finish your policy. Can you sign today? - {agent}, {agency}', null, -80),
    tpl('SMS', 'Claim check-in', 'Hi {first_name}, checking in on your claim. Has the adjuster contacted you yet? Reply and we will help. - {agency}', null, -70),
    tpl('SMS', 'Review request', 'Thanks for choosing {agency}, {first_name}! If we took good care of you, would you leave us a quick review?', null, -60),
    tpl('Email', 'Renewal review', 'Hi {first_name},\n\nYour policy renews soon. {agent} would like to review your coverage and make sure you still have the best rate.\n\nWhen is a good time to talk?\n\n{agent}\n{agency}', 'Your renewal is coming up, {first_name}', -85),
    tpl('Email', 'Welcome to the agency', 'Hi {full_name},\n\nWelcome to {agency}! We are glad to have you. Save this email — reply any time you need ID cards, a policy change or help with a claim.\n\n{agent}', 'Welcome to {agency}', -75),
    tpl('Email', 'Referral thank-you', 'Hi {first_name},\n\nThank you for referring a friend to {agency}. Referrals are the biggest compliment we can receive.\n\nWith gratitude,\n{agent}', 'Thank you for the referral!', -50),
  ];

  // ── Postal mail ──
  const carrierOf = (i: number) => policies[i % Math.max(1, policies.length)]?.carrier ?? 'Progressive';
  const acct = (i: number) => (accounts.length ? accounts[i % accounts.length] : null);
  const mailDefs: [number, MailItem['direction'], string, string | null, number | null, string, string][] = [
    [-1, 'Inbound', 'Notice', carrierOf(0), 0, 'Notice of cancellation for non-payment — client called, payment arranged', 'Scanned'],
    [-2, 'Inbound', 'Check', carrierOf(1), 1, 'Claim settlement check payable to insured and agency', 'Received'],
    [-3, 'Inbound', 'Policy Documents', carrierOf(2), 2, 'Renewal declarations page and ID cards', 'Filed'],
    [-4, 'Outbound', 'Letter', null, 3, 'Welcome packet with signed application copy', 'Sent'],
    [-6, 'Inbound', 'Return Mail', 'USPS', 4, 'Returned: insufficient address — update mailing address on file', 'Returned'],
    [-8, 'Outbound', 'Policy Documents', null, 5, 'Mailed new ID cards (client has no email)', 'Sent'],
    [-11, 'Inbound', 'Letter', 'Lienholder — Texas Auto Finance', 6, 'Request for proof of insurance / evidence of coverage', 'Scanned'],
    [-15, 'Inbound', 'Notice', carrierOf(3), null, 'Carrier underwriting guideline update (agency-wide)', 'Filed'],
  ];
  const mail_items: MailItem[] = mailDefs.map(([days, direction, mail_type, correspondent, ai, description, status]) => {
    const a = ai === null ? null : acct(ai);
    return {
      id: uuid(), created_at: at(days, 13), account_id: a?.id ?? null, direction, mail_type,
      correspondent: correspondent ?? (a ? `${a.first_name} ${a.last_name}`.trim() || a.business_name : null), description, mail_date: addDays(today(), days), status,
    };
  });

  // ── eSignature templates ──
  const esign_templates: ESignTemplate[] = [
    { id: uuid(), created_at: at(-100, 9), name: 'New business application', description: 'Signed application for a newly bound policy', category: 'Application', message: 'Please review and sign “{document}” so we can finalize your new policy. Call us with any questions.' },
    { id: uuid(), created_at: at(-95, 9), name: 'UM/UIM rejection form', description: 'Uninsured motorist coverage selection or rejection', category: 'Signed Forms', message: 'Please review your uninsured motorist coverage selection in “{document}” and sign to confirm your choice.' },
    { id: uuid(), created_at: at(-90, 9), name: 'Policy change request', description: 'Client authorization for an endorsement', category: 'Correspondence', message: `Please sign “{document}” to authorize the requested change to your policy.${producer ? ` — ${producer}` : ''}` },
  ];

  return { recipient_lists, email_campaigns, suppressions, message_templates, mail_items, esign_templates };
}
