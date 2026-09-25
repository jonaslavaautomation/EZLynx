import { uuid } from '@/lib/db';
import type { LoginEvent, Staff, UserSettings } from '@/lib/types';
import { DEFAULT_ACORD, DEFAULT_PREFERENCES } from './data';

const ROLE_DETAIL: Record<Staff['role'], string> = {
  'Agency Owner': 'Principal/Owner', Admin: 'Manager/Operations', Producer: 'Producer', CSR: 'CSR/Account Manager', 'Account Manager': 'CSR/Account Manager',
};

const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];

/**
 * Deterministic User Settings demo data: a contact/preferences row per active staff member and a few weeks of
 * sign-in history. No passwords or two-factor secrets are seeded, so every demo user can sign in freely.
 * Sample IPs use the 203.0.113.0/24 documentation range.
 */
export function buildUserSettingsSample(d: { staff: Staff[] }): { user_settings: UserSettings[]; login_events: LoginEvent[] } {
  const now = Date.now();
  const active = d.staff.filter((s) => s.active);
  const user_settings = active.map((s, i): UserSettings => {
    const [first, ...rest] = s.name.split(' ');
    return {
      id: uuid(), created_at: new Date(now - 90 * 864e5).toISOString(), staff_name: s.name,
      first_name: first ?? '', middle_initial: null, last_name: rest.join(' '), email: s.email,
      phone: `(555) 010-${String(1200 + i * 7).padStart(4, '0')}`, mobile_phone: null, role_detail: ROLE_DETAIL[s.role] ?? 'Other',
      preferences: { ...DEFAULT_PREFERENCES }, acord: { ...DEFAULT_ACORD, signature_text: s.name },
      email_signature: null, reply_to: s.email, signature_insert: 'smart_tag', signature_global_default: false, display_global: false,
      password_hash: null, password_salt: null, password_updated_at: null, totp_secret: null, totp_enabled: false,
    };
  });

  // ~25 events over the last 28 days, spread across users; newest first isn't required (the UI sorts).
  const login_events: LoginEvent[] = [];
  for (let k = 0; k < 26 && active.length; k++) {
    const s = active[k % active.length];
    const day = Math.floor((k * 28) / 26);
    const at = new Date(now - day * 864e5 - (8 + (k % 5)) * 36e5 - (k * 7 % 60) * 6e4);
    const event = k % 9 === 4 ? 'Failed Login' : k % 3 === 2 ? 'User Logout' : 'User Login';
    login_events.push({
      id: uuid(), created_at: at.toISOString(), staff_name: s.name, event,
      ip: `203.0.113.${10 + (k % active.length) * 11}`, user_agent: AGENTS[k % AGENTS.length], trusted: k % 4 === 0 && event !== 'Failed Login',
    });
  }
  return { user_settings, login_events };
}
