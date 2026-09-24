import { Download, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, DataTable, EmptyState, Field, Panel, Pills, Select, StatCard, cx, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { downloadCsv, fmtDate, today } from '@/lib/format';

export type Kpi = { label: string; value: ReactNode; hint?: ReactNode; tone?: 'brand' | 'amber' | 'red' | 'green' | 'purple' | 'blue' };

/** Common layout for every report: filters bar, KPI tiles, one chart, a table, CSV export and print. */
export function ReportFrame<T extends { id: string }>({
  reportKey, title, description, filters, kpis, chartTitle, chart, tableTitle, columns, rows, csv, initialSort, note,
}: {
  reportKey: string;
  title: string;
  description: string;
  filters?: ReactNode;
  kpis: Kpi[];
  chartTitle: string;
  chart: ReactNode;
  tableTitle?: string;
  columns: Column<T>[];
  rows: T[];
  csv: () => Record<string, unknown>[];
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  note?: ReactNode;
}) {
  const { toast } = useFeedback();
  const { settings } = useAppData();
  const exportCsv = () => {
    const data = csv();
    if (!data.length) { toast('Nothing to export for the selected filters', 'info'); return; }
    downloadCsv(`${reportKey}-${today()}.csv`, data);
    toast(`Exported ${data.length} rows`);
  };
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="hidden print:block text-xs text-ink-500 mb-1">{settings?.name ?? 'Northstar AMS'} · Printed {fmtDate(today())}</div>
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <p className="text-[13px] text-ink-400">{description}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      {filters && <div className="flex flex-wrap items-end gap-3 bg-white border border-[#e3e3e3] rounded shadow-card p-3 print:hidden">{filters}</div>}
      <div className={cx('grid grid-cols-2 gap-3', kpis.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {kpis.map((k) => <StatCard key={k.label} label={k.label} value={k.value} hint={k.hint} tone={k.tone} />)}
      </div>
      <Panel title={chartTitle} className="break-inside-avoid">{chart}</Panel>
      <Panel title={tableTitle ?? 'Details'} bodyClassName="p-0" actions={<span className="text-xs text-ink-400">{rows.length} rows</span>}>
        <DataTable columns={columns} rows={rows} initialSort={initialSort} pageSize={50} dense empty={<EmptyState title="No data for the selected filters" message="Adjust the filters above." />} />
      </Panel>
      {note && <p className="text-xs text-ink-400">{note}</p>}
    </div>
  );
}

/** Small labeled select for filter bars. */
export function FilterSelect({ label, value, onChange, options, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string; className?: string }) {
  return (
    <Field label={label} className={cx('w-full sm:w-48', className)}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} placeholder={placeholder} />
    </Field>
  );
}

export function FilterPills<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">{label}</span>
      <Pills value={value} onChange={onChange} options={options} />
    </div>
  );
}
