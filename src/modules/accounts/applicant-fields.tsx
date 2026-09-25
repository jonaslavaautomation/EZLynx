import { ChevronDown, ChevronRight, Minus, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Modal, cx } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { useTable } from '@/lib/hooks';

/* Shared building blocks for the Personal and Commercial Applicant pages: outlined floating-label fields with
   two validation levels ("required to proceed" red, "required for rating" amber) and the producer/CSR picker. */

// ── Outlined floating-label field ──

export type Level = 'proceed' | 'rating';

export function OField({ label, required, filled, level, message, children, disabled, action, className }: {
  label: string; required?: Level; filled: boolean; level?: Level | null; message?: string; children: ReactNode; disabled?: boolean; action?: ReactNode; className?: string;
}) {
  const [focus, setFocus] = useState(false);
  const float = filled || focus;
  const border = level === 'proceed' ? 'border-red-600' : level === 'rating' ? 'border-amber-500' : focus ? 'border-brand-500' : 'border-ink-300';
  return (
    <div className={cx('min-w-0', className)}>
      <div
        className={cx('relative h-10 rounded border bg-white transition-colors', border, focus && 'ring-1 ring-brand-500/30', disabled && 'bg-ink-50 opacity-70')}
        onFocusCapture={() => setFocus(true)}
        onBlurCapture={() => setFocus(false)}
      >
        <span className={cx('pointer-events-none absolute left-3 transition-all bg-white px-0.5 whitespace-nowrap',
          float ? '-top-2 text-[11px] text-ink-500' : 'top-1/2 -translate-y-1/2 text-[15px] text-ink-400', disabled && !float && 'bg-transparent')}>
          {required && <span className="text-red-600">*</span>}{label}
        </span>
        <div className={cx('flex items-center h-full', !float && 'opacity-0 focus-within:opacity-100')}>{children}{action}</div>
      </div>
      {message && <div className={cx('text-[11px] mt-1 ml-3', level === 'proceed' ? 'text-red-600' : 'text-ink-600')}>{message}</div>}
    </div>
  );
}

export const inputCls = 'w-full h-full bg-transparent outline-none px-3 text-[15px] text-ink-900 disabled:cursor-not-allowed';

export function OInput(props: { label: string; value: string; onChange: (v: string) => void; required?: Level; level?: Level | null; message?: string; type?: string; disabled?: boolean; className?: string; maxLength?: number; inputMode?: 'numeric' | 'tel' | 'email'; max?: string; action?: ReactNode }) {
  const { label, value, onChange, type = 'text', disabled, maxLength, inputMode, max, ...rest } = props;
  return (
    <OField label={label} filled={!!value || type === 'date'} disabled={disabled} {...rest}>
      <input aria-label={label} type={type} value={value} disabled={disabled} maxLength={maxLength} inputMode={inputMode} max={max} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </OField>
  );
}

export function OSelect(props: { label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; required?: Level; level?: Level | null; message?: string; disabled?: boolean; className?: string }) {
  const { label, value, onChange, options, disabled, ...rest } = props;
  return (
    <OField label={label} filled={!!value} disabled={disabled} {...rest}>
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'appearance-none pr-8 cursor-pointer', !value && 'text-transparent')}>
        <option value="" />
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <ChevronDown size={16} className="absolute right-3 pointer-events-none text-ink-500" />
    </OField>
  );
}

export const TextBtn = ({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) => (
  <button type="button" onClick={onClick} className={cx('inline-flex items-center gap-1.5 h-9 px-4 rounded border border-ink-300 bg-white text-brand-600 text-[13px] font-semibold tracking-wide hover:bg-brand-50', className)}>{children}</button>
);

// ── Assign user (producer / CSR) tree picker ──

export function AssignUserModal({ title, current, onAssign, onClose }: { title: string; current: string | null; onAssign: (name: string | null) => void; onClose: () => void }) {
  const { activeStaff, settings } = useAppData();
  const departments = useTable('departments', { order: { column: 'name' } });
  const [picked, setPicked] = useState<string | null>(current);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ agency: true, users: true });
  const match = (name: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
  const users = activeStaff.filter((s) => match(s.name));
  const Tri = ({ state }: { state: 'on' | 'some' | 'off' }) => (
    <span className={cx('w-4 h-4 rounded-sm border grid place-items-center shrink-0', state === 'off' ? 'border-ink-300 bg-white' : 'border-ink-400 bg-ink-300 text-white')}>
      {state === 'some' && <Minus size={12} strokeWidth={3} />}{state === 'on' && <span className="w-2 h-2 bg-white" />}
    </span>
  );
  const UserRow = ({ name }: { name: string }) => (
    <label className="flex items-center gap-3 py-2 pl-2 cursor-pointer text-[14px] text-ink-900 hover:bg-ink-50 rounded">
      <input type="checkbox" className="w-4 h-4 accent-[#7c3aed]" checked={picked === name} onChange={() => setPicked(picked === name ? null : name)} />
      {name}
    </label>
  );
  const Toggle = ({ id }: { id: string }) => (
    <button type="button" aria-label={open[id] ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} className="w-6 h-6 grid place-items-center bg-transparent text-ink-600">
      {open[id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );
  const groupState = (names: string[]) => (picked && names.includes(picked) ? 'some' : 'off') as 'some' | 'off';

  return (
    <Modal title={`${title}: ${picked ?? 'Unassigned'}`} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="ghost" className="!text-brand-600" onClick={() => { onAssign(picked); onClose(); }}>Assign</Button>
    </>}>
      <div className="relative mb-4 max-w-[260px]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search users" className="w-full h-10 rounded border border-ink-300 px-3 pr-9 text-[14px] outline-none focus:border-brand-500" />
        <Search size={18} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-600" />
      </div>
      <div className="min-h-[300px]">
        <div className="flex items-center gap-2"><Toggle id="agency" /><Tri state={groupState(activeStaff.map((s) => s.name))} /><span className="text-[14px] text-ink-400">{settings?.name ?? 'Agency'}</span></div>
        {open.agency && (
          <div className="pl-7">
            <div className="flex items-center gap-2 mt-1"><Toggle id="users" /><Tri state={groupState(activeStaff.map((s) => s.name))} /><span className="text-[14px] text-ink-400">Users</span></div>
            {open.users && <div className="pl-9">{users.map((s) => <UserRow key={s.id} name={s.name} />)}{!users.length && <div className="text-xs text-ink-400 py-2">No users match.</div>}</div>}
            {departments.data.map((d) => {
              const members = d.members.filter(match);
              return (
                <div key={d.id}>
                  <div className="flex items-center gap-2 mt-1"><Toggle id={d.id} /><Tri state={groupState(d.members)} /><span className="text-[14px] text-ink-400">{d.name}</span></div>
                  {open[d.id] && <div className="pl-9">{members.map((m) => <UserRow key={m} name={m} />)}{!members.length && <div className="text-xs text-ink-400 py-2">No members.</div>}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

