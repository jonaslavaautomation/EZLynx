import { useEffect, useMemo, useState } from 'react';
import { Database, Download } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, Field, LoadingBlock, Panel, Select, StatCard, useFeedback } from '@/components/ui';
import { db, onDbChange } from '@/lib/db';
import { downloadCsv, fmtNumber, today } from '@/lib/format';
import type { TableName } from '@/lib/types';

const EXPORT_TABLES: { value: TableName; label: string }[] = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'properties', label: 'Properties' },
  { value: 'policies', label: 'Policies' },
  { value: 'policy_transactions', label: 'Policy transactions' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'activities', label: 'Activities' },
  { value: 'claims', label: 'Claims' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'carriers', label: 'Carriers' },
  { value: 'staff', label: 'Staff' },
];

const PREVIEW = 50;
const HIDDEN = new Set(['data_url']);

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Column list = union of keys across rows (first-seen order), minus inline file content. */
function columnsOf(rows: Record<string, unknown>[]) {
  const cols: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k) && !HIDDEN.has(k)) { seen.add(k); cols.push(k); } }));
  return cols;
}

export function DataExport() {
  const { toast } = useFeedback();
  const [table, setTable] = useState<TableName>('accounts');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      db.list(table)
        .then((r) => { if (alive) { setRows(r as unknown as Record<string, unknown>[]); setError(null); } })
        .catch((e: Error) => { if (alive) setError(e.message); })
        .finally(() => { if (alive) setLoading(false); });
    };
    setLoading(true);
    setRows([]);
    load();
    const off = onDbChange((t) => { if (t === table) load(); });
    return () => { alive = false; off(); };
  }, [table]);

  const cols = useMemo(() => columnsOf(rows), [rows]);
  const label = EXPORT_TABLES.find((t) => t.value === table)?.label ?? table;

  const download = () => {
    if (busy) return;
    if (!rows.length) { toast('This table has no rows to export', 'info'); return; }
    setBusy(true);
    try {
      downloadCsv(`${table}-${today()}.csv`, rows.map((r) => Object.fromEntries(cols.map((c) => [c, cell(r[c])]))));
      toast(`Exported ${fmtNumber(rows.length)} ${label.toLowerCase()} rows`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900">Data Export</h2>
          <p className="text-[13px] text-ink-400">Pick a table, preview it, then download every row as CSV. Inline file content is left out.</p>
        </div>
        <Button variant="primary" icon={<Download size={14} />} onClick={download} loading={busy} disabled={loading || !!error}>Download CSV</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 bg-white border border-[#e3e3e3] rounded shadow-card p-3">
        <Field label="Table" className="w-full sm:w-64">
          <Select value={table} onChange={(e) => setTable(e.target.value as TableName)} options={EXPORT_TABLES} />
        </Field>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Rows" value={loading ? '…' : fmtNumber(rows.length)} />
        <StatCard label="Columns" value={loading ? '…' : fmtNumber(cols.length)} />
        <StatCard label="Preview" value={loading ? '…' : `${fmtNumber(Math.min(PREVIEW, rows.length))} rows`} hint="The download includes all rows" />
      </div>
      <ErrorBanner message={error} />
      <Panel title={`${label} — preview`} bodyClassName="p-0" actions={<span className="text-xs text-ink-400">First {PREVIEW} rows</span>}>
        {loading ? <LoadingBlock label={`Loading ${label.toLowerCase()}…`} /> : !rows.length ? (
          <EmptyState icon={<Database size={22} />} title="No rows in this table" message="Pick another table or add some records first." />
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="min-w-full text-[12px]">
              <thead className="sticky top-0 bg-ink-50">
                <tr>{cols.map((c) => <th key={c} className="text-left font-semibold text-ink-600 px-3 py-2 whitespace-nowrap border-b border-ink-100">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW).map((r, i) => (
                  <tr key={String(r.id ?? i)} className="border-b border-ink-50 hover:bg-ink-50/60">
                    {cols.map((c) => { const v = cell(r[c]); return <td key={c} className="px-3 py-1.5 text-ink-800 whitespace-nowrap max-w-[260px] truncate" title={v.length > 40 ? v : undefined}>{v || <span className="text-ink-300">—</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
