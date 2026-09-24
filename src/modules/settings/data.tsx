import { CheckCircle2, Cloud, Database, Download, FileSignature, HardDrive, MessageSquareText, RefreshCw, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, ErrorBanner, Panel, Spinner, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, getDbMode, initDb, isLocalForced, onDbChange, setModeOverride } from '@/lib/db';
import { today } from '@/lib/format';
import { loadSampleData } from '@/lib/seed';
import { supabase } from '@/lib/supabase';
import type { TableName } from '@/lib/types';

/** Dependency order: parents before children so foreign keys resolve on import. */
const TABLES: TableName[] = ['staff', 'carriers', 'agency_settings', 'accounts', 'drivers', 'vehicles', 'properties', 'policies', 'policy_transactions', 'quotes', 'activities', 'claims', 'documents', 'messages', 'invoices', 'claim_transactions', 'commission_rules', 'commission_statements', 'commission_statement_lines', 'recipient_lists', 'email_campaigns', 'suppressions', 'message_templates', 'mail_items', 'esign_templates', 'saved_reports', 'app_config', 'labels', 'lead_sources', 'automation_workflows', 'automation_runs', 'billing_companies', 'departments', 'carrier_rating_setup', 'form_templates', 'proposal_templates', 'support_tickets', 'training_progress', 'training_registrations', 'integrations'];
const MIGRATIONS = ['supabase/migrations/20260924160000_create_ams_schema.sql', 'supabase/migrations/20260925120000_policy_mgmt_comm_center_reports.sql', 'supabase/migrations/20260926120000_settings_support_marketplace.sql'];
const label = (t: string) => t.replace(/_/g, ' ');

// Column types per table, mirroring the migration. A [type, default] tuple marks a NOT NULL column with a
// default: imported rows get the default when the value is missing, since a bulk insert sends NULL, not DEFAULT.
type Col = 'text' | 'num' | 'int' | 'date' | 'ts' | 'bool' | 'json' | 'uuid';
type ColSpec = Col | [Col, unknown];
const BASE: Record<string, ColSpec> = { id: 'uuid', created_at: 'ts' };
const SCHEMA: Record<TableName, Record<string, ColSpec>> = {
  accounts: { ...BASE, first_name: 'text', last_name: 'text', email: 'text', phone: 'text', address: 'text', city: 'text', state: 'text', zip: 'text', policy_type: 'text', status: 'text', account_type: 'text', business_name: 'text', dob: 'date', marital_status: 'text', occupation: 'text', mobile_phone: 'text', producer: 'text', csr: 'text', lead_source: 'text', notes: 'text', labels: ['json', []] },
  drivers: { ...BASE, account_id: 'uuid', first_name: 'text', last_name: 'text', dob: 'date', gender: 'text', marital_status: 'text', relationship: 'text', license_number: 'text', license_state: 'text', violations: ['int', 0], accidents: ['int', 0] },
  vehicles: { ...BASE, account_id: 'uuid', year: 'int', make: 'text', model: 'text', vin: 'text', usage: 'text', annual_miles: 'int', ownership: 'text', garaging_zip: 'text' },
  properties: { ...BASE, account_id: 'uuid', address: 'text', city: 'text', state: 'text', zip: 'text', year_built: 'int', square_feet: 'int', construction: 'text', roof_type: 'text', roof_year: 'int', protection_class: 'int', dwelling_value: 'num' },
  policies: { ...BASE, account_id: 'uuid', policy_number: 'text', carrier: 'text', line_of_business: 'text', status: ['text', 'Active'], effective_date: 'date', expiration_date: 'date', term_months: ['int', 12], premium: ['num', 0], commission_rate: ['num', 10], billing_type: ['text', 'Direct Bill'], payment_plan: 'text', source: ['text', 'Manual'], producer: 'text', coverages: ['json', []], notes: 'text', rewritten_from_policy_id: 'uuid' },
  policy_transactions: { ...BASE, policy_id: 'uuid', account_id: 'uuid', type: 'text', effective_date: 'date', premium_change: ['num', 0], description: 'text' },
  quotes: { ...BASE, account_id: 'uuid', line_of_business: 'text', status: ['text', 'Draft'], effective_date: 'date', input: ['json', {}], results: ['json', []], selected_carrier: 'text', selected_premium: 'num', policy_id: 'uuid' },
  activities: { ...BASE, account_id: 'uuid', policy_id: 'uuid', type: ['text', 'Task'], subject: 'text', description: 'text', due_date: 'date', priority: ['text', 'Normal'], status: ['text', 'Open'], assigned_to: 'text', completed_at: 'ts' },
  claims: { ...BASE, account_id: 'uuid', policy_id: 'uuid', claim_number: 'text', date_of_loss: 'date', reported_date: 'date', loss_type: 'text', description: 'text', status: ['text', 'Open'], amount_reserved: 'num', amount_paid: 'num', adjuster_name: 'text', adjuster_phone: 'text' },
  documents: { ...BASE, account_id: 'uuid', policy_id: 'uuid', name: 'text', category: ['text', 'Other'], mime_type: 'text', size_bytes: 'int', storage_path: 'text', data_url: 'text', esign_status: 'text', esign_signer_email: 'text', esign_sent_at: 'ts', esign_completed_at: 'ts' },
  messages: { ...BASE, account_id: 'uuid', channel: ['text', 'SMS'], direction: ['text', 'Outbound'], to_address: 'text', subject: 'text', body: 'text', status: ['text', 'Sent'], read: ['bool', true] },
  invoices: { ...BASE, account_id: 'uuid', policy_id: 'uuid', invoice_number: 'text', description: 'text', amount: ['num', 0], amount_paid: ['num', 0], due_date: 'date', status: ['text', 'Unpaid'], paid_date: 'date', payment_method: 'text' },
  carriers: { ...BASE, name: 'text', naic: 'text', lines: ['json', []], commission_rate: ['num', 10], phone: 'text', website: 'text', appointed: ['bool', true], downloads_enabled: ['bool', false] },
  staff: { ...BASE, name: 'text', email: 'text', role: ['text', 'CSR'], active: ['bool', true], color: ['text', '#684ec2'], service_team: ['bool', true], external: ['bool', false], producer_code: 'text' },
  agency_settings: { ...BASE, name: 'text', address: 'text', city: 'text', state: 'text', zip: 'text', phone: 'text', email: 'text', license_number: 'text', renewal_reminder_days: ['int', 60], current_user_name: 'text', email_from_name: 'text', email_reply_to: 'text', email_footer: 'text' },
  claim_transactions: { ...BASE, claim_id: 'uuid', account_id: 'uuid', type: 'text', amount: ['num', 0], transaction_date: 'date', description: 'text' },
  commission_statements: { ...BASE, carrier: 'text', statement_date: 'date', period_start: 'date', period_end: 'date', total_amount: ['num', 0], status: ['text', 'Open'], notes: 'text' },
  commission_statement_lines: { ...BASE, statement_id: 'uuid', policy_id: 'uuid', policy_number: 'text', insured_name: 'text', transaction_type: ['text', 'New Business'], premium: ['num', 0], commission_amount: ['num', 0] },
  commission_rules: { ...BASE, name: 'text', staff_name: 'text', business_type: ['text', 'All'], line_of_business: 'text', carrier: 'text', split_percent: ['num', 0], active: ['bool', true] },
  recipient_lists: { ...BASE, name: 'text', filters: ['json', {}] },
  email_campaigns: { ...BASE, name: 'text', subject: 'text', body: 'text', recipient_list_id: 'uuid', status: ['text', 'Draft'], scheduled_at: 'ts', sent_at: 'ts', sent_count: ['int', 0], suppressed_count: ['int', 0] },
  suppressions: { ...BASE, channel: ['text', 'Email'], address: 'text', reason: ['text', 'Manual'] },
  message_templates: { ...BASE, channel: ['text', 'SMS'], name: 'text', subject: 'text', body: 'text' },
  mail_items: { ...BASE, account_id: 'uuid', direction: ['text', 'Inbound'], mail_type: ['text', 'Letter'], correspondent: 'text', description: 'text', mail_date: 'date', status: ['text', 'Received'] },
  esign_templates: { ...BASE, name: 'text', description: 'text', category: ['text', 'Application'], message: 'text' },
  saved_reports: { ...BASE, name: 'text', report_key: 'text', owner: 'text', favorite: ['bool', false], shared: ['bool', false], schedule: 'text', schedule_email: 'text' },
  app_config: { ...BASE, key: 'text', value: ['json', {}] },
  labels: { ...BASE, name: 'text', color: ['text', '#dc2626'], description: 'text' },
  lead_sources: { ...BASE, name: 'text', is_default: ['bool', false], hidden: ['bool', false] },
  automation_workflows: { ...BASE, name: 'text', trigger: 'text', trigger_config: ['json', {}], steps: ['json', []], active: ['bool', true] },
  automation_runs: { ...BASE, workflow_id: 'uuid', account_id: 'uuid', policy_id: 'uuid', step_index: ['int', 0], due_at: 'ts', status: ['text', 'Pending'], result: 'text' },
  billing_companies: { ...BASE, name: 'text', company_type: ['text', 'Premium Finance'], phone: 'text', email: 'text', address: 'text', notes: 'text' },
  departments: { ...BASE, name: 'text', description: 'text', members: ['json', []] },
  carrier_rating_setup: { ...BASE, carrier: 'text', username: 'text', agency_code: 'text', login_set: ['bool', false], enabled_lines: ['json', []], active: ['bool', true] },
  form_templates: { ...BASE, name: 'text', form_type: 'text', fields: ['json', {}] },
  proposal_templates: { ...BASE, name: 'text', template_type: ['text', 'Proposal'], intro: 'text', closing: 'text', disclaimer: 'text', include_coverages: ['bool', true], include_premium: ['bool', true], is_default: ['bool', false] },
  support_tickets: { ...BASE, subject: 'text', category: ['text', 'General'], priority: ['text', 'Normal'], status: ['text', 'Open'], requester: 'text', messages: ['json', []] },
  training_progress: { ...BASE, staff_name: 'text', lesson_key: 'text', completed_at: 'ts' },
  training_registrations: { ...BASE, session_key: 'text', staff_name: 'text' },
  integrations: { ...BASE, integration_key: 'text', status: ['text', 'Setup Required'], config: ['json', {}], activated_by: 'text' },
};

/** Coerce a backup row to the table's columns so Postgres accepts it (unknown keys dropped, '' / NaN → null). */
function sanitizeRow(t: TableName, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [col, spec] of Object.entries(SCHEMA[t])) {
    const [type, fallback] = Array.isArray(spec) ? spec : [spec, undefined];
    let v = row[col];
    if (v === undefined || (v === '' && type !== 'text')) v = null;
    if (v !== null && (type === 'num' || type === 'int')) {
      const n = Number(v);
      v = typeof v === 'boolean' || !Number.isFinite(n) ? null : type === 'int' ? Math.round(n) : n;
    }
    if (v !== null && (type === 'date' || type === 'ts') && (typeof v !== 'string' || Number.isNaN(new Date(v).getTime()))) v = null;
    if (v === null && fallback !== undefined) v = fallback;
    if (v === null && col === 'created_at') v = new Date().toISOString();
    out[col] = v;
  }
  return out;
}

/** Split rows into insert batches of at most 200 rows / ~2 MB (documents can carry large inline files). */
function batches(rows: Record<string, unknown>[]) {
  const out: Record<string, unknown>[][] = [];
  let cur: Record<string, unknown>[] = [], size = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length;
    if (cur.length && (cur.length >= 200 || size + n > 2_000_000)) { out.push(cur); cur = []; size = 0; }
    cur.push(r);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const PAGE = 1000;

/** Every row (or just the given columns) of a table. PostgREST caps each select, so page through it in Supabase mode. */
async function listAll(t: TableName, columns = '*'): Promise<Record<string, unknown>[]> {
  await initDb();
  if (getDbMode() !== 'supabase') return (await db.list(t)) as unknown as Record<string, unknown>[];
  const out: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await supabase.from(t).select(columns).order('id').range(out.length, out.length + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (!rows.length) break;
  }
  return out;
}

async function countRows(t: TableName) {
  await initDb();
  if (getDbMode() !== 'supabase') return (await db.list(t)).length;
  const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function useCounts() {
  const [counts, setCounts] = useState<Partial<Record<TableName, number>>>({});
  useEffect(() => {
    let live = true;
    const load = () => Promise.all(TABLES.map((t) => countRows(t).then((n) => [t, n] as const).catch(() => [t, 0] as const)))
      .then((pairs) => { if (live) setCounts(Object.fromEntries(pairs)); });
    load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onDbChange(() => { clearTimeout(timer); timer = setTimeout(load, 300); });
    return () => { live = false; off(); clearTimeout(timer); };
  }, []);
  return counts;
}

export function DataTab() {
  const { toast, confirm } = useFeedback();
  const { mode } = useAppData();
  const counts = useCounts();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const loadSample = async () => {
    const ok = await confirm({
      title: 'Load sample data?',
      message: <>This adds a demo agency — about <b>40 accounts</b> with policies, drivers, vehicles, activities, claims, invoices and messages — alongside any data you already have. Demo staff and carriers are added too. You can’t undo this in one step.
        {(counts.accounts ?? 0) > 0 && <div className="mt-2 text-amber-700">You already have {counts.accounts} accounts and {counts.staff ?? 0} users — loading again will create duplicate demo records.</div>}</>,
      confirmLabel: 'Load sample data', danger: (counts.accounts ?? 0) > 0,
    });
    if (!ok) return;
    setError(null);
    setProgress('Preparing sample data…');
    try {
      await loadSampleData((m) => setProgress(m));
      toast('Sample data loaded');
    } catch (e) {
      setError(`Loading sample data failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const exportAll = async () => {
    setError(null);
    setProgress('Collecting data…');
    try {
      const tables: Record<string, unknown[]> = {};
      for (const t of TABLES) { setProgress(`Exporting ${label(t)}…`); tables[t] = await listAll(t); }
      const blob = new Blob([JSON.stringify({ app: 'northstar-ams', version: 1, exported_at: new Date().toISOString(), mode, tables }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `northstar-ams-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Backup downloaded (${Object.values(tables).reduce((s, r) => s + r.length, 0)} records)`);
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const importFile = async (file: File) => {
    setError(null);
    let parsed: unknown;
    // Clear the picker now so choosing the same file again (after an error or cancel) fires onChange.
    if (fileRef.current) fileRef.current.value = '';
    try { parsed = JSON.parse(await file.text()); } catch { setError('That file is not valid JSON.'); return; }
    const root = parsed as Record<string, unknown>;
    const tables = (root && typeof root === 'object' && root.tables && typeof root.tables === 'object' ? root.tables : root) as Record<string, unknown>;
    const present = TABLES.filter((t) => Array.isArray(tables?.[t]));
    if (!present.length) { setError('No recognizable tables were found in this file. Choose a backup created with “Export all data”.'); return; }
    const total = present.reduce((s, t) => s + (tables[t] as unknown[]).length, 0);
    const ok = await confirm({
      title: 'Import backup?',
      message: <>Found <b>{total}</b> records in {present.length} tables in <b>{file.name}</b>. Records whose id already exists will be skipped; everything else is added to your current data.</>,
      confirmLabel: 'Import',
    });
    if (!ok) return;
    setProgress('Importing…');
    let added = 0, skipped = 0;
    try {
      for (const t of present) {
        setProgress(`Importing ${label(t)}…`);
        const existing = await listAll(t, 'id');
        const ids = new Set(existing.map((r) => r.id as string));
        let rows = (tables[t] as Record<string, unknown>[]).filter((r) => r && typeof r === 'object' && typeof r.id === 'string');
        // Skip ids already stored, and duplicates within the file.
        rows = rows.filter((r) => {
          if (ids.has(r.id as string)) return false;
          ids.add(r.id as string);
          return true;
        });
        // Only one agency profile is used — keep the existing one (or import just the first).
        if (t === 'agency_settings') rows = existing.length ? [] : rows.slice(0, 1);
        skipped += (tables[t] as unknown[]).length - rows.length;
        for (const batch of batches(rows.map((r) => sanitizeRow(t, r)))) {
          await db.insertMany(t, batch as never[], { silent: true });
          added += batch.length;
        }
      }
      db.touchAll(TABLES);
      toast(`Imported ${added} records${skipped ? `, skipped ${skipped} already present` : ''}`);
    } catch (e) {
      db.touchAll(TABLES);
      setError(`Import stopped after ${added} records: ${(e as Error).message}`);
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset browser data?',
      message: 'This permanently deletes every account, policy, activity, document and setting stored in this browser. Export a backup first if you may need it. The page will reload.',
      confirmLabel: 'Delete everything', danger: true,
    });
    if (!ok) return;
    db.clearLocal();
    window.location.reload();
  };

  const switchMode = async (to: 'local' | 'supabase') => {
    const ok = await confirm({
      title: to === 'local' ? 'Use browser storage?' : 'Use Supabase?',
      message: to === 'local'
        ? 'The app will reload and read/write data in this browser only. Your Supabase data is not changed, and you can switch back at any time.'
        : 'The app will reload and try to connect to Supabase. If the schema is not applied yet it falls back to browser storage automatically.',
      confirmLabel: 'Switch and reload',
    });
    if (ok) setModeOverride(to === 'local' ? 'local' : null);
  };

  const totalRecords = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Panel title="Storage">
          {mode === 'supabase' ? (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 grid place-items-center shrink-0"><Cloud size={18} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">Connected to Supabase <Badge tone="green"><CheckCircle2 size={11} /> Live</Badge></div>
                <p className="text-[13px] text-ink-500 mt-1">All data is stored in your Supabase project and shared by everyone using this app. Documents are kept in the <code className="text-xs bg-ink-50 px-1 rounded">documents</code> storage bucket.</p>
                <Button className="mt-3" size="sm" icon={<HardDrive size={14} />} onClick={() => switchMode('local')}>Use browser storage instead</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 grid place-items-center shrink-0"><HardDrive size={18} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">Browser storage (demo mode) <Badge tone="amber">Local only</Badge></div>
                <p className="text-[13px] text-ink-500 mt-1">Data is saved in this browser’s local storage — it isn’t shared with other users or devices, and files must be under 1.5 MB.</p>
                <div className="mt-3 rounded border border-ink-100 bg-ink-50/60 p-3 text-[13px] text-ink-700">
                  <div className="font-semibold mb-1">To connect Supabase</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Open your Supabase project’s <b>SQL editor</b>.</li>
                    <li>Paste and run these migration files, in order: {MIGRATIONS.map((m, i) => <span key={m}>{i > 0 && ', then '}<code className="text-xs bg-white border border-ink-100 px-1 rounded break-all">{m}</code></span>)}.</li>
                    <li>Reload this page — the app detects the schema and switches automatically.</li>
                  </ol>
                </div>
                {isLocalForced() && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => switchMode('supabase')}>Use Supabase</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Data tools">
          <div className="space-y-3">
            <ErrorBanner message={error} />
            {progress && <div className="flex items-center gap-2 text-[13px] text-brand-700 bg-brand-50 border border-brand-100 rounded px-3 py-2" role="status"><Spinner size={15} /> {progress}</div>}
            <Tool icon={<Sparkles size={16} />} title="Load sample data" text="Adds a demo agency (~40 accounts with policies, activities, claims and invoices) to explore the app.">
              <Button size="sm" disabled={busy} onClick={loadSample}>Load sample data</Button>
            </Tool>
            <Tool icon={<Download size={16} />} title="Export all data" text="Downloads a JSON backup of every table.">
              <Button size="sm" disabled={busy} onClick={exportAll}>Export all data</Button>
            </Tool>
            <Tool icon={<Upload size={16} />} title="Import backup" text="Restores a JSON backup. Existing records (same id) are skipped.">
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Import backup</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
            </Tool>
            {mode === 'local' && (
              <Tool icon={<RotateCcw size={16} />} title="Reset browser data" text="Deletes everything stored in this browser and reloads." danger>
                <Button size="sm" variant="danger" disabled={busy} onClick={reset}>Reset browser data</Button>
              </Tool>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        <Panel title="Records" actions={<span className="text-xs text-ink-400 tabular-nums">{totalRecords.toLocaleString()} total</span>}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {TABLES.map((t) => (
              <div key={t} className="flex items-center justify-between gap-2 text-[13px] border-b border-ink-50 py-1">
                <dt className="text-ink-500 capitalize truncate">{label(t)}</dt>
                <dd className="font-semibold text-ink-900 tabular-nums">{counts[t] ?? '…'}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Integrations">
          <ul className="divide-y divide-ink-100">
            <Integration icon={<Database size={16} />} name="Carrier download (IVANS)" text="Nightly policy and commission downloads from carriers. Requires an IVANS account and carrier download agreements — policies can be entered manually or through the rater in the meantime." />
            <Integration icon={<FileSignature size={16} />} name="eSignature" text="Send applications for electronic signature. Requires an eSignature provider account and API key; signature status can be tracked manually on documents until connected." />
            <Integration icon={<MessageSquareText size={16} />} name="SMS provider" text="Two-way texting with clients. Requires an SMS provider (e.g. a 10DLC-registered number). Messages are logged in the app but not delivered until a provider is connected." />
          </ul>
          <p className="text-xs text-ink-400 mt-3">Integrations are configured by your administrator on the server side; contact support to enable them.</p>
        </Panel>
      </div>
    </div>
  );
}

function Tool({ icon, title, text, danger, children }: { icon: ReactNode; title: string; text: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 border border-ink-100 rounded p-3">
      <div className={'w-8 h-8 rounded grid place-items-center shrink-0 ' + (danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600')}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink-900">{title}</div>
        <div className="text-xs text-ink-400">{text}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Integration({ icon, name, text }: { icon: ReactNode; name: string; text: string }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="w-8 h-8 rounded bg-ink-50 text-ink-500 grid place-items-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">{name} <Badge tone="gray">Not connected</Badge></div>
        <p className="text-xs text-ink-500 mt-0.5">{text}</p>
      </div>
    </li>
  );
}
