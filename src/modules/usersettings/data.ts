import { useMemo } from 'react';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import type { Staff, UserSettings } from '@/lib/types';

/* User settings: defaults, the signed-in user's row, preferences used elsewhere, and HTML sanitizing. */

export type Preferences = {
  time_zone: string; observe_dst: boolean; allow_support_login: boolean;
  show_recent: boolean; recent_applicants: number; recent_quotes: number;
  drivers_layout: 'stacked' | 'side_by_side';
  submit_all_auto: boolean; submit_all_home: boolean; submit_all_dwelling: boolean;
  payment_option: 'full' | 'monthly';
  sort_auto: SortPref; sort_home: SortPref; sort_dwelling: SortPref;
  view: 'standard' | 'compact';
  mute_bounce: boolean; mute_applicant_alert: boolean;
};
export type SortPref = 'premium_asc' | 'premium_desc' | 'carrier_az';

export const DEFAULT_PREFERENCES: Preferences = {
  time_zone: 'America/Chicago', observe_dst: true, allow_support_login: true,
  show_recent: true, recent_applicants: 10, recent_quotes: 10, drivers_layout: 'stacked',
  submit_all_auto: true, submit_all_home: true, submit_all_dwelling: true,
  payment_option: 'full', sort_auto: 'premium_asc', sort_home: 'premium_asc', sort_dwelling: 'premium_asc',
  view: 'standard', mute_bounce: true, mute_applicant_alert: false,
};

export type AcordSettings = {
  preferred_address: 'applicant' | 'agency' | 'producer';
  share_signature: boolean;
  signature_mode: 'type' | 'upload';
  signature_text: string;
  signature_image: string | null; // data URL
};

export const DEFAULT_ACORD: AcordSettings = { preferred_address: 'applicant', share_signature: false, signature_mode: 'type', signature_text: '', signature_image: null };

export const ROLE_DETAILS = ['Producer', 'Principal/Owner', 'CSR/Account Manager', 'Manager/Operations', 'Marketing/Sales Manager', 'Admin/Office Assistant', 'Other'];

export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: '(GMT -05:00) Eastern Time' },
  { value: 'America/Chicago', label: '(GMT -06:00) Central Time' },
  { value: 'America/Denver', label: '(GMT -07:00) Mountain Time' },
  { value: 'America/Phoenix', label: '(GMT -07:00) Arizona' },
  { value: 'America/Los_Angeles', label: '(GMT -08:00) Pacific Time' },
  { value: 'America/Anchorage', label: '(GMT -09:00) Alaska' },
  { value: 'Pacific/Honolulu', label: '(GMT -10:00) Hawaii' },
];

export const prefsOf = (row: UserSettings | null | undefined): Preferences => ({ ...DEFAULT_PREFERENCES, ...(row?.preferences as Partial<Preferences> | undefined) });
export const acordOf = (row: UserSettings | null | undefined): AcordSettings => ({ ...DEFAULT_ACORD, ...(row?.acord as Partial<AcordSettings> | undefined) });

/** Contact defaults for a staff member without a settings row yet. */
export function defaultSettingsFor(staff: Staff): Partial<UserSettings> {
  const [first, ...rest] = staff.name.split(' ');
  return {
    staff_name: staff.name, first_name: first ?? '', last_name: rest.join(' '), email: staff.email, phone: null, mobile_phone: null,
    middle_initial: null, role_detail: null, preferences: { ...DEFAULT_PREFERENCES }, acord: { ...DEFAULT_ACORD, signature_text: staff.name },
    email_signature: null, reply_to: staff.email, signature_insert: 'smart_tag', signature_global_default: false, display_global: false,
    password_hash: null, password_salt: null, password_updated_at: null, totp_secret: null, totp_enabled: false,
  };
}

/** The signed-in user's settings row (live) plus a save helper that creates it on first save. */
export function useMySettings() {
  const { me } = useAppData();
  const rows = useTable('user_settings', me ? { eq: { staff_name: me.name } } : null);
  const row = rows.data[0] ?? null;
  const save = async (patch: Partial<UserSettings>) => {
    if (!me) throw new Error('No signed-in user');
    const existing = row ?? (await db.list('user_settings', { eq: { staff_name: me.name } }))[0];
    return existing ? db.update('user_settings', existing.id, patch) : db.insert('user_settings', { ...defaultSettingsFor(me), ...patch });
  };
  return { me, row, loading: rows.loading, save };
}

/** Preferences of the signed-in user (defaults when none saved). */
export function useUserPreferences() {
  const { row } = useMySettings();
  return useMemo(() => prefsOf(row), [row]);
}

/** Settings rows keyed by staff name (for sign-in and shared signatures). */
export function useAllSettings() {
  const rows = useTable('user_settings', {});
  return useMemo(() => new Map(rows.data.map((r) => [r.staff_name, r])), [rows.data]);
}

// ── HTML sanitizing for email signatures (allowlist) ──

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'P', 'DIV', 'BR', 'SPAN', 'FONT', 'UL', 'OL', 'LI', 'A', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'IMG', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'SUB', 'SUP', 'HR']);
const ALLOWED_STYLES = ['color', 'background-color', 'font-size', 'font-family', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'margin-left', 'padding-left'];
const SAFE_URL = /^(https?:|mailto:)/i;
const SAFE_IMG = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;

/** Removes everything but a small set of formatting tags/attributes/styles. Safe to render with innerHTML. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const clean = (el: Element) => {
    for (const child of [...el.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unknown container: keep its text/children for harmless tags, drop dangerous ones entirely.
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH'].includes(child.tagName)) child.remove();
        else { clean(child); child.replaceWith(...child.childNodes); }
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const keep =
          (name === 'href' && child.tagName === 'A' && SAFE_URL.test(attr.value.trim())) ||
          (name === 'src' && child.tagName === 'IMG' && SAFE_IMG.test(attr.value.trim())) ||
          (name === 'alt' && child.tagName === 'IMG') ||
          (['width', 'height'].includes(name) && /^\d{1,4}%?$/.test(attr.value)) ||
          (['color', 'size', 'face'].includes(name) && child.tagName === 'FONT' && /^[\w #,.-]{1,40}$/.test(attr.value)) ||
          (['colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing'].includes(name) && /^\d{1,2}$/.test(attr.value)) ||
          name === 'style';
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.hasAttribute('style')) {
        const s = (child as HTMLElement).style;
        const kept = ALLOWED_STYLES.map((p) => [p, s.getPropertyValue(p)] as const).filter(([, v]) => v && !/url\(|expression|javascript:/i.test(v));
        child.removeAttribute('style');
        if (kept.length) child.setAttribute('style', kept.map(([p, v]) => `${p}: ${v}`).join('; '));
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      clean(child);
    }
  };
  clean(root);
  return root.innerHTML;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Default signature HTML from contact info + agency. */
export function defaultSignatureHtml(v: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }, agency: { name?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null) {
  const lines = [
    `<b>${escapeHtml(`${v.first_name ?? ''} ${v.last_name ?? ''}`.trim())}</b>`,
    agency?.name && escapeHtml(agency.name),
    agency?.address && escapeHtml(agency.address),
    (agency?.city || agency?.state) && escapeHtml(`${agency?.city ?? ''}, ${agency?.state ?? ''} ${agency?.zip ?? ''}`.trim()),
    v.email && escapeHtml(v.email),
    v.phone && escapeHtml(v.phone),
  ].filter(Boolean);
  return lines.join('<br>');
}

/** The signature a user should send with, honoring an agency-wide default set by another user. */
export function effectiveSignature(mine: UserSettings | null, all: Map<string, UserSettings>): { html: string | null; insert: 'auto' | 'smart_tag'; lockedBy: string | null } {
  const global = [...all.values()].find((r) => r.signature_global_default && r.staff_name !== mine?.staff_name);
  if (global) return { html: global.email_signature, insert: global.display_global ? global.signature_insert : mine?.signature_insert ?? 'smart_tag', lockedBy: global.staff_name };
  return { html: mine?.email_signature ?? null, insert: mine?.signature_insert ?? 'smart_tag', lockedBy: null };
}

// ── Preferences applied by the quoting screens ──

type PrefLine = 'auto' | 'home' | 'dwelling' | null;
const prefLine = (line: string): PrefLine =>
  /Auto|Motorcycle/.test(line) && !/Commercial/.test(line) ? 'auto' : /Homeowners|Condo|Renters/.test(line) ? 'home' : /Dwelling/.test(line) ? 'dwelling' : null;

/** Whether new quotes on this line start with every ready carrier checked. Lines without a preference default to yes. */
export function submitAllFor(p: Preferences, line: string) {
  const k = prefLine(line);
  return k ? p[`submit_all_${k}`] : true;
}

/** Result sort order for this line. */
export function sortPrefFor(p: Preferences, line: string | null | undefined): SortPref {
  const k = line ? prefLine(line) : null;
  return k ? p[`sort_${k}`] : 'premium_asc';
}

/** Orders rated carriers: quoted first, then by the chosen preference. */
export function sortByPref<T extends { status: string; premium: number | null; carrier: string }>(rates: T[], pref: SortPref): T[] {
  const rank = (r: T) => (r.status === 'Quoted' ? 0 : r.status === 'Error' ? 1 : 2);
  const by = (a: T, b: T) =>
    pref === 'carrier_az' ? a.carrier.localeCompare(b.carrier)
      : pref === 'premium_desc' ? (b.premium ?? 0) - (a.premium ?? 0) || a.carrier.localeCompare(b.carrier)
        : (a.premium ?? 0) - (b.premium ?? 0) || a.carrier.localeCompare(b.carrier);
  return [...rates].sort((a, b) => rank(a) - rank(b) || by(a, b));
}

/** ACORD data-sheet extras from the preparing user's settings: preferred address, contact details and signature. */
export function acordUserContext(row: UserSettings | null | undefined, me: Staff | null) {
  const a = acordOf(row);
  const name = row ? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || me?.name || '' : me?.name ?? '';
  return {
    preferredAddress: a.preferred_address,
    producerContact: me ? { name, email: row?.email ?? me.email, phone: row?.phone ?? null } : null,
    signature: a.signature_mode === 'upload' ? { text: null, image: a.signature_image } : { text: a.signature_text || null, image: null },
  };
}

// ── Signatures on outgoing (simulated) email ──

/** Plain-text version of signature HTML (message bodies are plain text). */
export function signatureText(html: string | null | undefined) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${sanitizeHtml(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-3])>/gi, '$&\n')}</div>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type SendSignature = { text: string; insert: 'auto' | 'smart_tag' };

/** The signature a staff member sends with (honoring an agency-wide default), loaded fresh at send time. */
export async function loadSendSignature(staffName: string | null | undefined): Promise<SendSignature | null> {
  if (!staffName) return null;
  const [rows, staff, agency] = await Promise.all([db.list('user_settings'), db.list('staff'), db.list('agency_settings', { limit: 1 })]);
  const all = new Map(rows.map((r) => [r.staff_name, r]));
  const mine = all.get(staffName) ?? null;
  const eff = effectiveSignature(mine, all);
  // Smart tags inside the signature describe the sender.
  const person = staff.find((s) => s.name === staffName);
  const tags: Record<string, string> = {
    agent_name: mine ? `${mine.first_name ?? ''} ${mine.last_name ?? ''}`.trim() || staffName : staffName,
    agent_email: mine?.email ?? person?.email ?? '',
    agent_phone: mine?.phone ?? '',
    agency_name: agency[0]?.name ?? '',
    agency_phone: agency[0]?.phone ?? '',
  };
  const text = signatureText(eff.html).replace(/\{(agent_name|agent_email|agent_phone|agency_name|agency_phone)\}/g, (_, k: string) => tags[k]);
  return text ? { text, insert: eff.insert } : null;
}

/** Fills {agent_signature}; with the "auto" rule, appends the signature when the body has no tag. */
export function applySignature(body: string, sig: SendSignature | null) {
  const tag = /\{agent_signature\}/g;
  if (!sig) return body.replace(tag, '');
  if (/\{agent_signature\}/.test(body)) return body.replace(tag, () => sig.text);
  return sig.insert === 'auto' ? `${body.trimEnd()}\n\n${sig.text}` : body;
}
