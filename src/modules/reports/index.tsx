import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarClock, Database, FolderOpen, LayoutGrid, Save, Star, Users } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader, SearchInput, Select, cx } from '@/components/ui';
import { navigate, useRoute } from '@/lib/router';
import type { SavedReport } from '@/lib/types';
import { useReportData } from './data';
import { REPORTS, REPORT_CATEGORIES, findCategory, findReport, reportsIn, type ReportCategory, type ReportDef } from './registry';
import { FavoriteStar, ReportToolbar, SavedReportCard } from './saved';
import { useReportFavorites, useSavedReportActions } from './saved-hooks';
import { useSavedReports } from './saved-lib';

export { BarChart, HBarChart, DonutChart, LineChart, Sparkline, Legend } from './charts';

type SavedView = 'favorites' | 'scheduled' | 'shared' | 'saved';
type View = SavedView | 'all';

const VIEWS: { key: View; label: string; icon: typeof Star; description: string; filter?: (r: SavedReport) => boolean; empty?: string }[] = [
  { key: 'favorites', label: 'Favorite Reports', icon: Star, description: 'Reports you starred to keep at your fingertips.', filter: (r) => r.favorite, empty: 'Open any report and click ★ Favorite to pin it here.' },
  { key: 'scheduled', label: 'Scheduled Reports', icon: CalendarClock, description: 'Saved reports generated automatically on a daily, weekly or monthly schedule.', filter: (r) => !!r.schedule, empty: 'Open a report and click Schedule… to have it generated automatically.' },
  { key: 'shared', label: 'Shared Reports', icon: Users, description: 'Saved reports shared with other users in the agency.', filter: (r) => r.shared, empty: 'Use Share… on a saved report card to share it with the agency.' },
  { key: 'saved', label: 'Saved Reports', icon: Save, description: 'Every saved report in the agency — open, rename, schedule or share.', filter: () => true, empty: 'Open a report and click Save as… to save it here.' },
  { key: 'all', label: 'All Reports', icon: LayoutGrid, description: 'The full report library, grouped by category.' },
];

const reportHref = (def: ReportDef, category?: string | null) => `/reports?report=${def.key}${category && (def.categories as string[]).includes(category) ? `&category=${category}` : ''}`;

export function ReportsPage() {
  const { params } = useRoute();
  const data = useReportData();
  const savedQ = useSavedReports();
  const report = findReport(params.get('report'));
  const category = findCategory(params.get('category'));
  const rawView = params.get('view') as View | null;
  const view: View | 'category' | 'report' = report ? 'report' : category && !rawView ? 'category' : VIEWS.some((v) => v.key === rawView) ? rawView! : 'all';
  const savedId = params.get('saved');
  const saved = report && savedId ? savedQ.data.find((s) => s.id === savedId) ?? null : null;
  const savedMissing = !!(report && savedId && !saved && !savedQ.loading);
  const railCategory = report ? (category && (report.categories as string[]).includes(category.key) ? category.key : report.categories[0]) : view === 'category' ? category?.key ?? null : null;
  const Report = report?.Component;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Reports" subtitle="Reports 5.0 — favorite, save, schedule and share reports; filter, chart, export and print agency data" icon={<BarChart3 size={20} />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start">
        <Rail view={view} railCategory={railCategory} report={report} saved={savedQ.data} />
        <div className="min-w-0">
          {view === 'report' && report && Report ? (
            <>
              <ReportToolbar def={report} saved={saved} savedMissing={savedMissing} rows={savedQ.data} />
              <ErrorBanner message={data.error} />
              {data.loading && !data.policies.length && !data.accounts.length ? <LoadingBlock label="Loading report data…" /> : <Report key={report.key} data={data} />}
            </>
          ) : view === 'category' && category ? (
            <Library category={category} saved={savedQ.data} />
          ) : view === 'all' ? (
            <Library category={null} saved={savedQ.data} />
          ) : (
            <SavedList view={view as SavedView} rows={savedQ.data} loading={savedQ.loading} error={savedQ.error} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Left rail (mirrors the Reports menu) ──

function Rail({ view, railCategory, report, saved }: { view: string; railCategory: string | null; report: ReportDef | null; saved: SavedReport[] }) {
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, v.filter ? saved.filter(v.filter).length : REPORTS.length])), [saved]);
  const mobileValue = report ? `report:${report.key}` : view === 'category' ? `category:${railCategory}` : `view:${view}`;
  const mobileOptions = [
    ...VIEWS.map((v) => ({ value: `view:${v.key}`, label: `Reports 5.0 · ${v.label} (${counts[v.key]})` })),
    ...REPORT_CATEGORIES.map((c) => ({ value: `category:${c.key}`, label: `Category · ${c.title} (${reportsIn(c.key).length})` })),
    ...(report ? [{ value: `report:${report.key}`, label: `Report · ${report.title}` }] : []),
  ];
  const onMobile = (v: string) => {
    const [kind, key] = v.split(':');
    if (kind === 'view') navigate(`/reports?view=${key}`);
    else if (kind === 'category') navigate(`/reports?category=${key}`);
  };
  const siblings = report && railCategory ? reportsIn(railCategory) : [];

  const item = (active: boolean, onClick: () => void, icon: ReactNode, label: string, count?: number) => (
    <button
      key={label}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx('w-full flex items-center gap-2 text-left px-3 py-1.5 border-l-2 transition-colors text-[13px]', active ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-transparent bg-transparent text-ink-800 hover:bg-ink-50')}
    >
      {icon}<span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[11px] text-ink-400 tabular-nums">{count}</span>}
    </button>
  );

  return (
    <nav className="print:hidden" aria-label="Report library">
      <div className="lg:hidden space-y-2">
        <Select value={mobileValue} onChange={(e) => onMobile(e.target.value)} options={mobileOptions} />
        {report && siblings.length > 1 && (
          <Select value={report.key} onChange={(e) => { const def = findReport(e.target.value); if (def) navigate(reportHref(def, railCategory)); }} options={siblings.map((r) => ({ value: r.key, label: r.title }))} />
        )}
      </div>
      <div className="hidden lg:block bg-white border border-[#e3e3e3] rounded shadow-card py-2 lg:sticky lg:top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Reports 5.0</div>
        {VIEWS.map((v) => { const Icon = v.icon; return item(view === v.key, () => navigate(`/reports?view=${v.key}`), <Icon size={14} className="shrink-0 text-ink-400" />, v.label, counts[v.key]); })}
        {item(report?.key === 'data-export', () => navigate('/reports?report=data-export'), <Database size={14} className="shrink-0 text-ink-400" />, 'Data Export')}
        <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Categories</div>
        {REPORT_CATEGORIES.map((c) => (
          <div key={c.key}>
            {item(!report && railCategory === c.key, () => navigate(`/reports?category=${c.key}`), <FolderOpen size={14} className={cx('shrink-0', railCategory === c.key ? 'text-brand-500' : 'text-ink-400')} />, c.title, reportsIn(c.key).length)}
            {report && railCategory === c.key && (
              <div className="pb-1">
                {siblings.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => navigate(reportHref(r, c.key))}
                    aria-current={r.key === report.key ? 'page' : undefined}
                    className={cx('w-full text-left pl-9 pr-3 py-1 text-[12px] bg-transparent border-l-2', r.key === report.key ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-transparent text-ink-600 hover:bg-ink-50')}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ── Library grid (all / category) ──

function Library({ category, saved }: { category: ReportCategory | null; saved: SavedReport[] }) {
  const [q, setQ] = useState('');
  const favorites = useReportFavorites(saved);
  const match = (r: ReportDef) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${r.title} ${r.description} ${r.categories.map((c) => findCategory(c)?.title).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const sections = (category ? [category] : REPORT_CATEGORIES).map((c) => ({ c, reports: reportsIn(c.key).filter(match) })).filter((s) => s.reports.length);
  const total = new Set(sections.flatMap((s) => s.reports.map((r) => r.key))).size;

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900">{category ? category.title : 'All Reports'}</h2>
          <p className="text-[13px] text-ink-400">{category ? category.description : 'The full report library, grouped by category. A report can appear in more than one category.'}</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search reports…" className="w-full sm:w-64" />
      </div>
      {!sections.length ? (
        <div className="bg-white border border-[#e3e3e3] rounded shadow-card">
          <EmptyState title="No reports match your search" message="Try a different word, or clear the search." action={<Button onClick={() => setQ('')}>Clear search</Button>} />
        </div>
      ) : sections.map(({ c, reports }) => (
        <section key={c.key}>
          {!category && (
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => navigate(`/reports?category=${c.key}`)} className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 hover:text-brand-700 bg-transparent">{c.title}</button>
              <span className="text-[11px] text-ink-400">{reports.length} report{reports.length === 1 ? '' : 's'}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {reports.map((r) => (
              <div key={r.key} role="link" tabIndex={0} onClick={() => navigate(reportHref(r, c.key))} onKeyDown={(e) => { if (e.key === 'Enter') navigate(reportHref(r, c.key)); }}
                className="bg-white border border-[#e3e3e3] rounded shadow-card p-3 flex items-start gap-2 cursor-pointer hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 transition-colors min-w-0">
                <div className="w-8 h-8 rounded bg-brand-50 text-brand-600 grid place-items-center shrink-0">{r.key === 'data-export' ? <Database size={15} /> : <BarChart3 size={15} />}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink-900 truncate">{r.title}</div>
                  <div className="text-[12px] text-ink-500">{r.description}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.categories.map((k) => (
                      <span key={k} className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded', k === c.key ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500')}>{findCategory(k)?.title}</span>
                    ))}
                  </div>
                </div>
                <FavoriteStar on={favorites.isFavorite(r.key)} busy={favorites.busyKey === r.key} onClick={() => favorites.toggle(r)} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {sections.length > 0 && q && <p className="text-xs text-ink-400">{total} matching report{total === 1 ? '' : 's'}</p>}
    </div>
  );
}

// ── Saved report views (favorites / scheduled / shared / saved) ──

function SavedList({ view, rows, loading, error }: { view: SavedView; rows: SavedReport[]; loading: boolean; error: string | null }) {
  const cfg = VIEWS.find((v) => v.key === view)!;
  const actions = useSavedReportActions();
  const [q, setQ] = useState('');
  const list = rows.filter(cfg.filter!).filter((r) => {
    if (!q) return true;
    const hay = `${r.name} ${findReport(r.report_key)?.title ?? r.report_key} ${r.owner ?? ''}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  });
  const Icon = cfg.icon;
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900">{cfg.label}</h2>
          <p className="text-[13px] text-ink-400">{cfg.description}</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search saved reports…" className="w-full sm:w-64" />
      </div>
      {view === 'scheduled' && <div className="rounded border border-amber-200 bg-amber-50 text-amber-800 text-[12px] px-3 py-2">Scheduled delivery is simulated — no email is sent from this training system. Use <b>Run now</b> to generate a report on demand.</div>}
      <ErrorBanner message={error} />
      {loading && !rows.length ? <LoadingBlock label="Loading saved reports…" /> : !list.length ? (
        <div className="bg-white border border-[#e3e3e3] rounded shadow-card">
          <EmptyState icon={<Icon size={22} />} title={q ? 'No saved reports match your search' : `No ${cfg.label.toLowerCase()} yet`} message={q ? 'Try a different word, or clear the search.' : cfg.empty}
            action={q ? <Button onClick={() => setQ('')}>Clear search</Button> : <Button variant="primary" onClick={() => navigate('/reports?view=all')}>Browse all reports</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((r) => <SavedReportCard key={r.id} row={r} actions={actions} />)}
        </div>
      )}
      {actions.element}
    </div>
  );
}
