import { db } from '@/lib/db';
import { renameStaffReferences } from '@/modules/settings/rename';
import { logEvent } from '@/modules/usersettings/session';

/** The agency owner / producer this portal always runs as (there is no sign-in screen). */
export const OWNER_NAME = 'Nash Rosauro';
const OWNER_EMAIL = 'nash@northstar-agency.example';
// The owner in sample data created before the owner was Nash Rosauro.
const OLD_SAMPLE_OWNER = { name: 'Morgan Nash', email: 'morgan@northstar-agency.example' };

/**
 * Makes sure Nash Rosauro exists as an active Agency Owner and is the agency's current user. Older sample data is
 * carried over by renaming its owner, so every client, policy and task assigned to that owner becomes Nash's.
 */
export async function ensureOwner() {
  const [staff, settings] = await Promise.all([db.list('staff'), db.list('agency_settings', { order: { column: 'created_at' }, limit: 1 })]);
  const s = settings[0];
  if (!s) return; // agency not set up yet
  const owner = staff.find((m) => m.name === OWNER_NAME);
  if (!owner) {
    const old = staff.find((m) => m.name === OLD_SAMPLE_OWNER.name && m.email === OLD_SAMPLE_OWNER.email);
    if (old) {
      await db.update('staff', old.id, { name: OWNER_NAME, email: OWNER_EMAIL, role: 'Agency Owner', active: true });
      await renameStaffReferences(old.name, OWNER_NAME);
    } else {
      await db.insert('staff', { name: OWNER_NAME, email: OWNER_EMAIL, role: 'Agency Owner', active: true, color: '#684ec2', service_team: true, external: false, producer_code: null });
    }
  } else if (!owner.active || owner.role !== 'Agency Owner') {
    await db.update('staff', owner.id, { active: true, role: 'Agency Owner' });
  }
  if (s.current_user_name !== OWNER_NAME) await db.update('agency_settings', s.id, { current_user_name: OWNER_NAME });
  db.touchAll(['staff', 'agency_settings', 'accounts', 'policies', 'activities']);
}

/** Logs one "User Login" per browser tab for the Login Activity tab (there is no sign-in step to log it). */
export function recordVisit() {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return;
    sessionStorage.setItem(VISIT_KEY, '1');
  } catch { return; }
  void logEvent(OWNER_NAME, 'User Login');
}
const VISIT_KEY = 'northstar-ams:visit-logged';
