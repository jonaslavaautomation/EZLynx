import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import { natureOfBusiness, searchNaics, type NaicsClass } from '@/modules/accounts/naics';

/** Typeahead over the NAICS reference list; used by the Business Classification editor on the overview. */
export function NaicsLookup({ onPick }: { onPick: (c: NaicsClass) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchNaics(q), [q]);
  return (
    <div className="relative">
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by business type, keyword or code (e.g. landscaping, 722511)"
        className="pl-8"
        aria-label="NAICS code search"
      />
      {open && q.trim() && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-ink-100 rounded shadow-pop max-h-72 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400">No classes match. Try a broader word, or enter the codes below.</div>}
          {results.map((c) => (
            <button key={c.naics} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setQ(''); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 bg-transparent border-b border-ink-50 last:border-0">
              <div className="text-[13px] font-semibold text-ink-900">{c.title}</div>
              <div className="text-[11px] text-ink-400">NAICS {c.naics} · SIC {c.sic} · {natureOfBusiness(c.naics)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
