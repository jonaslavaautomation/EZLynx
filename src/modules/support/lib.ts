import { db } from '@/lib/db';
import type { Priority, SupportTicket, TicketMessage } from '@/lib/types';
import type { Tone } from '@/components/ui';
import { OPEN_CHAT_EVENT } from '@/components/SideNav';

/** Opens the floating support chat (SupportChatHost listens for this). */
export const openChat = () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT));

export const TICKET_STATUSES: SupportTicket['status'][] = ['Open', 'Pending', 'Resolved', 'Closed'];
export const TICKET_PRIORITIES: Priority[] = ['Low', 'Normal', 'High'];
export const TICKET_CATEGORIES = [
  'General', 'Applicants & Quoting', 'Quoting & Rating', 'Policy Servicing', 'Claims', 'Documents & eSignature', 'Communication Center',
  'Commissions & Accounting', 'Reports', 'Settings & Administration', 'Data & Integrations', 'Training', 'Chat',
];

export const STATUS_TONE: Record<SupportTicket['status'], Tone> = { Open: 'blue', Pending: 'amber', Resolved: 'green', Closed: 'gray' };

/** Short human-friendly reference derived from the row id (the table has no sequence column). */
export const ticketNumber = (t: Pick<SupportTicket, 'id'>) => `NS-${t.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export const lastActivity = (t: SupportTicket) => t.messages[t.messages.length - 1]?.at ?? t.created_at;

export async function createTicket(v: { subject: string; category: string; priority: Priority; requester: string | null; messages: TicketMessage[] }) {
  return db.insert('support_tickets', { ...v, status: 'Open' });
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Normalizes a stored website into an absolute http(s) URL, or null when it doesn't look like one. */
export function safeWebsite(url: string | null | undefined) {
  if (!url) return null;
  const s = url.trim();
  const abs = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(abs);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const HELPFUL_KEY = 'northstar-ams:kb-helpful:';
export function readHelpful(slug: string): 'yes' | 'no' | null {
  try {
    const v = localStorage.getItem(HELPFUL_KEY + slug);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null;
  }
}
export function writeHelpful(slug: string, v: 'yes' | 'no' | null) {
  try {
    if (v) localStorage.setItem(HELPFUL_KEY + slug, v);
    else localStorage.removeItem(HELPFUL_KEY + slug);
  } catch { /* storage unavailable */ }
}
