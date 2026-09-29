import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, addDays, fmtMoney, today } from '@/lib/format';

import type { Account, Carrier, Policy } from '@/lib/types';
import { saveAppConfig, useAppConfig, type PolicyExtras } from '@/modules/admin/config';

/* Shared pieces of the EZLynx-style policy screens: extra policy fields, labels and the policy ⋮ menu. */

export const lobTitle = (p: Pick<Policy, 'line_of_business'>) =>
  p.line_of_business === 'Personal Auto' ? 'Auto (Personal)' : p.line_of_business === 'Commercial Auto' ? 'Auto (Commercial)' : p.line_of_business;

/** M/D/YYYY, as EZLynx prints policy terms. */
export const mdy = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};
/** MM/DD/YYYY with leading zeros. */
export const mmddyyyy = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
};

/** Writing companies offered for a master company (the carrier's underwriting companies). */
export const writingCompanies = (carrier: string) => {
  const n = carrier.toUpperCase().replace(/\s+(INSURANCE|INS|CASUALTY|MUTUAL)$/i, '');
  return [`${n} INSURANCE COMPANY`, `${n} CASUALTY COMPANY`, `${n} GENERAL INSURANCE COMPANY`];
};

export const isAutoLine = (p: Pick<Policy, 'line_of_business'>) => ['Personal Auto', 'Commercial Auto', 'Motorcycle'].includes(p.line_of_business);

/** Extra EZLynx fields for one policy, with sensible defaults. */
export function usePolicyExtras(policy: Policy | null, account: Account | null, carriers: Carrier[]) {
  const { value, loading } = useAppConfig('policy_details');
  const stored = policy ? value.byPolicy[policy.id] ?? {} : {};
  const extras: PolicyExtras = {
    writing_company: stored.writing_company ?? (policy ? writingCompanies(policy.carrier)[0] : ''),
    rating_state: stored.rating_state ?? account?.state ?? '',
    department: stored.department ?? (account?.account_type === 'Commercial' ? 'Commercial Lines (C/L)' : 'Personal Lines (P/L)'),
    service_team: stored.service_team ?? (policy?.producer ?? account?.producer ? [{ staff: (policy?.producer ?? account?.producer)!, percent: 100 }] : []),
    ...stored,
  };
  const naic = carriers.find((c) => c.name === policy?.carrier)?.naic ?? null;
  return { extras, stored, naic, loading };
}

/** Read-modify-write so quick successive saves don't overwrite each other. */
export async function savePolicyExtras(policyId: string, fn: (e: PolicyExtras) => PolicyExtras) {
  const [row] = await db.list('app_config', { eq: { key: 'policy_details' } });
  const all = (row?.value as { byPolicy?: Record<string, PolicyExtras> } | undefined)?.byPolicy ?? {};
  await saveAppConfig('policy_details', { byPolicy: { ...all, [policyId]: fn(structuredClone(all[policyId] ?? {})) } });
}

// ── ⋮ menu with Service ▸ / Other ▸ flyouts (EZLynx policy card) ──

export type MenuNode = { label: string; onClick?: () => void; children?: MenuNode[]; disabled?: boolean; danger?: boolean };

export function FlyoutMenu({ trigger, items, label }: { trigger: ReactNode; items: MenuNode[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setSub(null); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setSub(null); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const pick = (n: MenuNode) => { if (n.children) { setSub(sub === n.label ? null : n.label); return; } setOpen(false); setSub(null); n.onClick?.(); };
  const itemCls = (n: MenuNode, active = false) => cx('w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left disabled:opacity-40', n.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-800 hover:bg-ink-50', active && 'bg-ink-50 ring-1 ring-inset ring-ink-300');
  return (
    <div className="relative inline-block" ref={ref}>
      <span onClick={() => { setOpen(!open); setSub(null); }}>{trigger}</span>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 z-50 mt-1 min-w-[150px] bg-white rounded shadow-pop border border-ink-100 py-1">
          {items.map((n) => (
            <div key={n.label} className="relative" onMouseEnter={() => n.children && setSub(n.label)}>
              <button type="button" role="menuitem" aria-haspopup={n.children ? 'menu' : undefined} aria-expanded={n.children ? sub === n.label : undefined} disabled={n.disabled} onClick={() => pick(n)} className={itemCls(n, sub === n.label)}>
                <span className="flex-1">{n.label}</span>{n.children && <ChevronRight size={13} className="text-ink-500" />}
              </button>
              {n.children && sub === n.label && (
                <div role="menu" aria-label={n.label} className="absolute left-full top-0 ml-0.5 min-w-[200px] bg-white rounded shadow-pop border border-ink-100 py-1">
                  {n.children.map((c) => <button key={c.label} type="button" role="menuitem" disabled={c.disabled} onClick={() => pick(c)} className={itemCls(c)}>{c.label}</button>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small service dialogs used by the ⋮ menu ──

/** Change request: a task for the service team to request a change from the carrier. */
export function ChangeRequestModal({ policy, account, onClose }: { policy: Policy; account: Account | null; onClose: () => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [what, setWhat] = useState('');
  const [due, setDue] = useState(addDays(today(), 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!what.trim()) { setError('Describe the change the insured is asking for.'); return; }
    setBusy(true);
    try {
      await db.insert('activities', {
        account_id: policy.account_id, policy_id: policy.id, type: 'Task', subject: `Change request — ${lobTitle(policy)} ${policy.policy_number}`,
        description: what.trim(), due_date: due, priority: 'Normal', status: 'Open', assigned_to: account?.csr ?? me?.name ?? null, completed_at: null,
      });
      toast('Change request created as a task for the service team');
      onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Change request" subtitle={`${lobTitle(policy)} | ${policy.policy_number}`} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>Submit request</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Requested change" required><Textarea rows={4} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Add 2024 Ford F-250, VIN 1FT7W2BA…, effective 09/18" /></Field>
        <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <p className="text-[11.5px] text-ink-500">Assigned to {account?.csr ?? me?.name ?? 'you'}. Process it with Service → Change once the carrier confirms.</p>
      </div>
    </Modal>
  );
}

/** Compare this policy side by side with another policy on the account. */
export function CompareModal({ policy, policies, onClose }: { policy: Policy; policies: Policy[]; onClose: () => void }) {
  const others = policies.filter((p) => p.id !== policy.id);
  const [otherId, setOtherId] = useState(others.find((p) => p.line_of_business === policy.line_of_business)?.id ?? others[0]?.id ?? '');
  const other = others.find((p) => p.id === otherId);
  const names = [...new Set([...(policy.coverages ?? []).map((c) => c.name), ...(other?.coverages ?? []).map((c) => c.name)])];
  const cov = (p: Policy | undefined, n: string) => { const c = p?.coverages?.find((x) => x.name === n); return c ? `${c.limit}${c.deductible ? ` / ${c.deductible} ded` : ''}` : '—'; };
  const rows: [string, (p: Policy) => string][] = [
    ['Line of business', (p) => lobTitle(p)], ['Carrier', (p) => p.carrier], ['Status', (p) => p.status], ['Term', (p) => `${mdy(p.effective_date)} to ${mdy(p.expiration_date)}`],
    ['Premium', (p) => fmtMoney(p.premium, true)], ['Billing', (p) => `${p.billing_type}${p.payment_plan ? ` · ${p.payment_plan}` : ''}`],
  ];
  return (
    <Modal title="Compare policies" size="lg" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      {!others.length ? <p className="text-[13px] text-ink-500">This insured has only one policy, so there is nothing to compare it with.</p> : (
        <div className="space-y-3">
          <Field label="Compare with"><Select value={otherId} onChange={(e) => setOtherId(e.target.value)} options={others.map((p) => ({ value: p.id, label: `${lobTitle(p)} | ${p.policy_number}` }))} /></Field>
          <table className="w-full text-[13px] border-collapse">
            <thead><tr className="text-left text-[12px] text-ink-600"><th className="py-1.5 pr-3 w-44" /><th className="py-1.5 pr-3">{policy.policy_number}</th><th className="py-1.5">{other?.policy_number}</th></tr></thead>
            <tbody>
              {rows.map(([k, f]) => <tr key={k} className="border-t border-ink-100"><td className="py-1.5 pr-3 text-ink-600">{k}</td><td className="py-1.5 pr-3">{f(policy)}</td><td className="py-1.5">{other ? f(other) : '—'}</td></tr>)}
              {names.map((n) => <tr key={n} className="border-t border-ink-100"><td className="py-1.5 pr-3 text-ink-600">{n}</td><td className="py-1.5 pr-3">{cov(policy, n)}</td><td className={cx('py-1.5', cov(policy, n) !== cov(other, n) && 'font-semibold text-brand-700')}>{cov(other, n)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Export policy information as a CSV file (policy, coverages, vehicles, drivers). */
export async function exportPolicyCsv(policy: Policy, account: Account | null) {
  const [vehicles, drivers] = await Promise.all([db.list('vehicles', { eq: { account_id: policy.account_id } }), db.list('drivers', { eq: { account_id: policy.account_id } })]);
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [
    'Section,Field,Value',
    ...([['Insured', accountName(account)], ['Policy number', policy.policy_number], ['Line of business', lobTitle(policy)], ['Carrier', policy.carrier], ['Status', policy.status], ['Effective', policy.effective_date], ['Expiration', policy.expiration_date], ['Premium', policy.premium], ['Billing', policy.billing_type], ['Payment plan', policy.payment_plan]] as [string, unknown][]).map(([k, v]) => ['Policy', k, v].map(q).join(',')),
    ...(policy.coverages ?? []).map((c) => ['Coverage', c.name, `${c.limit}${c.deductible ? ` / ded ${c.deductible}` : ''}`].map(q).join(',')),
    ...(isAutoLine(policy) ? vehicles.map((v, i) => ['Vehicle', `#${i + 1}`, `${v.year} ${v.make} ${v.model} VIN ${v.vin ?? ''}`].map(q).join(',')) : []),
    ...(isAutoLine(policy) ? drivers.map((d, i) => ['Driver', `#${i + 1}`, `${d.first_name} ${d.last_name} (${d.relationship ?? ''})`].map(q).join(',')) : []),
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${policy.policy_number} policy information.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function logPolicy(policy: Policy, subject: string, description: string | null, me: string | null) {
  await logActivity({ account_id: policy.account_id, policy_id: policy.id, subject, description, assigned_to: me }).catch(() => {});
}
