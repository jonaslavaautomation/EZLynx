import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { DocumentRow, TableMap, TableName } from '@/lib/types';

/**
 * Data access for every AMS table.
 *
 * Two backends share one API:
 *  - `supabase`: used when the AMS migration has been applied to the connected project.
 *  - `local`: browser localStorage, used automatically when the schema is missing (or Supabase is
 *    unreachable) so the portal stays fully usable as a demo.
 *
 * Every mutation emits a change event for its table; `useTable`/`useRow` in `@/lib/hooks` listen for
 * these and re-fetch, so screens stay in sync without manual refreshes.
 */

export type DbMode = 'supabase' | 'local';

type Row<K extends TableName> = TableMap[K];
type NewRow<K extends TableName> = Partial<Row<K>>;

export type ListQuery<K extends TableName> = {
  /** Equality filters, e.g. `{ account_id: id }`. `null` matches NULL. */
  eq?: Partial<Record<keyof Row<K>, string | number | boolean | null>>;
  /** Column value must be one of `values`. */
  in?: { column: keyof Row<K>; values: (string | number)[] };
  order?: { column: keyof Row<K>; ascending?: boolean };
  limit?: number;
};

const LOCAL_PREFIX = 'northstar-ams:v1:';
const MODE_OVERRIDE_KEY = 'northstar-ams:mode';
const LOCAL_FILE_LIMIT = 1.5 * 1024 * 1024;
const PAGE = 1000; // PostgREST's default max rows per response
const IN_CHUNK = 100; // keeps `in.(…)` request URLs well under server limits

// When a row in the key table is deleted, rows in these tables pointing at it are deleted (cascade)
// or have the reference cleared (set null). Mirrors the FK rules in the migration for local mode.
const CASCADES: Partial<Record<TableName, { table: TableName; column: string; action: 'delete' | 'null' }[]>> = {
  accounts: (['drivers', 'vehicles', 'properties', 'policies', 'policy_transactions', 'quotes', 'activities', 'claims', 'documents', 'messages', 'invoices', 'claim_transactions', 'mail_items', 'automation_runs'] as TableName[])
    .map((table) => ({ table, column: 'account_id', action: 'delete' as const })),
  policies: [
    { table: 'policy_transactions', column: 'policy_id', action: 'delete' },
    ...(['quotes', 'activities', 'claims', 'documents', 'invoices', 'commission_statement_lines'] as TableName[]).map((table) => ({ table, column: 'policy_id', action: 'null' as const })),
    { table: 'policies', column: 'rewritten_from_policy_id', action: 'null' },
    { table: 'automation_runs', column: 'policy_id', action: 'delete' },
  ],
  automation_workflows: [{ table: 'automation_runs', column: 'workflow_id', action: 'delete' }],
  claims: [{ table: 'claim_transactions', column: 'claim_id', action: 'delete' }],
  commission_statements: [{ table: 'commission_statement_lines', column: 'statement_id', action: 'delete' }],
  recipient_lists: [{ table: 'email_campaigns', column: 'recipient_list_id', action: 'null' }],
};

// Column types (and defaults) of every table, mirroring the migrations. Used to drop keys that aren't
// columns (PostgREST rejects unknown columns), coerce values Postgres would reject ('' or NaN in a
// date/int/numeric/uuid column), and fill column defaults in local mode so rows match in both backends.
type ColType = 't' | 'i' | 'n' | 'b' | 'd' | 'ts' | 'u' | 'j';
type ColSpec = ColType | [ColType, unknown];
const SCHEMA: { [K in TableName]: { [C in keyof Row<K>]-?: ColSpec } } = {
  accounts: {
    id: 'u', created_at: 'ts', first_name: 't', last_name: 't', email: 't', phone: 't', address: 't', city: 't', state: 't', zip: 't', policy_type: 't',
    status: ['t', 'Active'], account_type: ['t', 'Personal'], business_name: 't', dob: 'd', marital_status: 't', occupation: 't', mobile_phone: 't',
    producer: 't', csr: 't', lead_source: 't', notes: 't', labels: ['j', []],
  },
  drivers: {
    id: 'u', created_at: 'ts', account_id: 'u', first_name: 't', last_name: 't', dob: 'd', gender: 't', marital_status: 't', relationship: 't',
    license_number: 't', license_state: 't', violations: ['i', 0], accidents: ['i', 0],
  },
  vehicles: { id: 'u', created_at: 'ts', account_id: 'u', year: 'i', make: 't', model: 't', vin: 't', usage: 't', annual_miles: 'i', ownership: 't', garaging_zip: 't' },
  properties: {
    id: 'u', created_at: 'ts', account_id: 'u', address: 't', city: 't', state: 't', zip: 't', year_built: 'i', square_feet: 'i', construction: 't',
    roof_type: 't', roof_year: 'i', protection_class: 'i', dwelling_value: 'n',
  },
  policies: {
    id: 'u', created_at: 'ts', account_id: 'u', policy_number: 't', carrier: 't', line_of_business: 't', status: ['t', 'Active'], effective_date: 'd',
    expiration_date: 'd', term_months: ['i', 12], premium: ['n', 0], commission_rate: ['n', 10], billing_type: ['t', 'Direct Bill'], payment_plan: 't',
    source: ['t', 'Manual'], producer: 't', coverages: ['j', []], notes: 't', rewritten_from_policy_id: 'u',
  },
  policy_transactions: { id: 'u', created_at: 'ts', policy_id: 'u', account_id: 'u', type: 't', effective_date: 'd', premium_change: ['n', 0], description: 't' },
  quotes: {
    id: 'u', created_at: 'ts', account_id: 'u', line_of_business: 't', status: ['t', 'Draft'], effective_date: 'd', input: ['j', {}], results: ['j', []],
    selected_carrier: 't', selected_premium: 'n', policy_id: 'u',
  },
  activities: {
    id: 'u', created_at: 'ts', account_id: 'u', policy_id: 'u', type: ['t', 'Task'], subject: 't', description: 't', due_date: 'd', priority: ['t', 'Normal'],
    status: ['t', 'Open'], assigned_to: 't', completed_at: 'ts',
  },
  claims: {
    id: 'u', created_at: 'ts', account_id: 'u', policy_id: 'u', claim_number: 't', date_of_loss: 'd', reported_date: 'd', loss_type: 't', description: 't',
    status: ['t', 'Open'], amount_reserved: 'n', amount_paid: 'n', adjuster_name: 't', adjuster_phone: 't',
  },
  documents: {
    id: 'u', created_at: 'ts', account_id: 'u', policy_id: 'u', name: 't', category: ['t', 'Other'], mime_type: 't', size_bytes: 'i', storage_path: 't',
    data_url: 't', esign_status: 't', esign_signer_email: 't', esign_sent_at: 'ts', esign_completed_at: 'ts',
  },
  messages: {
    id: 'u', created_at: 'ts', account_id: 'u', channel: ['t', 'SMS'], direction: ['t', 'Outbound'], to_address: 't', subject: 't', body: 't',
    status: ['t', 'Sent'], read: ['b', true],
  },
  invoices: {
    id: 'u', created_at: 'ts', account_id: 'u', policy_id: 'u', invoice_number: 't', description: 't', amount: ['n', 0], amount_paid: ['n', 0], due_date: 'd',
    status: ['t', 'Unpaid'], paid_date: 'd', payment_method: 't',
  },
  carriers: {
    id: 'u', created_at: 'ts', name: 't', naic: 't', lines: ['j', []], commission_rate: ['n', 10], phone: 't', website: 't', appointed: ['b', true],
    downloads_enabled: ['b', false],
  },
  staff: {
    id: 'u', created_at: 'ts', name: 't', email: 't', role: ['t', 'CSR'], active: ['b', true], color: ['t', '#684ec2'],
    service_team: ['b', true], external: ['b', false], producer_code: 't',
  },
  agency_settings: {
    id: 'u', created_at: 'ts', name: 't', address: 't', city: 't', state: 't', zip: 't', phone: 't', email: 't', license_number: 't',
    renewal_reminder_days: ['i', 60], current_user_name: 't', email_from_name: 't', email_reply_to: 't', email_footer: 't',
  },
  claim_transactions: { id: 'u', created_at: 'ts', claim_id: 'u', account_id: 'u', type: 't', amount: ['n', 0], transaction_date: 'd', description: 't' },
  commission_statements: {
    id: 'u', created_at: 'ts', carrier: 't', statement_date: 'd', period_start: 'd', period_end: 'd', total_amount: ['n', 0], status: ['t', 'Open'], notes: 't',
  },
  commission_statement_lines: {
    id: 'u', created_at: 'ts', statement_id: 'u', policy_id: 'u', policy_number: 't', insured_name: 't', transaction_type: ['t', 'New Business'],
    premium: ['n', 0], commission_amount: ['n', 0],
  },
  commission_rules: {
    id: 'u', created_at: 'ts', name: 't', staff_name: 't', business_type: ['t', 'All'], line_of_business: 't', carrier: 't', split_percent: ['n', 0],
    active: ['b', true],
  },
  recipient_lists: { id: 'u', created_at: 'ts', name: 't', filters: ['j', {}] },
  email_campaigns: {
    id: 'u', created_at: 'ts', name: 't', subject: 't', body: 't', recipient_list_id: 'u', status: ['t', 'Draft'], scheduled_at: 'ts', sent_at: 'ts',
    sent_count: ['i', 0], suppressed_count: ['i', 0],
  },
  suppressions: { id: 'u', created_at: 'ts', channel: ['t', 'Email'], address: 't', reason: ['t', 'Manual'] },
  message_templates: { id: 'u', created_at: 'ts', channel: ['t', 'SMS'], name: 't', subject: 't', body: 't' },
  mail_items: {
    id: 'u', created_at: 'ts', account_id: 'u', direction: ['t', 'Inbound'], mail_type: ['t', 'Letter'], correspondent: 't', description: 't',
    mail_date: 'd', status: ['t', 'Received'],
  },
  esign_templates: { id: 'u', created_at: 'ts', name: 't', description: 't', category: ['t', 'Application'], message: 't' },
  saved_reports: {
    id: 'u', created_at: 'ts', name: 't', report_key: 't', owner: 't', favorite: ['b', false], shared: ['b', false], schedule: 't', schedule_email: 't',
  },
  app_config: { id: 'u', created_at: 'ts', key: 't', value: ['j', {}] },
  labels: { id: 'u', created_at: 'ts', name: 't', color: ['t', '#dc2626'], description: 't' },
  lead_sources: { id: 'u', created_at: 'ts', name: 't', is_default: ['b', false], hidden: ['b', false] },
  automation_workflows: { id: 'u', created_at: 'ts', name: 't', trigger: 't', trigger_config: ['j', {}], steps: ['j', []], active: ['b', true] },
  automation_runs: {
    id: 'u', created_at: 'ts', workflow_id: 'u', account_id: 'u', policy_id: 'u', step_index: ['i', 0], due_at: 'ts', status: ['t', 'Pending'], result: 't',
  },
  billing_companies: { id: 'u', created_at: 'ts', name: 't', company_type: ['t', 'Premium Finance'], phone: 't', email: 't', address: 't', notes: 't' },
  departments: { id: 'u', created_at: 'ts', name: 't', description: 't', members: ['j', []] },
  carrier_rating_setup: {
    id: 'u', created_at: 'ts', carrier: 't', username: 't', agency_code: 't', login_set: ['b', false], enabled_lines: ['j', []], active: ['b', true],
  },
  form_templates: { id: 'u', created_at: 'ts', name: 't', form_type: 't', fields: ['j', {}] },
  proposal_templates: {
    id: 'u', created_at: 'ts', name: 't', template_type: ['t', 'Proposal'], intro: 't', closing: 't', disclaimer: 't', include_coverages: ['b', true],
    include_premium: ['b', true], is_default: ['b', false],
  },
  support_tickets: {
    id: 'u', created_at: 'ts', subject: 't', category: ['t', 'General'], priority: ['t', 'Normal'], status: ['t', 'Open'], requester: 't', messages: ['j', []],
  },
  training_progress: { id: 'u', created_at: 'ts', staff_name: 't', lesson_key: 't', completed_at: 'ts' },
  training_registrations: { id: 'u', created_at: 'ts', session_key: 't', staff_name: 't' },
  integrations: { id: 'u', created_at: 'ts', integration_key: 't', status: ['t', 'Setup Required'], config: ['j', {}], activated_by: 't' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coerce(type: ColType, v: unknown): unknown {
  if (v === undefined || v === null) return v;
  switch (type) {
    case 'i':
    case 'n': {
      if (typeof v === 'string' && v.trim() === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return null;
      return type === 'i' ? Math.round(n) : n;
    }
    case 'd':
    case 'ts':
    case 'u':
      return typeof v === 'string' && v.trim() === '' ? null : v;
    default:
      return v;
  }
}

/** Keeps only real columns, drops `undefined`, and coerces values to what the column type accepts. */
function sanitize(table: TableName, values: Record<string, unknown>) {
  const cols = SCHEMA[table] as Record<string, ColSpec>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const spec = cols[k];
    if (!spec) {
      if (import.meta.env.DEV) console.warn(`[db] ignoring unknown column ${table}.${k}`);
      continue;
    }
    if (v === undefined) continue;
    out[k] = coerce(Array.isArray(spec) ? spec[0] : spec, v);
  }
  return out;
}

/** Local mode: fill column defaults / NULLs so new rows match what Postgres would return. */
function withDefaults(table: TableName, row: Record<string, unknown>) {
  const out = { ...row };
  for (const [k, spec] of Object.entries(SCHEMA[table] as Record<string, ColSpec>)) {
    if (out[k] !== undefined) continue;
    const def = Array.isArray(spec) ? spec[1] : null;
    out[k] = def !== null && typeof def === 'object' ? JSON.parse(JSON.stringify(def)) : def;
  }
  return out;
}

let mode: DbMode = 'local';
let ready: Promise<DbMode> | null = null;
const listeners = new Set<(table: TableName) => void>();

export function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function emit(table: TableName) {
  listeners.forEach((fn) => fn(table));
}

export function onDbChange(fn: (table: TableName) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── local backend ──

function readLocal<K extends TableName>(table: K): Row<K>[] {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + table);
    return raw ? (JSON.parse(raw) as Row<K>[]) : [];
  } catch {
    return [];
  }
}

function writeLocal<K extends TableName>(table: K, rows: Row<K>[]) {
  try {
    localStorage.setItem(LOCAL_PREFIX + table, JSON.stringify(rows));
  } catch {
    throw new Error('Browser storage is full. Remove some documents or connect Supabase to store more data.');
  }
}

function compare(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/** Sorts like Postgres `ORDER BY col ASC|DESC NULLS LAST` (what the Supabase backend requests). */
function sortRows<T>(rows: T[], order: { column: PropertyKey; ascending?: boolean }) {
  const col = order.column as string;
  const dir = order.ascending === false ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[col], bv = (b as Record<string, unknown>)[col];
    const an = av === null || av === undefined, bn = bv === null || bv === undefined;
    if (an || bn) return an === bn ? 0 : an ? 1 : -1;
    return compare(av, bv) * dir;
  });
}

function applyQuery<K extends TableName>(rows: Row<K>[], q?: ListQuery<K>) {
  let out = rows;
  if (q?.eq) {
    const entries = Object.entries(q.eq);
    out = out.filter((r) => entries.every(([k, v]) => ((r as Record<string, unknown>)[k] ?? null) === v));
  }
  if (q?.in) {
    const { column, values } = q.in;
    out = out.filter((r) => values.includes((r as Record<string, unknown>)[column as string] as string | number));
  }
  if (q?.order) out = sortRows(out, q.order);
  if (q?.limit) out = out.slice(0, q.limit);
  return out;
}

function localDeleteWhere(table: TableName, column: string, ids: string[]) {
  const rows = readLocal(table);
  const removed = rows.filter((r) => ids.includes((r as Record<string, unknown>)[column] as string));
  if (!removed.length) return;
  writeLocal(table, rows.filter((r) => !removed.includes(r)));
  cascadeLocal(table, removed.map((r) => r.id));
  emit(table);
}

function cascadeLocal(table: TableName, ids: string[]) {
  for (const rule of CASCADES[table] ?? []) {
    if (rule.action === 'delete') {
      localDeleteWhere(rule.table, rule.column, ids);
    } else {
      const rows = readLocal(rule.table);
      let changed = false;
      const next = rows.map((r) => {
        const rec = r as Record<string, unknown>;
        if (ids.includes(rec[rule.column] as string)) { changed = true; return { ...rec, [rule.column]: null }; }
        return r;
      });
      if (changed) { writeLocal(rule.table, next as typeof rows); emit(rule.table); }
    }
  }
}

// ── mode detection ──

export function initDb(): Promise<DbMode> {
  if (ready) return ready;
  ready = (async () => {
    const override = safeGet(MODE_OVERRIDE_KEY);
    if (override === 'local' || !supabaseConfigured) return (mode = 'local');
    try {
      // `agency_settings` only exists once the full AMS migration is applied; a project that only has
      // the original `accounts` table fails this probe and falls back to local mode.
      // Probe the newest migration's table: if any migration is missing, stay in browser-storage mode.
      const probe = supabase.from('integrations').select('id').limit(1);
      const { error } = await Promise.race([
        probe,
        new Promise<{ error: { message: string } }>((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), 6000)),
      ]);
      mode = error ? 'local' : 'supabase';
    } catch {
      mode = 'local';
    }
    return mode;
  })();
  return ready;
}

function safeGet(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function getDbMode() {
  return mode;
}

/** True when the user chose browser storage even though Supabase may be available. */
export function isLocalForced() {
  return safeGet(MODE_OVERRIDE_KEY) === 'local';
}

/** Force local mode (or clear the override) and reload the page. */
export function setModeOverride(value: DbMode | null) {
  try {
    if (value === 'local') localStorage.setItem(MODE_OVERRIDE_KEY, 'local');
    else localStorage.removeItem(MODE_OVERRIDE_KEY);
  } catch { /* ignore */ }
  window.location.reload();
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function stamp<K extends TableName>(table: K, values: NewRow<K>): Row<K> {
  const clean = sanitize(table, values as Record<string, unknown>);
  if (!clean.id) delete clean.id;
  if (!clean.created_at) delete clean.created_at;
  return { id: uuid(), created_at: new Date().toISOString(), ...clean } as Row<K>;
}

/** Escapes a search term for use inside a PostgREST `or=(…)` ilike filter (quoted value, LIKE wildcards literal). */
function ilikeValue(term: string) {
  // PostgREST turns `*` into `%`; `_` (any single char) still matches a literal `*`.
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
  return `"%${like.replace(/[\\"]/g, (c) => `\\${c}`)}%"`;
}

async function supabaseList<K extends TableName>(table: K, q: ListQuery<K> | undefined, inValues?: (string | number)[]): Promise<Row<K>[]> {
  const build = () => {
    let query = supabase.from(table).select('*');
    for (const [k, v] of Object.entries(q?.eq ?? {})) query = v === null ? query.is(k, null) : query.eq(k, v as string);
    if (q?.in) query = query.in(q.in.column as string, inValues ?? q.in.values);
    if (q?.order) query = query.order(q.order.column as string, { ascending: q.order.ascending ?? true, nullsFirst: false });
    return query.order('id'); // stable order so pages don't overlap
  };
  if (q?.limit && q.limit <= PAGE) {
    const { data, error } = await build().limit(q.limit);
    fail(error);
    return (data ?? []) as Row<K>[];
  }
  // No limit: page through, since PostgREST caps each response (1000 rows by default).
  const out: Row<K>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    fail(error);
    out.push(...((data ?? []) as Row<K>[]));
    if (!data || data.length < PAGE || (q?.limit && out.length >= q.limit)) break;
  }
  return q?.limit ? out.slice(0, q.limit) : out;
}

// ── public API ──

export const db = {
  async list<K extends TableName>(table: K, q?: ListQuery<K>): Promise<Row<K>[]> {
    await initDb();
    if (mode === 'local') return applyQuery(readLocal(table), q);
    if (q?.in && q.in.values.length > IN_CHUNK) {
      const values = [...new Set(q.in.values)];
      const parts: Row<K>[] = [];
      for (let i = 0; i < values.length; i += IN_CHUNK) parts.push(...(await supabaseList(table, { ...q, limit: undefined }, values.slice(i, i + IN_CHUNK))));
      let out = q.order ? sortRows(parts, q.order) : parts;
      if (q.limit) out = out.slice(0, q.limit);
      return out;
    }
    if (q?.in && !q.in.values.length) return [];
    return supabaseList(table, q);
  },

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    await initDb();
    if (mode === 'local') return readLocal(table).find((r) => r.id === id) ?? null;
    if (!UUID_RE.test(id)) return null; // e.g. a mistyped URL; Postgres would reject it as invalid uuid syntax
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as Row<K>) ?? null;
  },

  async insert<K extends TableName>(table: K, values: NewRow<K>): Promise<Row<K>> {
    const [row] = await db.insertMany(table, [values]);
    return row;
  },

  async insertMany<K extends TableName>(table: K, values: NewRow<K>[], opts: { silent?: boolean } = {}): Promise<Row<K>[]> {
    await initDb();
    const rows = values.map((v) => stamp(table, v));
    if (!rows.length) return [];
    if (mode === 'local') {
      const full = rows.map((r) => withDefaults(table, r as Record<string, unknown>) as Row<K>);
      writeLocal(table, [...readLocal(table), ...full]);
      if (!opts.silent) emit(table);
      return full;
    }
    // defaultToNull: false → keys missing from some rows of a bulk insert get the column DEFAULT, not NULL.
    const { data, error } = await supabase.from(table).insert(rows as never, { defaultToNull: false }).select('*');
    fail(error);
    if (!opts.silent) emit(table);
    return (data ?? rows) as Row<K>[];
  },

  async update<K extends TableName>(table: K, id: string, patch: NewRow<K>): Promise<Row<K>> {
    await initDb();
    const clean = sanitize(table, patch as Record<string, unknown>);
    delete clean.id;
    delete clean.created_at;
    if (mode === 'local') {
      const rows = readLocal(table);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error('Record not found');
      rows[idx] = { ...rows[idx], ...clean } as Row<K>;
      writeLocal(table, rows);
      emit(table);
      return rows[idx];
    }
    if (!UUID_RE.test(id)) throw new Error('Record not found');
    if (!Object.keys(clean).length) {
      const row = await db.get(table, id);
      if (!row) throw new Error('Record not found');
      return row;
    }
    const { data, error } = await supabase.from(table).update(clean as never).eq('id', id).select('*').maybeSingle();
    fail(error);
    if (!data) throw new Error('Record not found');
    emit(table);
    return data as Row<K>;
  },

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    await initDb();
    if (mode === 'local') {
      writeLocal(table, readLocal(table).filter((r) => r.id !== id));
      cascadeLocal(table, [id]);
    } else {
      const { error } = await supabase.from(table).delete().eq('id', id);
      fail(error);
      // FK cascades happen server-side; tell dependent screens to refresh.
      (CASCADES[table] ?? []).forEach((rule) => emit(rule.table));
    }
    emit(table);
  },

  /**
   * Case-insensitive "contains" search across text columns. Multi-word terms ("Sarah Mitchell") match
   * when every word is found in at least one of the columns.
   */
  async search<K extends TableName>(table: K, columns: (keyof Row<K>)[], term: string, limit = 10): Promise<Row<K>[]> {
    await initDb();
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !columns.length) return [];
    if (mode === 'local') {
      return readLocal(table)
        .filter((r) => words.every((w) => columns.some((c) => String((r as Record<string, unknown>)[c as string] ?? '').toLowerCase().includes(w))))
        .slice(0, limit);
    }
    const anyColumn = (w: string) => columns.map((c) => `${String(c)}.ilike.${ilikeValue(w)}`).join(',');
    const filter = words.length === 1 ? anyColumn(words[0]) : `and(${words.map((w) => `or(${anyColumn(w)})`).join(',')})`;
    const { data, error } = await supabase.from(table).select('*').or(filter).limit(limit);
    fail(error);
    return (data ?? []) as Row<K>[];
  },

  /** Stores a file and returns the fields to save on a `documents` row. */
  async uploadFile(file: File): Promise<Pick<DocumentRow, 'storage_path' | 'data_url' | 'mime_type' | 'size_bytes'>> {
    await initDb();
    const meta = { mime_type: file.type || 'application/octet-stream', size_bytes: file.size };
    if (mode === 'local') {
      if (file.size > LOCAL_FILE_LIMIT) throw new Error('In browser-storage mode files must be under 1.5 MB. Connect Supabase to upload larger files.');
      const data_url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return { ...meta, data_url, storage_path: null };
    }
    const path = `${uuid()}/${file.name.replace(/[^\w.-]+/g, '_')}`;
    const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: meta.mime_type });
    fail(error);
    return { ...meta, storage_path: path, data_url: null };
  },

  /** A URL that opens/downloads the document's file, or null when it has none. */
  async fileUrl(doc: Pick<DocumentRow, 'storage_path' | 'data_url'>): Promise<string | null> {
    if (doc.data_url) return doc.data_url;
    if (!doc.storage_path) return null;
    await initDb();
    if (mode !== 'supabase') return null; // e.g. a row imported from a Supabase export into local mode
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60 * 10);
    fail(error);
    return data?.signedUrl ?? null;
  },

  /** Removes a document's stored file (no-op in local mode, where the file lives on the row). Throws on storage errors. */
  async removeFile(doc: Pick<DocumentRow, 'storage_path'>) {
    await db.removeFiles([doc]);
  },

  /** Removes several stored files in one request. Throws on storage errors. */
  async removeFiles(docs: Pick<DocumentRow, 'storage_path'>[]) {
    await initDb();
    const paths = [...new Set(docs.map((d) => d.storage_path).filter((p): p is string => !!p))];
    if (mode !== 'supabase' || !paths.length) return;
    const { error } = await supabase.storage.from('documents').remove(paths);
    fail(error);
  },

  /** Wipes every table in local mode (used by Settings → Reset). */
  clearLocal() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(LOCAL_PREFIX)).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
  },

  /** Emit change events for all tables, e.g. after a bulk seed. */
  touchAll(tables: TableName[]) {
    tables.forEach(emit);
  },
};
