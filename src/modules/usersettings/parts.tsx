import { useState, type ReactNode } from 'react';
import { Button, cx } from '@/components/ui';

/* Small layout pieces shared by the User Settings tabs. */

export function H({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('text-[20px] font-medium text-ink-900 mb-3', className)}>{children}</h2>;
}

export function SaveBar({ onSave, onReset, busy, dirty }: { onSave: () => void; onReset: () => void; busy: boolean; dirty: boolean }) {
  return (
    <div className="flex items-center gap-3 mt-7">
      <Button variant="primary" loading={busy} onClick={onSave}>Save</Button>
      <Button onClick={onReset} disabled={busy || !dirty}>Reset</Button>
      {dirty && <span className="text-xs text-ink-500">Unsaved changes</span>}
    </div>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-3 text-[14px] text-ink-900 py-1.5', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input type="checkbox" className="w-[18px] h-[18px] accent-[#dc2626]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Radios<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="inline-flex items-center gap-3 text-[14px] text-ink-900 cursor-pointer">
          <input type="radio" name={name} className="w-[18px] h-[18px] accent-[#dc2626]" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-start gap-2.5 rounded bg-brand-50 border border-brand-100 text-ink-800 text-[14px] px-4 py-3 mb-5">
      <span className="w-5 h-5 rounded-full bg-brand-600 text-white grid place-items-center text-[12px] font-bold shrink-0 mt-px">i</span>
      <span>{children}</span>
    </div>
  );
}

/** Local draft of a settings slice: edit freely, then save or reset to the stored value. */
export function useDraft<T extends Record<string, unknown>>(stored: T) {
  const [base, setBase] = useState(stored);
  const [v, setV] = useState(stored);
  const dirty = JSON.stringify(base) !== JSON.stringify(v);
  return {
    v,
    set: (patch: Partial<T>) => setV((cur) => ({ ...cur, ...patch })),
    dirty,
    reset: () => setV(base),
    commit: (next: T) => { setBase(next); setV(next); },
  };
}
