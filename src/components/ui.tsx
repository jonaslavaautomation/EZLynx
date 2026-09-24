import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Loader2, MoreVertical, Search, X } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { initials } from '@/lib/format';

/* Shared UI kit. Tailwind classes; colors come from the `brand` (teal) and `ink` (navy) palettes. */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── Buttons ──

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'purple';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 border border-brand-500',
    secondary: 'bg-white text-brand-600 border border-ink-200 hover:bg-brand-50 hover:border-brand-200',
    ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 border border-transparent',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
    purple: 'bg-[#991b1b] text-white hover:bg-[#7f1d1d] border border-[#991b1b]',
  }[variant];
  const sizes = size === 'sm' ? 'h-7 px-2.5 text-xs gap-1.5' : 'h-9 px-3.5 text-[13px] gap-2';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center rounded font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed', styles, sizes, className)}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-grid place-items-center w-8 h-8 rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900 bg-transparent', className)} {...rest}>
      {children}
    </button>
  );
}

// ── Form fields ──

export function Field({ label, error, hint, required, className, children }: { label?: string; error?: string | null; hint?: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cx('block min-w-0', className)}>
      {label && <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>}
      {children}
      {error ? <span className="block text-[11px] text-red-600 mt-1">{error}</span> : hint ? <span className="block text-[11px] text-ink-400 mt-1">{hint}</span> : null}
    </label>
  );
}

const controlCls = 'w-full h-9 rounded border border-ink-200 bg-white px-2.5 text-[13px] text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlCls, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlCls, 'h-auto min-h-[80px] py-2 resize-y', className)} {...rest} />;
}

export function Select({ className, options, placeholder, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select className={cx(controlCls, 'pr-7', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-[13px] text-ink-800 select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8 pr-7" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 bg-transparent" aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Small form-state helper: `const [v, set, setAll] = useForm(initial)`; `set('field')(value)`. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K) => (value: T[K]) => setValues((v) => ({ ...v, [key]: value })), []);
  return [values, set, setValues] as const;
}

// ── Layout pieces ──

export function PageHeader({ title, subtitle, actions, breadcrumb, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: { label: string; href: string }[]; icon?: ReactNode }) {
  return (
    <div className="mb-4">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-ink-400 mb-1.5">
          {breadcrumb.map((b, i) => (
            <span key={b.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              <a href={b.href} className="text-brand-600 hover:underline">{b.label}</a>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink-900 leading-tight truncate">{title}</h1>
            {subtitle && <div className="text-[13px] text-ink-400 mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('bg-white border border-[#e3e3e3] rounded shadow-card min-w-0', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-100">
          {typeof title === 'string' ? <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2> : title}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'brand', onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'amber' | 'red' | 'green' | 'purple' | 'blue'; onClick?: () => void }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-violet-50 text-violet-600', blue: 'bg-sky-50 text-sky-600' };
  return (
    <div onClick={onClick} className={cx('bg-white border border-[#e3e3e3] rounded shadow-card p-4 flex items-start gap-3 min-w-0', onClick && 'cursor-pointer hover:border-brand-200 transition-colors')}>
      {icon && <div className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
        <div className="text-xl font-semibold text-ink-900 mt-0.5 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-ink-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 | 4 }) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-3', cols)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{it.label}</dt>
          <dd className="text-[13px] text-ink-900 mt-0.5 break-words">{it.value === null || it.value === undefined || it.value === '' ? '—' : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 border-b border-ink-100 overflow-x-auto overflow-y-hidden', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px bg-transparent transition-colors', value === t.value ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-400 hover:text-ink-800')}
        >
          {t.label}
          {t.count !== undefined && <span className={cx('ml-1.5 text-[11px] rounded-full px-1.5 py-px', value === t.value ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Segmented filter pills. */
export function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 bg-ink-50 border border-ink-100 rounded p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('px-2.5 h-7 rounded text-xs font-semibold transition-colors', value === o.value ? 'bg-white text-brand-600 shadow-sm' : 'bg-transparent text-ink-500 hover:text-ink-800')}>
          {o.label}{o.count !== undefined && <span className="ml-1 text-ink-400 font-medium">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Status & feedback ──

export type Tone = 'gray' | 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    gray: 'bg-ink-100 text-ink-600', teal: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', blue: 'bg-sky-50 text-sky-700', purple: 'bg-violet-50 text-violet-700',
  };
  return <span className={cx('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  Active: 'green', Paid: 'green', Completed: 'green', Bound: 'green', Delivered: 'green', Quoted: 'green', Closed: 'gray',
  Pending: 'amber', Scheduled: 'blue', Reconciled: 'green', Posted: 'gray', 'In Progress': 'blue', 'Under Review': 'amber', Partial: 'amber', Rated: 'blue', Draft: 'gray', Open: 'blue', Sent: 'teal', Received: 'purple',
  Prospect: 'purple', Inactive: 'gray', Expired: 'gray', Unpaid: 'amber', Void: 'gray', Lost: 'gray',
  Cancelled: 'red', Canceled: 'red', 'Non-Renewed': 'red', Denied: 'red', Declined: 'red', Failed: 'red', Error: 'red',
  High: 'red', Normal: 'gray', Low: 'blue',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-ink-300">—</span>;
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{status}</Badge>;
}

export function Avatar({ name, color = '#684ec2', size = 32 }: { name: string | null | undefined; color?: string; size?: number }) {
  return (
    <span className="inline-grid place-items-center rounded-full text-white font-bold shrink-0" style={{ width: size, height: size, background: color, fontSize: Math.max(10, size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin text-brand-500', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-400"><Spinner /> {label}</div>;
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 text-red-700 text-[13px] px-3 py-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {message}</div>;
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-ink-50 text-ink-300 grid place-items-center mb-3">{icon ?? <Inbox size={22} />}</div>
      <div className="text-sm font-semibold text-ink-800">{title}</div>
      {message && <div className="text-[13px] text-ink-400 mt-1 max-w-sm">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Data table ──

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  className?: string;
};

export function DataTable<T extends { id: string }>({
  columns, rows, onRowClick, empty, initialSort, pageSize = 25, loading, dense, selectedId,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  loading?: boolean;
  dense?: boolean;
  selectedId?: string | null;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b);
      if (av === bv) return 0;
      if (av === null || av === undefined || av === '') return 1;
      if (bv === null || bv === undefined || bv === '') return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  if (loading) return <LoadingBlock />;
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={cx('px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 whitespace-nowrap', align(c.align), c.className)}>
                    {c.sortValue ? (
                      <button className="inline-flex items-center gap-1 bg-transparent uppercase hover:text-ink-800" onClick={() => setSort(active && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' })}>
                        {c.header}{active && (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx('border-b border-ink-50 last:border-0', onRowClick && 'cursor-pointer hover:bg-brand-50/50', selectedId === row.id && 'bg-brand-50')}
              >
                {columns.map((c) => <td key={c.key} className={cx('px-3 text-ink-800 align-middle', dense ? 'py-1.5' : 'py-2.5', align(c.align), c.className)}>{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-3 pt-3 text-xs text-ink-400">
          <span>{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
          <div className="flex items-center gap-1">
            <IconButton label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></IconButton>
            <span>Page {page + 1} / {pages}</span>
            <IconButton label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overlays ──

// Open modals, innermost last: only the top one reacts to Escape (a confirm over a form closes just the confirm),
// and body scrolling is locked while any modal is open.
const modalStack: number[] = [];
let modalSeq = 0;
let bodyOverflow = '';

export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const id = ++modalSeq;
    if (!modalStack.length) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(id), 1);
      if (!modalStack.length) document.body.style.overflow = bodyOverflow;
    };
  }, []);
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-900/40 p-3 sm:p-6 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('w-full bg-white rounded-md shadow-pop my-auto flex flex-col max-h-[calc(100vh-24px)] sm:max-h-[calc(100vh-48px)]', width)} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && <div className="text-xs text-ink-400 mt-0.5">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/50 rounded-b-md">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Dropdown menu of actions, e.g. a row's "More actions". */
export function Menu({ items, trigger, align = 'right' }: { items: ({ label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'divider')[]; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <span onClick={() => setOpen(!open)}>{trigger ?? <IconButton label="More actions"><MoreVertical size={16} /></IconButton>}</span>
      {open && (
        <div className={cx('absolute z-50 mt-1 min-w-[180px] bg-white border border-ink-100 rounded shadow-pop py-1', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) => it === 'divider' ? <div key={i} className="my-1 border-t border-ink-100" /> : (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={cx('w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left bg-transparent disabled:opacity-40', it.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-800 hover:bg-ink-50')}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toasts & confirm (global) ──

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
type ConfirmReq = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };

const FeedbackContext = createContext<{ toast: (message: string, tone?: Toast['tone']) => void; confirm: (opts: Omit<ConfirmReq, 'resolve'>) => Promise<boolean> } | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const confirm = useCallback((opts: Omit<ConfirmReq, 'resolve'>) => new Promise<boolean>((resolve) => setConfirmReq({ ...opts, resolve })), []);
  const close = (ok: boolean) => { confirmReq?.resolve(ok); setConfirmReq(null); };
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed bottom-10 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className={cx('pointer-events-auto min-w-[240px] max-w-sm rounded shadow-pop px-4 py-3 text-[13px] font-medium text-white', t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-ink-800' : 'bg-brand-600')}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
      {confirmReq && (
        <Modal title={confirmReq.title} onClose={() => close(false)} size="sm" footer={<>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button variant={confirmReq.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{confirmReq.confirmLabel ?? 'Confirm'}</Button>
        </>}>
          <div className="text-[13px] text-ink-600">{confirmReq.message}</div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

/** `const { toast, confirm } = useFeedback();` — `await confirm({ title, message, danger: true })`. */
export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
