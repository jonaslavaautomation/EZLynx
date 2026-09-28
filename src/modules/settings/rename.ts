import { db, getDbMode, initDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { TableMap, TableName } from '@/lib/types';
import { renameSessionUser } from '@/modules/usersettings/session';

/**
 * Sets `column` to `to` on every row of `table` where it currently equals `from` (used to carry a
 * staff/carrier rename to records that reference it by name).
 * Supabase: one bulk UPDATE — atomic and not subject to the 1000-row select cap. Local: per-row updates.
 */
export async function renameWhere<K extends TableName>(table: K, column: keyof TableMap[K] & string, from: string, to: string) {
  await initDb();
  if (getDbMode() === 'supabase') {
    const { error } = await supabase.from(table).update({ [column]: to } as never).eq(column as string, from as never);
    if (error) throw new Error(error.message);
    db.touchAll([table]);
    return;
  }
  const rows = await db.list(table, { eq: { [column]: from } as never });
  for (const r of rows) await db.update(table, r.id, { [column]: to } as never);
}

/** When a staff member is renamed, carry the new name to every record that references staff by name. */
export async function renameStaffReferences(oldName: string, newName: string) {
  await renameWhere('accounts', 'producer', oldName, newName);
  await renameWhere('accounts', 'csr', oldName, newName);
  await renameWhere('policies', 'producer', oldName, newName);
  await renameWhere('activities', 'assigned_to', oldName, newName);
  await renameWhere('agency_settings', 'current_user_name', oldName, newName);
  // Name-keyed personal data: sign-in (password / 2FA), history, commission splits, training, reports, apps.
  await renameWhere('user_settings', 'staff_name', oldName, newName);
  await renameWhere('login_events', 'staff_name', oldName, newName);
  await renameWhere('commission_rules', 'staff_name', oldName, newName);
  await renameWhere('training_progress', 'staff_name', oldName, newName);
  await renameWhere('training_registrations', 'staff_name', oldName, newName);
  await renameWhere('saved_reports', 'owner', oldName, newName);
  await renameWhere('integrations', 'activated_by', oldName, newName);
  await renameWhere('support_tickets', 'requester', oldName, newName);
  for (const d of await db.list('departments')) {
    if (d.members.includes(oldName)) await db.update('departments', d.id, { members: d.members.map((m) => (m === oldName ? newName : m)) });
  }
  renameSessionUser(oldName, newName);
}
