import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import type { Coverage } from '@/lib/types';
import { blankDraft, parseAmount, type CoverageDraft } from './shared';

export function CoverageEditor({ rows, onChange }: { rows: CoverageDraft[]; onChange: (rows: CoverageDraft[]) => void }) {
  const patch = (key: number, field: keyof Omit<CoverageDraft, 'key'>, value: string) => onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const total = rows.reduce((s, r) => s + (parseAmount(r.premium) ?? 0), 0);
  return (
    <div className="min-w-0">
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60">
                {['Coverage', 'Limit', 'Deductible', 'Premium', ''].map((h) => (
                  <th key={h} className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-ink-50 last:border-0">
                  <td className="px-2 py-1.5 w-[36%]"><Input value={r.name} onChange={(e) => patch(r.key, 'name', e.target.value)} placeholder="e.g. Bodily Injury" aria-label="Coverage name" /></td>
                  <td className="px-2 py-1.5"><Input value={r.limit} onChange={(e) => patch(r.key, 'limit', e.target.value)} placeholder="$100,000" aria-label="Limit" /></td>
                  <td className="px-2 py-1.5"><Input value={r.deductible} onChange={(e) => patch(r.key, 'deductible', e.target.value)} placeholder="—" aria-label="Deductible" /></td>
                  <td className="px-2 py-1.5 w-28"><Input value={r.premium} inputMode="decimal" onChange={(e) => patch(r.key, 'premium', e.target.value)} placeholder="0.00" aria-label="Premium" className="text-right" /></td>
                  <td className="px-1 py-1.5 w-10"><IconButton label="Remove coverage" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} className="hover:text-red-600"><Trash2 size={15} /></IconButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <Button size="sm" icon={<Plus size={13} />} onClick={() => onChange([...rows, blankDraft()])}>Add coverage</Button>
        {rows.length > 0 && <span className="text-xs text-ink-400">Itemized premium: <span className="font-semibold text-ink-800 tabular-nums">{fmtMoney(total, true)}</span></span>}
      </div>
      {rows.length === 0 && <div className="text-[13px] text-ink-400 mt-2">No coverages listed.</div>}
    </div>
  );
}

/** Read-only coverage schedule. */
export function CoverageTable({ coverages }: { coverages: Coverage[] }) {
  if (!coverages?.length) return <div className="text-[13px] text-ink-400 py-2">No coverages on file.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">Coverage</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">Limit</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">Deductible</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-400">Premium</th>
          </tr>
        </thead>
        <tbody>
          {coverages.map((c, i) => (
            <tr key={i} className="border-b border-ink-50 last:border-0">
              <td className="px-3 py-2 font-medium text-ink-900">{c.name}</td>
              <td className="px-3 py-2 text-ink-800 whitespace-nowrap">{c.limit}</td>
              <td className="px-3 py-2 text-ink-800 whitespace-nowrap">{c.deductible || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.premium === undefined || c.premium === null ? '—' : fmtMoney(c.premium, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
