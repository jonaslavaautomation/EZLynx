import { BarChart3, BookOpen, DollarSign, Headphones, TrendingUp } from 'lucide-react';
import { ErrorBanner, LoadingBlock, PageHeader, Select, cx } from '@/components/ui';
import { setParam, useRoute } from '@/lib/router';
import { useReportData } from './data';
import { REPORTS, REPORT_GROUPS, type ReportGroup } from './registry';

export { BarChart, HBarChart, DonutChart, LineChart, Sparkline, Legend } from './charts';

const GROUP_ICONS: Record<ReportGroup, typeof BookOpen> = { 'Book of Business': BookOpen, Sales: TrendingUp, Service: Headphones, Financial: DollarSign };

export function ReportsPage() {
  const { params } = useRoute();
  const data = useReportData();
  const selected = REPORTS.find((r) => r.key === params.get('report')) ?? REPORTS[0];
  const Report = selected.Component;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Reports" subtitle="Report library — filter, chart, export and print agency data" icon={<BarChart3 size={20} />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-4 items-start">
        <nav className="print:hidden" aria-label="Report library">
          <div className="lg:hidden">
            <Select value={selected.key} onChange={(e) => setParam('report', e.target.value)} options={REPORTS.map((r) => ({ value: r.key, label: `${r.group} · ${r.title}` }))} />
          </div>
          <div className="hidden lg:block bg-white border border-[#e3e3e3] rounded shadow-card py-2 lg:sticky lg:top-16">
            {REPORT_GROUPS.map((g) => {
              const Icon = GROUP_ICONS[g];
              return (
                <div key={g} className="mb-1">
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400"><Icon size={12} />{g}</div>
                  {REPORTS.filter((r) => r.group === g).map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setParam('report', r.key)}
                      aria-current={r.key === selected.key ? 'page' : undefined}
                      className={cx('w-full text-left px-3 py-1.5 border-l-2 transition-colors', r.key === selected.key ? 'border-brand-500 bg-brand-50' : 'border-transparent bg-transparent hover:bg-ink-50')}
                    >
                      <div className={cx('text-[13px] font-semibold', r.key === selected.key ? 'text-brand-700' : 'text-ink-800')}>{r.title}</div>
                      <div className="text-[11px] text-ink-400">{r.description}</div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0">
          <ErrorBanner message={data.error} />
          {data.loading && !data.policies.length && !data.accounts.length ? <LoadingBlock label="Loading report data…" /> : <Report key={selected.key} data={data} />}
        </div>
      </div>
    </div>
  );
}
