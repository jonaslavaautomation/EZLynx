import { useState } from 'react';
import { AccountPicker, PolicySelect } from '@/components/pickers';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, useFeedback, useForm } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { addDays, fmtDate, fmtMoney, today } from '@/lib/format';
import type { Claim, ClaimStatus } from '@/lib/types';
import { enqueueAutomation } from '@/modules/admin/automation-engine';
import { CLAIM_STATUSES, LOSS_TYPES, claimLabel } from './constants';

type FormValues = {
  account_id: string | null;
  policy_id: string | null;
  claim_number: string;
  date_of_loss: string;
  reported_date: string;
  loss_type: string;
  description: string;
  status: ClaimStatus;
  amount_reserved: string;
  amount_paid: string;
  adjuster_name: string;
  adjuster_phone: string;
};

/**
 * Why the loss date isn't covered by the policy, or null. Policies renew in place, so any earlier term on
 * the transaction history counts (from the first new business / renewal / rewrite on file); a loss on or
 * after the cancellation date of a cancelled policy isn't covered.
 */
async function coverageProblem(policyId: string, dateOfLoss: string) {
  const [p, txns] = await Promise.all([db.get('policies', policyId), db.list('policy_transactions', { eq: { policy_id: policyId } })]);
  if (!p) return null;
  const starts = txns.filter((t) => t.type === 'New Business' || t.type === 'Renewal' || t.type === 'Rewrite').map((t) => t.effective_date);
  const first = [p.effective_date, ...starts].sort()[0];
  if (dateOfLoss < first || dateOfLoss > p.expiration_date) return `Loss date is outside policy ${p.policy_number}'s coverage (${fmtDate(first)} – ${fmtDate(p.expiration_date)})`;
  const cancel = txns.filter((t) => t.type === 'Cancellation' && !t.description?.startsWith('Non-renewal')).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (p.status === 'Cancelled' && cancel && dateOfLoss >= cancel.effective_date) return `Policy ${p.policy_number} was cancelled effective ${fmtDate(cancel.effective_date)}, before this loss`;
  return null;
}

const money = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')));

/** First Notice of Loss (create) or claim edit form. */
export function ClaimFormModal({ claim, accountId, onClose, onSaved }: { claim?: Claim | null; accountId?: string; onClose: () => void; onSaved?: (c: Claim) => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const fixedAccount = !!accountId && !claim;
  const [v, set] = useForm<FormValues>({
    account_id: claim?.account_id ?? accountId ?? null,
    policy_id: claim?.policy_id ?? null,
    claim_number: claim?.claim_number ?? '',
    date_of_loss: claim?.date_of_loss ?? '',
    reported_date: claim ? claim.reported_date ?? '' : today(),
    loss_type: claim?.loss_type ?? '',
    description: claim?.description ?? '',
    status: claim?.status ?? 'Open',
    amount_reserved: claim?.amount_reserved != null ? String(claim.amount_reserved) : '',
    amount_paid: claim?.amount_paid != null ? String(claim.amount_paid) : '',
    adjuster_name: claim?.adjuster_name ?? '',
    adjuster_phone: claim?.adjuster_phone ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return; // Enter-to-submit bypasses the loading button
    const t = today();
    const errs: typeof errors = {};
    if (!v.account_id) errs.account_id = 'Choose the insured account';
    if (!v.date_of_loss) errs.date_of_loss = 'Date of loss is required';
    else if (v.date_of_loss > t) errs.date_of_loss = 'Date of loss cannot be in the future';
    if (v.reported_date) {
      if (v.reported_date > t) errs.reported_date = 'Reported date cannot be in the future';
      else if (v.date_of_loss && v.reported_date < v.date_of_loss) errs.reported_date = 'Reported date must be on or after the loss date';
    }
    if (!v.loss_type) errs.loss_type = 'Choose a loss type';
    const reserved = money(v.amount_reserved);
    const paid = money(v.amount_paid);
    if (reserved !== null && (!Number.isFinite(reserved) || reserved < 0)) errs.amount_reserved = 'Enter a valid amount';
    if (paid !== null && (!Number.isFinite(paid) || paid < 0)) errs.amount_paid = 'Enter a valid amount';
    if (v.adjuster_phone && v.adjuster_phone.replace(/\D/g, '').length < 7) errs.adjuster_phone = 'Enter a valid phone number';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setError(null);
    try {
      // Only checked when the loss date / policy is new or changed, so older claims stay editable.
      if (v.policy_id && (!claim || claim.policy_id !== v.policy_id || claim.date_of_loss !== v.date_of_loss)) {
        const problem = await coverageProblem(v.policy_id, v.date_of_loss);
        if (problem) { setErrors({ date_of_loss: problem }); return; }
      }
      const values: Partial<Claim> = {
        account_id: v.account_id!,
        policy_id: v.policy_id,
        claim_number: v.claim_number.trim() || null,
        date_of_loss: v.date_of_loss,
        reported_date: v.reported_date || null,
        loss_type: v.loss_type,
        description: v.description.trim() || null,
        status: v.status,
        amount_reserved: reserved,
        amount_paid: paid,
        adjuster_name: v.adjuster_name.trim() || null,
        adjuster_phone: v.adjuster_phone.trim() || null,
      };
      let saved: Claim;
      if (claim) {
        saved = await db.update('claims', claim.id, values);
        if (claim.status !== saved.status) {
          await logActivity({ subject: `Claim ${claimLabel(saved)} status changed: ${claim.status} → ${saved.status}`, account_id: saved.account_id, policy_id: saved.policy_id, assigned_to: me?.name ?? null });
        }
        toast('Claim updated');
      } else {
        saved = await db.insert('claims', values);
        const ref = saved.claim_number ? `#${saved.claim_number}` : `${saved.loss_type} loss of ${fmtDate(saved.date_of_loss)}`;
        // The claim is saved at this point; a failure below must not keep the form open (a retry would duplicate the claim).
        try {
          await logActivity({
            subject: `Claim reported: ${saved.loss_type} loss on ${fmtDate(saved.date_of_loss)}${saved.claim_number ? ` (#${saved.claim_number})` : ''}`,
            description: [saved.description, saved.amount_reserved != null ? `Reserve: ${fmtMoney(saved.amount_reserved)}` : null, saved.adjuster_name ? `Adjuster: ${saved.adjuster_name}${saved.adjuster_phone ? ` ${saved.adjuster_phone}` : ''}` : null].filter(Boolean).join('\n') || null,
            account_id: saved.account_id,
            policy_id: saved.policy_id,
            assigned_to: me?.name ?? null,
          });
          await db.insert('activities', {
            type: 'Follow-up',
            subject: `Follow up with adjuster on claim ${ref}`,
            description: saved.adjuster_name ? `Adjuster: ${saved.adjuster_name}${saved.adjuster_phone ? ` · ${saved.adjuster_phone}` : ''}` : null,
            account_id: saved.account_id,
            policy_id: saved.policy_id,
            due_date: addDays(today(), 3),
            priority: 'Normal',
            status: 'Open',
            assigned_to: me?.name ?? null,
            completed_at: null,
          });
          toast('Claim reported — follow-up task created');
        } catch (e) {
          toast(`Claim reported, but the follow-up task could not be created: ${(e as Error).message}`, 'error');
        }
        try { await enqueueAutomation('Claim Reported', { account_id: saved.account_id, policy_id: saved.policy_id }); } catch { /* automations never block saving */ }
      }
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={claim ? 'Edit Claim' : 'Report Claim'}
      subtitle={claim ? undefined : 'First Notice of Loss'}
      size="lg"
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{claim ? 'Save Changes' : 'Report Claim'}</Button>
      </>}
    >
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <ErrorBanner message={error} />
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2">Insured & Policy</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Account" required error={errors.account_id}>
              <AccountPicker value={v.account_id} disabled={fixedAccount} onChange={(id) => { set('account_id')(id); set('policy_id')(null); }} />
            </Field>
            <Field label="Policy">
              <PolicySelect accountId={v.account_id} value={v.policy_id} onChange={set('policy_id')} />
            </Field>
            <Field label="Claim Number" hint="Carrier-assigned; add later if not yet known.">
              <Input value={v.claim_number} onChange={(e) => set('claim_number')(e.target.value)} placeholder="e.g. CLM-482913" />
            </Field>
            <Field label="Status">
              <Select value={v.status} onChange={(e) => set('status')(e.target.value as ClaimStatus)} options={CLAIM_STATUSES} />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2">Loss Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Date of Loss" required error={errors.date_of_loss}>
              <Input type="date" max={today()} value={v.date_of_loss} onChange={(e) => set('date_of_loss')(e.target.value)} />
            </Field>
            <Field label="Reported Date" error={errors.reported_date}>
              <Input type="date" max={today()} value={v.reported_date} onChange={(e) => set('reported_date')(e.target.value)} />
            </Field>
            <Field label="Loss Type" required error={errors.loss_type}>
              <Select value={v.loss_type} onChange={(e) => set('loss_type')(e.target.value)} placeholder="Select…" options={LOSS_TYPES.includes(v.loss_type) || !v.loss_type ? LOSS_TYPES : [v.loss_type, ...LOSS_TYPES]} />
            </Field>
            <Field label="Description" className="sm:col-span-3">
              <Textarea rows={3} value={v.description} onChange={(e) => set('description')(e.target.value)} placeholder="What happened, where, who was involved, damages…" />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2">Financials & Adjuster</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Amount Reserved" error={errors.amount_reserved}>
              <Input inputMode="decimal" value={v.amount_reserved} onChange={(e) => set('amount_reserved')(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Amount Paid" error={errors.amount_paid}>
              <Input inputMode="decimal" value={v.amount_paid} onChange={(e) => set('amount_paid')(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Adjuster Name">
              <Input value={v.adjuster_name} onChange={(e) => set('adjuster_name')(e.target.value)} />
            </Field>
            <Field label="Adjuster Phone" error={errors.adjuster_phone}>
              <Input type="tel" value={v.adjuster_phone} onChange={(e) => set('adjuster_phone')(e.target.value)} placeholder="(800) 555-0100" />
            </Field>
          </div>
        </section>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}
