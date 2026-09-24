import { uuid } from '@/lib/db';
import type { ReportSchedule, SavedReport, Staff } from '@/lib/types';

/** Deterministic Reports 5.0 sample: saved reports with favorites, schedules and sharing. */
export function buildReportsSample(d: { staff: Staff[] }): { saved_reports: SavedReport[] } {
  const people = d.staff.filter((s) => s.active);
  const pick = (i: number) => (people.length ? people[i % people.length] : null);
  const daysAgo = (n: number) => {
    const t = new Date();
    t.setHours(9, 0, 0, 0);
    t.setDate(t.getDate() - n);
    return t.toISOString();
  };
  const row = (i: number, name: string, report_key: string, age: number, opts: { favorite?: boolean; shared?: boolean; schedule?: ReportSchedule } = {}): SavedReport => {
    const owner = pick(i);
    return {
      id: uuid(),
      created_at: daysAgo(age),
      name,
      report_key,
      owner: owner?.name ?? null,
      favorite: !!opts.favorite,
      shared: !!opts.shared,
      schedule: opts.schedule ?? null,
      schedule_email: opts.schedule ? owner?.email ?? null : null,
    };
  };
  return {
    saved_reports: [
      row(0, 'My Renewals — Next 60 Days', 'renewals-due', 40, { favorite: true }),
      row(0, 'Commission by Carrier', 'commission-summary', 33, { favorite: true }),
      row(0, 'Monthly Production Snapshot', 'production', 75, { schedule: 'Monthly' }),
      row(1, 'Weekly Activity Review', 'activity-productivity', 26, { schedule: 'Weekly' }),
      row(1, 'Agency Book of Business', 'book-of-business', 60, { shared: true }),
      row(2, 'Open Claims Watch', 'claims-summary', 18, { shared: true }),
    ],
  };
}
