import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';
import type { Account, Carrier } from '@/lib/types';
import { OInput, OSelect } from '@/modules/accounts/applicant-fields';
import type { Issue, Workflow } from './model';

/* Workflow context + outlined fields wired to validation (amber "required for rating" state and Fix targets). */

export type Ctx = {
  w: Workflow;
  up: (fn: (w: Workflow) => Workflow) => void;
  issues: Map<string, string>;
  allIssues: Issue[];
  account: Account;
  autoCarriers: Carrier[];
  hidePrefilled: boolean;
  go: (view: string, field?: string) => void;
};

export const WorkflowCtx = createContext<Ctx | null>(null);
export function useWf() {
  const c = useContext(WorkflowCtx);
  if (!c) throw new Error('useWf outside workflow');
  return c;
}

type Opt = string | { value: string; label: string };

export function WInput({ field, label, value, onChange, required, type, disabled, inputMode, maxLength, className, action, max }: {
  field: string; label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; disabled?: boolean;
  inputMode?: 'numeric' | 'tel' | 'email'; maxLength?: number; className?: string; action?: ReactNode; max?: string;
}) {
  const { issues } = useWf();
  const msg = issues.get(field);
  return (
    <div data-field={field} className={className}>
      <OInput label={label} value={value} onChange={onChange} required={required ? 'rating' : undefined} level={msg ? 'rating' : null} message={msg}
        type={type} disabled={disabled} inputMode={inputMode} maxLength={maxLength} action={action} max={max} />
    </div>
  );
}

export function WSelect({ field, label, value, onChange, options, required, disabled, className }: {
  field: string; label: string; value: string; onChange: (v: string) => void; options: Opt[]; required?: boolean; disabled?: boolean; className?: string;
}) {
  const { issues } = useWf();
  const msg = issues.get(field);
  return (
    <div data-field={field} className={className}>
      <OSelect label={label} value={value} onChange={onChange} options={options} required={required ? 'rating' : undefined} level={msg ? 'rating' : null} message={msg} disabled={disabled} />
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, field }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; field?: string }) {
  const { issues } = useWf();
  const msg = field ? issues.get(field) : undefined;
  return (
    <div data-field={field}>
      <label className={cx('inline-flex items-center gap-2.5 text-[14px] text-ink-800 select-none', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
        <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
          className={cx('relative inline-flex h-[14px] w-[34px] shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-300' : 'bg-ink-300')}>
          <span className={cx('absolute h-5 w-5 rounded-full shadow transition-transform grid place-items-center', checked ? 'translate-x-[15px] bg-brand-600' : '-translate-x-[1px] bg-ink-500')}>
            {!checked && <span className="w-2 h-0.5 bg-white rounded" />}
          </span>
        </button>
        {label}
      </label>
      {msg && <div className="text-[11px] text-amber-700 mt-1">{msg}</div>}
    </div>
  );
}

/** Section title with a check (complete) or amber warning (something missing). */
export function SectionTitle({ ok, children, actions }: { ok: boolean; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-3">
      {ok ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={18} className="text-amber-500 fill-amber-100 shrink-0" />}
      <h3 className="text-[15px] font-medium text-ink-900">{children}</h3>
      {actions && <div className="ml-auto flex gap-2">{actions}</div>}
    </div>
  );
}

/** True when no issue's field starts with any of the prefixes. */
export function clean(issues: Map<string, string>, ...prefixes: string[]) {
  for (const k of issues.keys()) if (prefixes.some((p) => k.startsWith(p))) return false;
  return true;
}

export function Card({ title, children, open: initial = true, subtitle, ok, right }: { title: ReactNode; children: ReactNode; open?: boolean; subtitle?: ReactNode; ok?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="bg-white border border-ink-200 rounded shadow-card mb-4">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-ink-100">
        {ok !== undefined && (ok ? <CheckCircle2 size={17} className="text-emerald-600" /> : <AlertTriangle size={17} className="text-amber-500 fill-amber-100" />)}
        <div className="text-[13px] font-semibold text-ink-900">{title}</div>
        {subtitle && <div className="text-[12px] text-ink-500 ml-6 truncate">{subtitle}</div>}
        <div className="ml-auto flex items-center gap-2">
          {right}
          <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} className="w-7 h-7 grid place-items-center text-ink-600 hover:bg-ink-50 rounded">
            {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

const TILE_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#15803d', '#0369a1', '#a16207'];
/** Carrier wordmark tile (agency carriers have no logo artwork). */
export function CarrierMark({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = TILE_COLORS[h % TILE_COLORS.length];
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className={cx('rounded grid place-items-center text-white font-bold shrink-0', size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[12px]')} style={{ background: color }}>{initials}</span>
      <span className={cx('font-bold italic tracking-tight truncate', size === 'sm' ? 'text-[12px]' : 'text-[14px]')} style={{ color }}>{name.toUpperCase()}</span>
    </span>
  );
}

export function Help({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <Info size={16} className="text-ink-800 fill-ink-800 [&>path]:stroke-white cursor-help" aria-label={text} />
      <span className="pointer-events-none absolute right-0 top-6 z-20 hidden group-hover:block w-64 rounded bg-ink-900 text-white text-[12px] px-3 py-2 shadow-pop">{text}</span>
    </span>
  );
}

export function Notice({ tone = 'teal', children }: { tone?: 'teal' | 'red'; children: ReactNode }) {
  return (
    <div className={cx('inline-flex items-center gap-2 rounded px-3 py-2 text-[12.5px]', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-brand-50 text-ink-800 border border-brand-100')}>
      <span className={cx('w-4 h-4 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0', tone === 'red' ? 'bg-red-600' : 'bg-brand-600')}>{tone === 'red' ? '!' : 'i'}</span>
      <span>{children}</span>
    </div>
  );
}
