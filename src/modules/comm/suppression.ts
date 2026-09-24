import { db } from '@/lib/db';
import type { Suppression } from '@/lib/types';

/**
 * Suppression-list helpers with no UI dependencies (safe to import from the messages module).
 * Email addresses compare case-insensitively; phone numbers compare by their last 10 digits.
 */

export type SuppressionChannel = Suppression['channel'];

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function normalizePhone(v: string) {
  const d = v.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** Canonical comparison key for an address on a channel. */
export function suppressionKey(channel: SuppressionChannel, address: string) {
  return channel === 'Email' ? address.trim().toLowerCase() : normalizePhone(address);
}

export function isValidPhone(v: string) {
  const t = v.trim();
  return /^\+?[\d\s().-]+$/.test(t) && normalizePhone(t).length === 10;
}

/** Returns the error for an address that can't go on the list, or null. */
export function validateSuppressionAddress(channel: SuppressionChannel, address: string): string | null {
  const v = address.trim();
  if (!v) return channel === 'Email' ? 'Email address is required' : 'Phone number is required';
  if (channel === 'Email' && !EMAIL_RE.test(v)) return 'Enter a valid email address';
  if (channel === 'SMS' && !isValidPhone(v)) return 'Enter a valid 10-digit phone number';
  return null;
}

/** Set of comparison keys for everything on a channel's suppression list. */
export async function suppressedKeys(channel: SuppressionChannel) {
  const rows = await db.list('suppressions', { eq: { channel } });
  return new Set(rows.map((r) => suppressionKey(channel, r.address)));
}

export async function isSuppressed(channel: SuppressionChannel, address: string) {
  if (!address.trim()) return false;
  return (await suppressedKeys(channel)).has(suppressionKey(channel, address));
}

export function suppressedMessage(channel: SuppressionChannel) {
  return channel === 'SMS'
    ? 'This number opted out of texts (it is on the SMS suppression list).'
    : 'This address is on the email suppression list (unsubscribed or bounced).';
}
