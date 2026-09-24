import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName } from '@/lib/format';
import type { Account, AgencySettings, Message } from '@/lib/types';
import { isSuppressed, suppressedMessage } from '@/modules/comm/suppression';

export type Channel = Message['channel'];

export const SMS_LIMIT = 160;

// GSM 03.38 basic character set; `GSM_EXT` characters take two septets (escape + char).
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

export type SmsInfo = { units: number; limit: number; segments: number; unicode: boolean };

/**
 * Length/segment info for an SMS body. GSM-7 text: 160 per single message, 153 per concatenated part.
 * Any character outside GSM-7 (emoji, smart quotes, em dashes…) forces UCS-2: 70 single / 67 per part.
 */
export function smsInfo(text: string): SmsInfo {
  let septets = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) septets += 1;
    else if (GSM_EXT.includes(ch)) septets += 2;
    else { unicode = true; break; }
  }
  const units = unicode ? text.length : septets;
  const [single, multi] = unicode ? [70, 67] : [SMS_LIMIT, 153];
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { units, limit: single, segments, unicode };
}

/** Number of SMS segments a body needs. */
export function smsSegments(text: string) {
  return smsInfo(text).segments;
}

export type MessageTemplate = { id: string; label: string; subject: string; body: string };

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 'id-cards', label: 'ID cards ready', subject: 'Your insurance ID cards are ready', body: 'Hi {first_name}, your new insurance ID cards are ready. Reply here and we can text or email a copy right away. — {agent}, {agency}' },
  { id: 'payment', label: 'Payment reminder', subject: 'Friendly payment reminder', body: 'Hi {first_name}, this is a friendly reminder from {agency} that a payment on your policy is coming due. Let us know if you have any questions!' },
  { id: 'renewal', label: 'Renewal coming up', subject: 'Your policy renewal is coming up', body: 'Hi {first_name}, your policy is renewing soon. {agent} at {agency} would love to review your coverage and make sure you have the best rate. When is a good time to talk?' },
  { id: 'quote', label: 'Quote follow-up', subject: 'Following up on your quote', body: 'Hi {first_name}, following up on the quote we prepared for you. Do you have any questions, or would you like to move forward? — {agent}, {agency}' },
  { id: 'birthday', label: 'Birthday', subject: 'Happy birthday from {agency}!', body: 'Happy birthday, {first_name}! Wishing you a wonderful year ahead from all of us at {agency}.' },
  { id: 'thanks', label: 'Thank you', subject: 'Thank you for your business', body: 'Hi {first_name}, thank you for choosing {agency}. We appreciate your business — reach out anytime you need us!' },
];

export function fillTemplate(text: string, account: Account | null, settings: AgencySettings | null, agent: string | null | undefined) {
  const first = account ? (account.account_type === 'Commercial' && account.business_name && !account.first_name ? account.business_name : account.first_name) : '';
  // Function replacers so values containing `$&`, `$1`, `$$`… are inserted literally.
  return text
    .replace(/\{first_name\}/g, () => first || 'there')
    .replace(/\{last_name\}/g, () => account?.last_name ?? '')
    .replace(/\{full_name\}/g, () => (account ? accountName(account) : '') || 'there')
    .replace(/\{agency\}/g, () => settings?.name || 'our agency')
    .replace(/\{agent\}/g, () => agent || settings?.name || 'your agent');
}

export function defaultAddress(account: Account | null, channel: Channel) {
  if (!account) return '';
  return channel === 'SMS' ? account.mobile_phone || account.phone || '' : account.email || '';
}

export function validateAddress(channel: Channel, to: string): string | null {
  const v = to.trim();
  if (!v) return channel === 'SMS' ? 'A mobile number is required' : 'An email address is required';
  if (channel === 'SMS') {
    const digits = v.replace(/\D/g, '');
    if (!/^\+?[\d\s().-]+$/.test(v) || digits.length < 10 || digits.length > 15) return 'Enter a valid 10-digit phone number';
  }
  if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  return null;
}

/**
 * Stores an outbound message. Delivery is simulated: status starts at 'Sent' and flips to 'Delivered'
 * ~1.5s later to mimic a carrier receipt. Also logs a lightweight activity on the account.
 */
export async function sendMessage(account: Account, v: { channel: Channel; to: string; subject?: string; body: string; agent?: string | null }) {
  // Opted-out numbers / suppressed addresses are never contacted (Communication Center suppression lists).
  if (await isSuppressed(v.channel, v.to)) throw new Error(suppressedMessage(v.channel));
  const row = await db.insert('messages', {
    account_id: account.id, channel: v.channel, direction: 'Outbound', to_address: v.to.trim(),
    subject: v.channel === 'Email' ? (v.subject?.trim() || null) : null, body: v.body.trim(), status: 'Sent', read: true,
  });
  // Only flip a message that still exists and hasn't changed status (e.g. deleted with its account).
  setTimeout(() => {
    db.get('messages', row.id)
      .then((cur) => (cur && cur.status === 'Sent' ? db.update('messages', row.id, { status: 'Delivered' }) : null))
      .catch(() => {});
  }, 1500);
  const base = { account_id: account.id, description: v.body.trim(), assigned_to: v.agent ?? null };
  await logActivity(v.channel === 'Email'
    ? { ...base, type: 'Email', subject: v.subject?.trim() ? `Email sent: ${v.subject.trim()}` : 'Email sent' }
    : { ...base, type: 'Note', subject: 'Text sent' }).catch(() => {});
  return row;
}
