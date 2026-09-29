import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Menu, cx } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { Account, CarrierRate, Quote } from '@/lib/types';
import { workflowPath } from '@/modules/quotes/data';

/** One carrier response to a submitted quote. */
type Submission = { quote: Quote; rate: CarrierRate };

const mdy = (iso: string) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; };
const STATUS_TONE: Record<CarrierRate['status'], string> = { Quoted: 'bg-[#1e8e3e]', Declined: 'bg-[#d93025]', Error: 'bg-[#e37400]' };

/** Submissions tab: every quote sent to carriers and each carrier's response. */
export function SubmissionsTab({ account }: { account: Account }) {
  const quotes = useTable('quotes', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const [status, setStatus] = useState<'' | CarrierRate['status']>('');
  const rows: Submission[] = useMemo(() => quotes.data.flatMap((q) => q.results.map((rate) => ({ quote: q, rate }))).filter((s) => !status || s.rate.status === status), [quotes.data, status]);
  const cell = 'px-3 py-2.5 text-[13px] text-ink-800 border-b border-ink-100';
  const head = 'px-3 py-2 text-[12px] font-semibold text-ink-700 border-b border-ink-200 text-left';
  const open = (q: Quote) => navigate(workflowPath(q) ?? `/quotes/${q.id}`);
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]">
        <span className="text-ink-600">Show:</span>
        {(['', 'Quoted', 'Declined', 'Error'] as const).map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={cx('h-8 px-3 rounded border', status === s ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-300 text-ink-800 hover:bg-ink-50')}>{s || 'All'}</button>
        ))}
      </div>
      <div className="bg-white border border-ink-200 rounded overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse" aria-label="Submissions">
          <thead><tr>
            <th className={head}>Date Submitted</th><th className={head}>Line of Business</th><th className={head}>Carrier</th><th className={head}>Status</th>
            <th className={cx(head, 'text-right')}>Premium</th><th className={head}>Term</th><th className={head}>Quote Status</th><th className={head}>Actions</th>
          </tr></thead>
          <tbody>
            {quotes.loading && <tr><td colSpan={8} className="px-3 py-8 text-center text-[13px] text-ink-500">Loading submissions…</td></tr>}
            {!quotes.loading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-[13px] text-ink-500">{quotes.data.some((q) => q.results.length) ? 'No submissions with this status.' : 'No submissions yet. Submit an Auto or Home quote to carriers and the responses appear here.'}</td></tr>}
            {rows.map(({ quote: q, rate: r }) => (
              <tr key={`${q.id}-${r.carrier}`} className="hover:bg-[#f7f9fb]" data-testid="submission-row">
                <td className={cell}>{mdy(q.created_at)}</td>
                <td className={cell}>{q.line_of_business}</td>
                <td className={cell}>{r.carrier}</td>
                <td className={cell}><span className={cx('inline-flex items-center h-[22px] px-2.5 rounded-full text-[12px] font-medium text-white', STATUS_TONE[r.status])}>{r.status}</span>{r.message && <div className="text-[11px] text-ink-500 mt-0.5">{r.message}</div>}</td>
                <td className={cx(cell, 'text-right tabular-nums')}>{r.premium != null ? fmtMoney(r.premium, true) : '—'}</td>
                <td className={cell}>{r.term_months} mo</td>
                <td className={cell}>{q.status}{q.selected_carrier === r.carrier && <span className="ml-1 text-[11px] text-brand-700 font-semibold">(selected)</span>}</td>
                <td className={cell}>
                  <Menu trigger={<button type="button" className="inline-flex items-center gap-1 text-brand-700 font-semibold tracking-wide hover:underline">Actions <ChevronDown size={14} /></button>} items={[
                    { label: 'Open quote', onClick: () => open(q) },
                    { label: 'View quote record', onClick: () => navigate(`/quotes/${q.id}`) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
