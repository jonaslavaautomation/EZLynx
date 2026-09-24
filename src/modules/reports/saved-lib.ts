import { useTable } from '@/lib/hooks';
import { addDays, addMonths, parseDate, toISODate, today } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { ReportSchedule, SavedReport } from '@/lib/types';
import { findCategory, findReport } from './registry';

export const SCHEDULES: ReportSchedule[] = ['Daily', 'Weekly', 'Monthly'];

export function useSavedReports() {
  return useTable('saved_reports', { order: { column: 'created_at', ascending: false } });
}

export const savedReportHref = (s: Pick<SavedReport, 'id' | 'report_key'>) => `/reports?report=${encodeURIComponent(s.report_key)}&saved=${s.id}`;
export const openSavedReport = (s: Pick<SavedReport, 'id' | 'report_key'>) => navigate(savedReportHref(s));

/** Next scheduled run (YYYY-MM-DD) after today, stepping from the day the report was saved. */
export function nextRun(s: Pick<SavedReport, 'schedule' | 'created_at'>): string | null {
  if (!s.schedule) return null;
  const t = today();
  const created = parseDate(s.created_at);
  const start = created ? toISODate(created) : t;
  if (start > t) return start;
  if (s.schedule === 'Daily') return addDays(t, 1);
  if (s.schedule === 'Weekly') {
    const days = Math.round((parseDate(t)!.getTime() - parseDate(start)!.getTime()) / 86400000);
    return addDays(start, (Math.floor(days / 7) + 1) * 7);
  }
  for (let k = 1; k < 1200; k++) {
    const d = addMonths(start, k);
    if (d > t) return d;
  }
  return addMonths(t, 1);
}

export const reportMeta = (key: string) => {
  const def = findReport(key);
  return { def, title: def?.title ?? key, category: def ? findCategory(def.categories[0])?.title ?? '' : '' };
};
