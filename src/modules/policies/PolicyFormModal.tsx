import { Wand2 } from 'lucide-react';
import { useState } from 'react';
import { AccountPicker, CarrierSelect, StaffSelect } from '@/components/pickers';
import { Button, ErrorBanner, Field, IconButton, Input, Modal, Select, Textarea, useFeedback, useForm } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { createPolicy, generatePolicyNumber, logActivity } from '@/lib/domain';
import { addMonths, fmtMoney, today } from '@/lib/format';
import { LINES_OF_BUSINESS, type LineOfBusiness, type Policy, type PolicyStatus } from '@/lib/types';
import { useLineSettings } from '@/modules/admin/integration';
import { CoverageEditor } from './coverages';
import { BILLING_TYPES, PAYMENT_PLANS, POLICY_STATUSES, TERM_OPTIONS, defaultCoverages, fromDrafts, parseAmount, toDrafts, type CoverageDraft } from './shared';

type FormValues = {
  account_id: string | null;
  line_of_business: LineOfBusiness;
  carrier: string;
  policy_number: string;
  status: PolicyStatus;
  effective_date: string;
  term_months: string;
  expiration_date: string;
  premium: string;
  commission_rate: string;
  billing_type: Policy['billing_type'];
  payment_plan: string;
  producer: string | null;
  notes: string;
};

type Errors = Partial<Record<keyof FormValues, string>>;

/** Create or edit a policy. `accountId` fixes the account (null lets the user pick one). */
export function PolicyFormModal({ accountId, policy, onClose, onSaved }: { accountId: string | null; policy?: Policy; onClose: () => void; onSaved?: (p: Policy) => void }) {
  const { carriers, me } = useAppData();
  const { toast } = useFeedback();
  const editing = !!policy;
  const initialLine: LineOfBusiness = policy?.line_of_business ?? 'Personal Auto';
  const start = policy?.effective_date ?? today();

  const [v, set, setAll] = useForm<FormValues>({
    account_id: policy?.account_id ?? accountId,
    line_of_business: initialLine,
    carrier: policy?.carrier ?? '',
    policy_number: policy?.policy_number ?? '',
    status: policy?.status ?? 'Active',
    effective_date: start,
    term_months: String(policy?.term_months ?? 12),
    expiration_date: policy?.expiration_date ?? addMonths(start, 12),
    premium: policy ? String(policy.premium) : '',
    commission_rate: policy ? String(policy.commission_rate) : '',
    billing_type: policy?.billing_type ?? 'Direct Bill',
    payment_plan: policy?.payment_plan ?? 'Paid in Full',
    producer: policy?.producer ?? me?.name ?? null,
    notes: policy?.notes ?? '',
  });
  const [coverages, setCoverages] = useState<CoverageDraft[]>(() => toDrafts(policy ? policy.coverages : defaultCoverages(initialLine)));
  const [coveragesTouched, setCoveragesTouched] = useState(editing);
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carrierRate = (name: string) => carriers.find((c) => c.name === name)?.commission_rate;
  const lineSettings = useLineSettings();
  const lineOptions = lineSettings.filter(LINES_OF_BUSINESS, v.line_of_business);

  const changeLine = (line: LineOfBusiness) => {
    const carrierWritesLine = carriers.find((c) => c.name === v.carrier)?.lines.includes(line) ?? false;
    // New policies take the line's default term (Settings → Manage Lines of Business).
    const term = editing ? null : String(lineSettings.defaultTerm(line));
    setAll((s) => ({
      ...s, line_of_business: line, carrier: carrierWritesLine ? s.carrier : '',
      ...(term ? { term_months: term, expiration_date: s.effective_date ? addMonths(s.effective_date, Number(term)) : s.expiration_date } : {}),
    }));
    if (!coveragesTouched) setCoverages(toDrafts(defaultCoverages(line)));
  };

  const changeCarrier = (name: string) => {
    const rate = carrierRate(name);
    setAll((s) => ({ ...s, carrier: name, commission_rate: rate !== undefined ? String(rate) : s.commission_rate }));
  };

  const changeEffective = (date: string) => setAll((s) => ({ ...s, effective_date: date, expiration_date: date ? addMonths(date, Number(s.term_months) || 12) : s.expiration_date }));
  const changeTerm = (term: string) => setAll((s) => ({ ...s, term_months: term, expiration_date: s.effective_date ? addMonths(s.effective_date, Number(term)) : s.expiration_date }));

  const premiumNum = parseAmount(v.premium);
  const rateNum = parseAmount(v.commission_rate);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!v.account_id) e.account_id = 'Choose an account';
    if (!v.line_of_business) e.line_of_business = 'Required';
    if (!v.carrier) e.carrier = 'Choose a carrier';
    if (!v.effective_date) e.effective_date = 'Required';
    if (!v.expiration_date) e.expiration_date = 'Required';
    else if (v.effective_date && v.expiration_date <= v.effective_date) e.expiration_date = 'Must be after the effective date';
    if (premiumNum === null) e.premium = 'Enter the term premium';
    else if (premiumNum < 0) e.premium = 'Premium cannot be negative';
    if (rateNum === null) e.commission_rate = 'Required';
    else if (rateNum < 0 || rateNum > 100) e.commission_rate = 'Between 0 and 100';
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    const cov = fromDrafts(coverages);
    if (Object.keys(e).length) { setSaveError('Please fix the highlighted fields.'); return; }
    if (cov.error) { setSaveError(cov.error); return; }
    setSaveError(null);
    setBusy(true);
    try {
      const common = {
        line_of_business: v.line_of_business,
        carrier: v.carrier,
        status: v.status,
        effective_date: v.effective_date,
        expiration_date: v.expiration_date,
        term_months: Number(v.term_months),
        premium: premiumNum!,
        commission_rate: rateNum!,
        billing_type: v.billing_type,
        payment_plan: v.payment_plan || null,
        producer: v.producer,
        notes: v.notes.trim() || null,
        coverages: cov.coverages,
      };
      let saved: Policy;
      if (policy) {
        saved = await db.update('policies', policy.id, { ...common, policy_number: v.policy_number.trim() || policy.policy_number });
        toast(`Policy ${saved.policy_number} updated`);
      } else {
        saved = await createPolicy({ ...common, account_id: v.account_id!, source: 'Manual', policy_number: v.policy_number.trim() || undefined });
        await logActivity({
          subject: `New ${saved.line_of_business} policy added — ${saved.policy_number}`,
          description: `${saved.carrier} · ${fmtMoney(saved.premium)} · effective ${saved.effective_date}`,
          account_id: saved.account_id, policy_id: saved.id, assigned_to: me?.name ?? null,
        });
        toast(`Policy ${saved.policy_number} created`);
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit policy ${policy!.policy_number}` : 'New policy'}
      subtitle={editing ? `${policy!.line_of_business} · ${policy!.carrier}` : 'Add an in-force or pending policy to the book of business'}
      onClose={onClose}
      size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save changes' : 'Create policy'}</Button>
      </>}
    >
      <div className="space-y-4">
        <ErrorBanner message={saveError} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Account" required error={errors.account_id} className="sm:col-span-2">
            <AccountPicker value={v.account_id} onChange={(id) => set('account_id')(id)} disabled={editing || !!accountId} />
          </Field>
          <Field label="Line of business" required error={errors.line_of_business}>
            <Select value={v.line_of_business} onChange={(e) => changeLine(e.target.value as LineOfBusiness)} options={lineOptions} />
          </Field>
          <Field label="Carrier" required error={errors.carrier} hint={v.line_of_business ? `Appointed carriers writing ${v.line_of_business}` : undefined}>
            <CarrierSelect value={v.carrier} onChange={changeCarrier} line={v.line_of_business} />
          </Field>
          <Field label="Policy number" hint={editing ? undefined : 'Leave blank to auto-generate'}>
            <div className="flex gap-1">
              <Input value={v.policy_number} onChange={(e) => set('policy_number')(e.target.value)} placeholder={editing ? '' : 'Auto'} />
              <IconButton label="Generate policy number" className="h-9 w-9 border border-ink-200" onClick={() => set('policy_number')(generatePolicyNumber(v.line_of_business))}><Wand2 size={15} /></IconButton>
            </div>
          </Field>
          <Field label="Status" required>
            <Select value={v.status} onChange={(e) => set('status')(e.target.value as PolicyStatus)} options={POLICY_STATUSES} />
          </Field>
          <Field label="Effective date" required error={errors.effective_date}>
            <Input type="date" value={v.effective_date} onChange={(e) => changeEffective(e.target.value)} />
          </Field>
          <Field label="Term">
            <Select value={v.term_months} onChange={(e) => changeTerm(e.target.value)} options={TERM_OPTIONS} />
          </Field>
          <Field label="Expiration date" required error={errors.expiration_date} hint="Calculated from effective date + term">
            <Input type="date" value={v.expiration_date} onChange={(e) => set('expiration_date')(e.target.value)} />
          </Field>
          <Field label="Term premium" required error={errors.premium}>
            <Input value={v.premium} inputMode="decimal" placeholder="0.00" onChange={(e) => set('premium')(e.target.value)} />
          </Field>
          <Field label="Commission %" required error={errors.commission_rate} hint={premiumNum !== null && rateNum !== null ? `Est. commission ${fmtMoney((premiumNum * rateNum) / 100, true)}` : undefined}>
            <Input value={v.commission_rate} inputMode="decimal" placeholder="e.g. 12" onChange={(e) => set('commission_rate')(e.target.value)} />
          </Field>
          <Field label="Billing type">
            <Select value={v.billing_type} onChange={(e) => set('billing_type')(e.target.value as Policy['billing_type'])} options={BILLING_TYPES} />
          </Field>
          <Field label="Payment plan">
            <Select value={v.payment_plan} onChange={(e) => set('payment_plan')(e.target.value)} options={PAYMENT_PLANS.includes(v.payment_plan) || !v.payment_plan ? PAYMENT_PLANS : [v.payment_plan, ...PAYMENT_PLANS]} />
          </Field>
          <Field label="Producer">
            <StaffSelect value={v.producer} onChange={set('producer')} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={v.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} placeholder="Internal notes about this policy" />
          </Field>
        </div>
        {!editing && v.billing_type === 'Agency Bill' && (
          <div className="text-xs text-ink-500 bg-brand-50 border border-brand-100 rounded px-3 py-2">An invoice for the term premium will be created automatically for Agency Bill policies.</div>
        )}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Coverages</div>
          <CoverageEditor rows={coverages} onChange={(rows) => { setCoverages(rows); setCoveragesTouched(true); }} />
        </div>
      </div>
    </Modal>
  );
}
