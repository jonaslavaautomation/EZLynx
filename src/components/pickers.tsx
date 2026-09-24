import { Building2, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input, Select, cx } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName } from '@/lib/format';
import { useDebounced, useRow, useTable } from '@/lib/hooks';
import type { Account, LineOfBusiness } from '@/lib/types';

/** Typeahead to choose an account. `value` is the account id. */
export function AccountPicker({ value, onChange, disabled, placeholder = 'Search accounts by name, email or phone…' }: { value: string | null; onChange: (id: string | null, account: Account | null) => void; disabled?: boolean; placeholder?: string }) {
  const selected = useRow('accounts', value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Account[]>([]);
  const debounced = useDebounced(q, 200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const run = debounced.trim()
      ? db.search('accounts', ['first_name', 'last_name', 'business_name', 'email', 'phone'], debounced, 8)
      : db.list('accounts', { order: { column: 'created_at', ascending: false }, limit: 8 });
    run.then((r) => { if (live) setResults(r); }).catch(() => {});
    return () => { live = false; };
  }, [debounced]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (value && selected.data) {
    const a = selected.data;
    return (
      <div className="flex items-center gap-2 h-9 rounded border border-ink-200 bg-ink-50 px-2.5 text-[13px]">
        {a.account_type === 'Commercial' ? <Building2 size={14} className="text-ink-400" /> : <User size={14} className="text-ink-400" />}
        <span className="font-semibold text-ink-900 truncate">{accountName(a)}</span>
        <span className="text-ink-400 truncate hidden sm:inline">{a.email}</span>
        {!disabled && <button type="button" className="ml-auto bg-transparent text-ink-400 hover:text-ink-800" onClick={() => onChange(null, null)} aria-label="Clear account"><X size={14} /></button>}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Input value={q} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-ink-100 rounded shadow-pop max-h-64 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400">No matching accounts</div>}
          {results.map((a) => (
            <button type="button" key={a.id} onClick={() => { onChange(a.id, a); setOpen(false); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 bg-transparent flex items-center gap-2">
              {a.account_type === 'Commercial' ? <Building2 size={14} className="text-ink-400 shrink-0" /> : <User size={14} className="text-ink-400 shrink-0" />}
              <span className="text-[13px] font-semibold text-ink-900 truncate">{accountName(a)}</span>
              <span className="text-xs text-ink-400 truncate">{a.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Select one of an account's policies. */
export function PolicySelect({ accountId, value, onChange, allowEmpty = true, className }: { accountId: string | null; value: string | null; onChange: (id: string | null) => void; allowEmpty?: boolean; className?: string }) {
  const policies = useTable('policies', accountId ? { eq: { account_id: accountId }, order: { column: 'effective_date', ascending: false } } : null);
  return (
    <Select
      className={className}
      value={value ?? ''}
      disabled={!accountId}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={allowEmpty ? (accountId ? 'No policy' : 'Choose an account first') : undefined}
      options={policies.data.map((p) => ({ value: p.id, label: `${p.policy_number} · ${p.line_of_business} · ${p.carrier}` }))}
    />
  );
}

export function StaffSelect({ value, onChange, placeholder = 'Unassigned', className }: { value: string | null; onChange: (name: string | null) => void; placeholder?: string; className?: string }) {
  const { activeStaff } = useAppData();
  return <Select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} options={activeStaff.map((s) => ({ value: s.name, label: `${s.name} · ${s.role}` }))} />;
}

/** Carrier dropdown; filters to appointed carriers writing `line` when given. */
export function CarrierSelect({ value, onChange, line, className }: { value: string; onChange: (name: string) => void; line?: LineOfBusiness; className?: string }) {
  const { appointedCarriers } = useAppData();
  const list = line ? appointedCarriers.filter((c) => c.lines.includes(line)) : appointedCarriers;
  const names = list.map((c) => c.name);
  if (value && !names.includes(value)) names.unshift(value);
  return <Select className={cx(className)} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Select carrier" options={names} />;
}
