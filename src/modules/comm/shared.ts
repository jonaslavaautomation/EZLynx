import { db } from '@/lib/db';
import { accountName } from '@/lib/format';
import type { Account, AgencySettings, EmailCampaign, Message, Policy, RecipientFilters } from '@/lib/types';
import { EMAIL_RE, suppressedKeys, suppressionKey } from './suppression';

export const MERGE_FIELDS = ['{first_name}', '{last_name}', '{full_name}', '{agency}', '{agent}'] as const;

export const SIMULATED_NOTE = 'Delivery is simulated — no real emails leave the system. Each recipient gets an Email row in their message history.';

export const ACCOUNT_STATUSES = ['Prospect', 'Active', 'Pending', 'Inactive'] as const;
export const MAIL_TYPES = ['Letter', 'Check', 'Notice', 'Policy Documents', 'Return Mail'];
export const MAIL_STATUSES = ['Received', 'Scanned', 'Sent', 'Returned', 'Filed'];
export const EMAIL_REASONS = ['Unsubscribed', 'Bounced', 'Manual'];
export const SMS_REASONS = ['STOP reply', 'Manual'];

export const hasValidEmail = (a: Pick<Account, 'email'>) => !!a.email && EMAIL_RE.test(a.email.trim());

// ── Recipient lists ──

/** Pure filter: the accounts matching `filters`, given all accounts and policies. */
export function matchRecipients(filters: RecipientFilters, accounts: Account[], policies: Policy[]) {
  const lines = filters.lines ?? [];
  const withLine = lines.length
    ? new Set(policies.filter((p) => p.status === 'Active' && lines.includes(p.line_of_business)).map((p) => p.account_id))
    : null;
  const statuses = filters.statuses ?? [];
  const states = filters.states ?? [];
  return accounts.filter((a) => {
    if (filters.account_type && (a.account_type ?? 'Personal') !== filters.account_type) return false;
    if (statuses.length && !statuses.includes(a.status ?? 'Active')) return false;
    if (filters.producer && a.producer !== filters.producer) return false;
    if (states.length && !states.includes((a.state ?? '').toUpperCase())) return false;
    if (withLine && !withLine.has(a.id)) return false;
    if (filters.has_email !== false && !hasValidEmail(a)) return false;
    return true;
  });
}

/** Accounts matching a recipient list's filters (fetched fresh from the database). */
export async function resolveRecipients(filters: RecipientFilters): Promise<Account[]> {
  const [accounts, policies] = await Promise.all([
    db.list('accounts'),
    filters.lines?.length ? db.list('policies', { eq: { status: 'Active' } }) : Promise.resolve([] as Policy[]),
  ]);
  return matchRecipients(filters, accounts, policies);
}

export function describeFilters(f: RecipientFilters) {
  const parts: string[] = [];
  if (f.account_type) parts.push(f.account_type);
  if (f.statuses?.length) parts.push(f.statuses.join('/'));
  if (f.lines?.length) parts.push(`Active ${f.lines.join(', ')}`);
  if (f.states?.length) parts.push(`in ${f.states.join(', ')}`);
  if (f.producer) parts.push(`producer ${f.producer}`);
  return parts.length ? parts.join(' · ') : 'All accounts with an email';
}

/** Splits recipients into those to email and those skipped for suppression (deduplicating addresses). */
export function partitionRecipients(recipients: Account[], suppressed: Set<string>) {
  const seen = new Set<string>();
  const send: Account[] = [];
  let suppressedCount = 0;
  for (const a of recipients) {
    const key = suppressionKey('Email', a.email);
    if (seen.has(key)) continue;
    seen.add(key);
    if (suppressed.has(key)) suppressedCount++;
    else send.push(a);
  }
  return { send, suppressedCount };
}

// ── Merge fields & email content ──

export function mergeFields(text: string, account: Account | null, settings: AgencySettings | null, agent: string | null | undefined) {
  const first = account ? (account.first_name || (account.account_type === 'Commercial' ? account.business_name ?? '' : '')) : '';
  const full = account ? accountName(account) : '';
  return text
    .replace(/\{first_name\}/g, () => first || 'there')
    .replace(/\{last_name\}/g, () => account?.last_name ?? '')
    .replace(/\{full_name\}/g, () => full || 'Valued Client')
    .replace(/\{agency\}/g, () => settings?.name || 'our agency')
    .replace(/\{agent\}/g, () => agent || settings?.name || 'your agent');
}

export function defaultFooter(s: AgencySettings | null) {
  if (!s) return '';
  const cityLine = [s.city, [s.state, s.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [s.name, s.address, cityLine, s.phone].filter(Boolean).join('\n');
}

export const footerOf = (s: AgencySettings | null) => (s?.email_footer?.trim() ? s.email_footer.trim() : defaultFooter(s));

export const UNSUBSCRIBE_LINE = 'Unsubscribe — you are receiving this because you are a client of our agency. Reply UNSUBSCRIBE to stop these emails.';

export function composeEmailBody(body: string, account: Account | null, settings: AgencySettings | null, agent: string | null | undefined) {
  const footer = footerOf(settings);
  return [mergeFields(body, account, settings, agent).trim(), '—', footer, UNSUBSCRIBE_LINE].filter(Boolean).join('\n\n');
}

// ── Sending ──

const inFlight = new Set<string>();

export type SendResult = { sent: number; suppressed: number };

/**
 * Sends (simulated) a campaign: resolves the list, drops suppressed/duplicate addresses, writes one Email
 * message per recipient in batches of 200, then marks the campaign Sent. Guarded against double sends.
 */
export async function sendCampaign(campaignId: string, settings: AgencySettings | null, agent: string | null | undefined): Promise<SendResult> {
  if (inFlight.has(campaignId)) throw new Error('This campaign is already being sent');
  inFlight.add(campaignId);
  try {
    const c = await db.get('email_campaigns', campaignId);
    if (!c) throw new Error('Campaign not found');
    if (c.status === 'Sent') throw new Error('This campaign has already been sent');
    if (!c.subject.trim() || !c.body.trim()) throw new Error('The campaign needs a subject and body before sending');
    if (!c.recipient_list_id) throw new Error('Choose a recipient list before sending');
    const list = await db.get('recipient_lists', c.recipient_list_id);
    if (!list) throw new Error('The recipient list for this campaign no longer exists');
    const [recipients, suppressed] = await Promise.all([resolveRecipients(list.filters ?? {}), suppressedKeys('Email')]);
    const { send, suppressedCount } = partitionRecipients(recipients, suppressed);
    const sentAt = new Date().toISOString();
    const rows: Partial<Message>[] = send.map((a) => ({
      account_id: a.id, channel: 'Email', direction: 'Outbound', to_address: a.email.trim(),
      subject: mergeFields(c.subject, a, settings, agent).trim(), body: composeEmailBody(c.body, a, settings, agent),
      status: 'Delivered', read: true, created_at: sentAt,
    }));
    for (let i = 0; i < rows.length; i += 200) await db.insertMany('messages', rows.slice(i, i + 200), { silent: true });
    if (rows.length) db.touchAll(['messages']);
    await db.update('email_campaigns', c.id, { status: 'Sent', sent_at: sentAt, sent_count: send.length, suppressed_count: suppressedCount });
    return { sent: send.length, suppressed: suppressedCount };
  } finally {
    inFlight.delete(campaignId);
  }
}

/** Regex matching a campaign subject after merge fields have been filled in. */
export function subjectMatcher(subject: string) {
  const esc = subject.trim().split(/\{(?:first_name|last_name|full_name|agency|agent)\}/g).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${esc.join('.*')}$`, 's');
}

/** The message rows written for a sent campaign (Email, outbound, matching subject, within 2 min after sent_at). */
export function campaignMessages(c: EmailCampaign, messages: Message[]) {
  if (!c.sent_at) return [];
  const start = new Date(c.sent_at).getTime() - 1000;
  const end = start + 2 * 60 * 1000 + 1000;
  const re = subjectMatcher(c.subject);
  return messages.filter((m) => {
    if (m.channel !== 'Email' || m.direction !== 'Outbound') return false;
    const t = new Date(m.created_at).getTime();
    return t >= start && t <= end && re.test(m.subject ?? '');
  });
}

// ── Dates ──

/** ISO timestamp → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── File import ──

/** First column of each line of a CSV/TXT file (quotes stripped). */
export function parseOneColumn(text: string) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a UTF-8 BOM
  return clean.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return '';
    const m = /^"((?:[^"]|"")*)"/.exec(t);
    const first = m ? m[1].replace(/""/g, '"') : t.split(/[,;\t]/)[0];
    return first.trim();
  });
}
