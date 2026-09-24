import { db, getDbMode, initDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { TableMap, TableName } from '@/lib/types';

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
