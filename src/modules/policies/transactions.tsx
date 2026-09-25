import { useState, type ReactNode } from 'react';
import { Button, Checkbox, ErrorBanner, Field, Input, Modal, Select, Textarea, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { addTransaction, createInvoice, logActivity } from '@/lib/domain';
import { addMonths, fmtDate, fmtMoney, parseDate, today } from '@/lib/format';
import type { Policy, PolicyTransaction } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { statusFor } from '@/modules/accounting/shared';
import { CANCEL_REASONS, TERM_OPTIONS, parseAmount, priorTerm, proRataReturn, signedMoney } from './shared';

import type { PolicyAction as TxKind } from './shared';

type Props = { policy: Policy; onClose: () => void; txns?: PolicyTransaction[] };

/** Shared shell: runs `action`, shows errors inline, toasts on success. */
function TxModal({ title, subtitle, confirmLabel, danger, onClose, run, children }: { title: string; subtitle?: ReactNode; confirmLabel: string; danger?: boolean; onClose: () => void; run: () => Promise<string | void>; children: ReactNode }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const msg = await run();
      if (msg) toast(msg);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size="md" footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{confirmLabel}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {children}
      </div>
    </Modal>
  );
}

const sub = (p: Policy) => `${p.policy_number} · ${p.line_of_business} · ${p.carrier}`;

function Summary({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-ink-50 border border-ink-100 rounded px-3 py-2.5">
      {items.map(([k, val]) => (
        <div key={k} className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
          <div className="text-[13px] font-semibold text-ink-900 tabular-nums truncate">{val}</div>
        </div>
      ))}
    </div>
  );
}

function useLog(policy: Policy) {
  const { me } = useAppData();
  return (subject: string, description: string | null) =>
    logActivity({ subject, description, account_id: policy.account_id, policy_id: policy.id, assigned_to: me?.name ?? null });
}

class ValidationError extends Error {}
const need = (cond: unknown, msg: string) => { if (!cond) throw new ValidationError(msg); };
/** Round to cents so repeated ± adjustments don't accumulate float noise (e.g. 1200.3000000000002). */
const cents = (n: number) => Math.round(n * 100) / 100;
const monthsBetween = (from: string, to: string) => Math.max(1, Math.round((parseDate(to)!.getTime() - parseDate(from)!.getTime()) / (30.44 * 86400000)));

/**
 * Earliest date a mid-term transaction may take. After an early renewal the row holds the renewal
 * term, but the prior term is still in force, so its dates stay valid too.
 */
function termFloor(policy: Policy, txns: PolicyTransaction[]) {
  const prior = priorTerm(policy, txns);
  return { prior, min: prior?.start ?? policy.effective_date, rangeMsg: prior ? 'the in-force term or the renewal term' : 'the current term' };
}

/**
 * Applies a return premium to the policy's open invoices, latest due first. An untouched invoice the
 * return fully covers is voided; otherwise the amount is reduced, never below what was already paid.
 * Returns the total credited (any excess is a refund owed to the insured).
 */
async function creditOpenInvoices(policyId: string, amount: number) {
  let left = cents(amount);
  if (left <= 0) return 0;
  const open = (await db.list('invoices', { eq: { policy_id: policyId } }))
    .filter((i) => i.status === 'Unpaid' || i.status === 'Partial')
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  for (const inv of open) {
    if (left <= 0) break;
    const paid = Number(inv.amount_paid);
    const due = cents(Number(inv.amount) - paid);
    if (due <= 0) continue;
    const cut = Math.min(left, due);
    left = cents(left - cut);
    if (cut >= due && paid <= 0) await db.update('invoices', inv.id, { status: 'Void' });
    else {
      const reduced = cents(Number(inv.amount) - cut);
      await db.update('invoices', inv.id, { amount: reduced, status: statusFor(reduced, paid) });
    }
  }
  return cents(amount - left);
}

// ── Endorse / Change ──

function EndorseModal({ policy, onClose, txns = [] }: Props) {
  const log = useLog(policy);
  const { prior, min, rangeMsg } = termFloor(policy, txns);
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [change, setChange] = useState('0');
  const delta = parseAmount(change);
  // A change dated in the prior (still in-force) term belongs to that term; the row's premium is the renewal's.
  const inPrior = Boolean(prior && date && date < policy.effective_date);
  const basePremium = inPrior ? prior!.premium : Number(policy.premium);
  const newPremium = cents(basePremium + (delta ?? 0));
  return (
    <TxModal title="Endorse / change policy" subtitle={sub(policy)} confirmLabel="Process endorsement" onClose={onClose} run={async () => {
      need(date, 'Enter the endorsement effective date.');
      need(date >= min && date <= policy.expiration_date, `Effective date must fall within ${rangeMsg}.`);
      need(desc.trim(), 'Describe the change.');
      need(delta !== null, 'Enter the premium change (use 0 for none).');
      need(newPremium >= 0, 'Premium cannot go below zero.');
      await addTransaction(policy, 'Endorsement', date, delta!, desc.trim());
      if (!inPrior) await db.update('policies', policy.id, { premium: newPremium });
      await log(`Endorsement processed — ${policy.policy_number}`, `${desc.trim()} (effective ${fmtDate(date)}${inPrior ? ', prior term' : ''}, premium ${signedMoney(delta!, fmtMoney)})`);
      return 'Endorsement recorded';
    }}>
      <Summary items={[[inPrior ? 'Prior-term premium' : 'Current premium', fmtMoney(basePremium, true)], ['Change', delta === null ? '—' : signedMoney(delta, fmtMoney)], ['New premium', fmtMoney(newPremium, true)], ['Term ends', fmtDate(inPrior ? prior!.end : policy.expiration_date)]]} />
      {inPrior && <div className="text-[12px] text-ink-500">This date falls in the prior term (still in force until {fmtDate(prior!.end)}); the renewal term premium is not changed.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Effective date" required><Input type="date" value={date} min={min} max={policy.expiration_date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Premium change (±)" required hint="Negative for a return premium"><Input value={change} inputMode="decimal" onChange={(e) => setChange(e.target.value)} /></Field>
        <Field label="Description of change" required className="sm:col-span-2"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="e.g. Added 2024 Honda Civic, removed 2012 Ford Focus" /></Field>
      </div>
    </TxModal>
  );
}

// ── Renew ──

function RenewModal({ policy, onClose }: Props) {
  const log = useLog(policy);
  const [eff, setEff] = useState(policy.expiration_date);
  const [term, setTerm] = useState(String(policy.term_months || 12));
  const [exp, setExp] = useState(addMonths(policy.expiration_date, policy.term_months || 12));
  const [premium, setPremium] = useState(String(policy.premium));
  const [number, setNumber] = useState('');
  const [invoice, setInvoice] = useState(policy.billing_type === 'Agency Bill');
  const p = parseAmount(premium);
  const diff = p === null ? null : p - Number(policy.premium);
  const pct = diff !== null && Number(policy.premium) > 0 ? (diff / Number(policy.premium)) * 100 : null;
  return (
    <TxModal title="Renew policy" subtitle={sub(policy)} confirmLabel="Renew policy" onClose={onClose} run={async () => {
      need(eff && exp, 'Enter the renewal term dates.');
      need(eff > policy.effective_date, "The renewal term must start after the current term's effective date.");
      need(exp > eff, 'Expiration must be after the effective date.');
      need(p !== null && p >= 0, 'Enter a valid renewal premium.');
      const num = number.trim() || policy.policy_number;
      await db.update('policies', policy.id, { effective_date: eff, expiration_date: exp, term_months: Number(term), premium: p!, status: 'Active', policy_number: num });
      const desc = `Renewed ${fmtDate(eff)} – ${fmtDate(exp)} at ${fmtMoney(p!, true)}${diff ? ` (${signedMoney(diff, fmtMoney)} vs. prior term)` : ''}${num !== policy.policy_number ? `; new policy # ${num} (was ${policy.policy_number})` : ''}`;
      await addTransaction({ id: policy.id, account_id: policy.account_id }, 'Renewal', eff, p!, desc);
      if (invoice) await createInvoice({ account_id: policy.account_id, policy_id: policy.id, amount: p!, description: `${policy.line_of_business} renewal premium — ${num}`, due_date: eff });
      await log(`Policy renewed — ${num}`, desc);
      return `Policy renewed through ${fmtDate(exp)}`;
    }}>
      <Summary items={[['Current term', `${fmtDate(policy.effective_date)} – ${fmtDate(policy.expiration_date)}`], ['Prior premium', fmtMoney(policy.premium, true)], ['Renewal premium', p === null ? '—' : fmtMoney(p, true)], ['Change', pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`]]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="New effective date" required><Input type="date" value={eff} onChange={(e) => { setEff(e.target.value); if (e.target.value) setExp(addMonths(e.target.value, Number(term))); }} /></Field>
        <Field label="Term"><Select value={term} onChange={(e) => { setTerm(e.target.value); if (eff) setExp(addMonths(eff, Number(e.target.value))); }} options={TERM_OPTIONS} /></Field>
        <Field label="New expiration date" required><Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
        <Field label="Renewal premium" required><Input value={premium} inputMode="decimal" onChange={(e) => setPremium(e.target.value)} /></Field>
        <Field label="New policy number" hint={`Leave blank to keep ${policy.policy_number}`} className="sm:col-span-2"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
      </div>
      <Checkbox label={`Create an invoice for the renewal premium${policy.billing_type === 'Agency Bill' ? ' (Agency Bill)' : ''}`} checked={invoice} onChange={setInvoice} />
    </TxModal>
  );
}

// ── Cancel ──

function CancelModal({ policy, onClose, txns = [] }: Props) {
  const log = useLog(policy);
  const { prior, min, rangeMsg } = termFloor(policy, txns);
  const initialDate = today() < min ? min : today() > policy.expiration_date ? policy.expiration_date : today();
  // Cancelling during the prior term also takes back the whole renewal term, which never starts.
  const isPrior = (d: string) => Boolean(prior && d && d < policy.effective_date);
  const returnFor = (d: string) => (isPrior(d)
    ? cents(Number(policy.premium) + proRataReturn({ premium: prior!.premium, effective_date: prior!.start, expiration_date: prior!.end }, d))
    : proRataReturn(policy, d));
  const [date, setDate] = useState(initialDate);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [details, setDetails] = useState('');
  const [ret, setRet] = useState(String(returnFor(initialDate)));
  const [autoRet, setAutoRet] = useState(true);
  const r = parseAmount(ret);
  const inPrior = isPrior(date);
  const termPremium = inPrior ? cents(prior!.premium + Number(policy.premium)) : Number(policy.premium);
  const changeDate = (d: string) => { setDate(d); if (autoRet && d) setRet(String(returnFor(d))); };
  return (
    <TxModal title="Cancel policy" subtitle={sub(policy)} confirmLabel="Cancel policy" danger onClose={onClose} run={async () => {
      need(date, 'Enter the cancellation effective date.');
      need(date >= min && date <= policy.expiration_date, `Cancellation date must fall within ${rangeMsg}.`);
      need(reason !== 'Other' || details.trim(), 'Describe the reason for cancellation.');
      need(r !== null && r >= 0, 'Enter a valid return premium (0 or more).');
      need(r! <= termPremium, inPrior ? 'Return premium cannot exceed the prior-term plus renewal premium.' : 'Return premium cannot exceed the term premium.');
      const desc = `Cancelled effective ${fmtDate(date)} — ${reason}${details.trim() ? `: ${details.trim()}` : ''}. Return premium ${fmtMoney(r!, true)}.${inPrior ? ` Renewal term from ${fmtDate(policy.effective_date)} not taken.` : ''}`;
      await addTransaction(policy, 'Cancellation', date, -r!, desc);
      // The row's premium becomes the earned premium, so commission figures follow the return. A
      // prior-term cancellation also rolls the row back to that term, since the renewal never starts.
      const earned = cents(termPremium - r!);
      await db.update('policies', policy.id, inPrior
        ? { status: 'Cancelled', premium: earned, effective_date: prior!.start, expiration_date: prior!.end, term_months: monthsBetween(prior!.start, prior!.end) }
        : { status: 'Cancelled', premium: earned });
      const credited = await creditOpenInvoices(policy.id, r!);
      await log(`Policy cancelled — ${policy.policy_number}`, `${desc}${credited ? ` ${fmtMoney(credited, true)} credited to open invoices.` : ''}`);
      try { await enqueueAutomation('Policy Cancelled', { account_id: policy.account_id, policy_id: policy.id, line: policy.line_of_business }); } catch { /* automations never block the cancellation */ }
      return credited ? `Policy cancelled · ${fmtMoney(credited, true)} credited to open invoices` : 'Policy cancelled';
    }}>
      <Summary items={[['Term', inPrior ? `${fmtDate(prior!.start)} – ${fmtDate(prior!.end)} + renewal` : `${fmtDate(policy.effective_date)} – ${fmtDate(policy.expiration_date)}`], ['Term premium', fmtMoney(termPremium, true)], ['Pro-rata return', fmtMoney(date ? returnFor(date) : 0, true)], ['Earned', fmtMoney(termPremium - (r ?? 0), true)]]} />
      <div className="text-[12px] text-ink-500">The return premium is credited to this policy's open invoices (fully unpaid invoices it covers are voided).</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Cancellation date" required><Input type="date" value={date} min={min} max={policy.expiration_date} onChange={(e) => changeDate(e.target.value)} /></Field>
        <Field label="Reason" required><Select value={reason} onChange={(e) => setReason(e.target.value)} options={CANCEL_REASONS} /></Field>
        <Field label="Return premium" required hint={autoRet ? 'Pro-rata, recalculated with the date' : 'Manually entered'}>
          <Input value={ret} inputMode="decimal" onChange={(e) => { setRet(e.target.value); setAutoRet(false); }} />
        </Field>
        <div className="flex items-end pb-1">
          <Button size="sm" variant="ghost" onClick={() => { setAutoRet(true); setRet(String(returnFor(date))); }}>Use pro-rata</Button>
        </div>
        <Field label="Details" required={reason === 'Other'} className="sm:col-span-2"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Optional notes" /></Field>
      </div>
    </TxModal>
  );
}

// ── Reinstate ──

function ReinstateModal({ policy, onClose, lastCancel, txns = [] }: Props & { lastCancel?: PolicyTransaction }) {
  const log = useLog(policy);
  const { min, rangeMsg } = termFloor(policy, txns);
  const [date, setDate] = useState(lastCancel?.effective_date ?? today());
  const [amount, setAmount] = useState(String(lastCancel ? Math.abs(Number(lastCancel.premium_change)) : 0));
  const [notes, setNotes] = useState('');
  const [invoice, setInvoice] = useState(policy.billing_type === 'Agency Bill');
  const a = parseAmount(amount);
  return (
    <TxModal title="Reinstate policy" subtitle={sub(policy)} confirmLabel="Reinstate" onClose={onClose} run={async () => {
      need(date, 'Enter the reinstatement date.');
      need(date >= min && date <= policy.expiration_date, `Reinstatement date must fall within ${rangeMsg}.`);
      need(a !== null && a >= 0, 'Enter the premium reinstated (0 or more).');
      const desc = `Reinstated effective ${fmtDate(date)}${lastCancel ? ` (cancellation of ${fmtDate(lastCancel.effective_date)} rescinded)` : ''}${notes.trim() ? ` — ${notes.trim()}` : ''}`;
      await addTransaction(policy, 'Reinstatement', date, a!, desc);
      // Mirrors the cancellation, which reduced the row's premium to the earned premium.
      await db.update('policies', policy.id, { status: 'Active', premium: cents(Number(policy.premium) + a!) });
      if (invoice && a! > 0) await createInvoice({ account_id: policy.account_id, policy_id: policy.id, amount: a!, description: `Reinstated premium — ${policy.policy_number}`, due_date: date });
      await log(`Policy reinstated — ${policy.policy_number}`, desc);
      return 'Policy reinstated';
    }}>
      <div className="text-[13px] text-ink-600">The policy will return to <b>Active</b> status for the remainder of its term ending {fmtDate(policy.expiration_date)}.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Reinstatement date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Premium reinstated" hint={lastCancel ? 'Defaults to the return premium at cancellation' : undefined}><Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      </div>
      <Checkbox label="Invoice the reinstated premium" checked={invoice && (a ?? 0) > 0} disabled={(a ?? 0) <= 0} onChange={setInvoice} />
    </TxModal>
  );
}

// ── Non-Renew ──

function NonRenewModal({ policy, onClose }: Props) {
  const log = useLog(policy);
  const [by, setBy] = useState('Carrier');
  const [reason, setReason] = useState('');
  return (
    <TxModal title="Non-renew policy" subtitle={sub(policy)} confirmLabel="Mark non-renewed" danger onClose={onClose} run={async () => {
      need(reason.trim(), 'Enter the non-renewal reason.');
      const desc = `Non-renewal (${by.toLowerCase()} initiated) effective ${fmtDate(policy.expiration_date)} — ${reason.trim()}`;
      await addTransaction(policy, 'Cancellation', policy.expiration_date, 0, desc);
      await db.update('policies', policy.id, { status: 'Non-Renewed' });
      await log(`Policy non-renewed — ${policy.policy_number}`, desc);
      return 'Policy marked non-renewed';
    }}>
      <div className="text-[13px] text-ink-600">Coverage remains in force until the expiration date <b>{fmtDate(policy.expiration_date)}</b>, then will not renew. Consider remarketing the account.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Initiated by"><Select value={by} onChange={(e) => setBy(e.target.value)} options={['Carrier', 'Insured', 'Agency']} /></Field>
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Carrier exiting the market; loss history" /></Field>
      </div>
    </TxModal>
  );
}

// ── Audit ──

function AuditModal({ policy, onClose }: Props) {
  const log = useLog(policy);
  const [date, setDate] = useState(today());
  const [adj, setAdj] = useState('');
  const [basis, setBasis] = useState('');
  const [invoice, setInvoice] = useState(false);
  const a = parseAmount(adj);
  const newPremium = cents(Number(policy.premium) + (a ?? 0));
  return (
    <TxModal title="Premium audit" subtitle={sub(policy)} confirmLabel="Record audit" onClose={onClose} run={async () => {
      need(date, 'Enter the audit date.');
      need(a !== null, 'Enter the audit premium adjustment (additional or return).');
      need(newPremium >= 0, 'Adjusted premium cannot go below zero.');
      const desc = `Audit adjustment ${signedMoney(a!, fmtMoney)}${basis.trim() ? ` — ${basis.trim()}` : ''}`;
      await addTransaction(policy, 'Audit', date, a!, desc);
      await db.update('policies', policy.id, { premium: newPremium });
      if (invoice && a! > 0) await createInvoice({ account_id: policy.account_id, policy_id: policy.id, amount: a!, description: `Audit additional premium — ${policy.policy_number}`, due_date: date });
      await log(`Premium audit recorded — ${policy.policy_number}`, desc);
      return 'Audit recorded';
    }}>
      <Summary items={[['Current premium', fmtMoney(policy.premium, true)], ['Adjustment', a === null ? '—' : signedMoney(a, fmtMoney)], ['Audited premium', fmtMoney(newPremium, true)], ['Term', `${fmtDate(policy.effective_date)} – ${fmtDate(policy.expiration_date)}`]]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Audit date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Premium adjustment (±)" required hint="Positive = additional premium; negative = return"><Input value={adj} inputMode="decimal" placeholder="e.g. 450 or -200" onChange={(e) => setAdj(e.target.value)} /></Field>
        <Field label="Audit basis" className="sm:col-span-2"><Textarea value={basis} onChange={(e) => setBasis(e.target.value)} rows={2} placeholder="e.g. Final payroll $412,000 vs. estimated $380,000" /></Field>
      </div>
      <Checkbox label="Invoice the additional premium" checked={invoice && (a ?? 0) > 0} disabled={(a ?? 0) <= 0} onChange={setInvoice} />
    </TxModal>
  );
}

export function TransactionModal({ kind, policy, onClose, lastCancel, txns }: Props & { kind: TxKind; lastCancel?: PolicyTransaction }) {
  switch (kind) {
    case 'endorse': return <EndorseModal policy={policy} onClose={onClose} txns={txns} />;
    case 'renew': return <RenewModal policy={policy} onClose={onClose} />;
    case 'cancel': return <CancelModal policy={policy} onClose={onClose} txns={txns} />;
    case 'reinstate': return <ReinstateModal policy={policy} onClose={onClose} lastCancel={lastCancel} txns={txns} />;
    case 'nonrenew': return <NonRenewModal policy={policy} onClose={onClose} />;
    case 'audit': return <AuditModal policy={policy} onClose={onClose} />;
  }
}
