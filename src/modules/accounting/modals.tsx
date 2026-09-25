import { useEffect, useState } from 'react';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, useFeedback, useForm } from '@/components/ui';
import { AccountPicker, PolicySelect } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { createInvoice, generateNumber, logActivity } from '@/lib/domain';
import { fmtDate, fmtMoney, today } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { PAYMENT_METHODS, balanceOf, isOpen, round2, statusFor } from './shared';

/** Create or edit an invoice. `accountId` locks the account (e.g. from the account billing tab). */
export function InvoiceFormModal({ invoice, accountId, policyId, onClose, onSaved }: {
  invoice?: Invoice | null;
  accountId?: string | null;
  policyId?: string | null;
  onClose: () => void;
  onSaved?: (inv: Invoice) => void;
}) {
  const { toast } = useFeedback();
  const editing = !!invoice;
  const [v, set] = useForm({
    account_id: invoice?.account_id ?? accountId ?? null as string | null,
    policy_id: invoice?.policy_id ?? policyId ?? null as string | null,
    invoice_number: invoice?.invoice_number ?? generateNumber('INV'),
    description: invoice?.description ?? '',
    amount: invoice ? String(invoice.amount) : '',
    due_date: invoice?.due_date ?? today(),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill amount/description from the chosen policy for new invoices.
  useEffect(() => {
    if (editing || !v.policy_id) return;
    let live = true;
    db.get('policies', v.policy_id).then((p) => {
      if (!live || !p) return;
      if (!v.amount) set('amount')(String(p.premium));
      if (!v.description) set('description')(`${p.line_of_business} premium — ${p.policy_number}`);
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.policy_id]);

  const save = async () => {
    const e: Record<string, string> = {};
    const amount = round2(Number(v.amount));
    if (!v.account_id) e.account_id = 'Choose an account';
    if (!v.invoice_number.trim()) e.invoice_number = 'Required';
    if (!v.amount || !(amount > 0)) e.amount = 'Enter an amount greater than 0';
    if (invoice && amount < Number(invoice.amount_paid)) e.amount = `Can't be less than the ${fmtMoney(invoice.amount_paid, true)} already paid`;
    if (!v.due_date) e.due_date = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      const values = {
        account_id: v.account_id!, policy_id: v.policy_id, invoice_number: v.invoice_number.trim(),
        description: v.description.trim() || null, amount, due_date: v.due_date,
      };
      let saved: Invoice;
      if (invoice) {
        saved = await db.update('invoices', invoice.id, { ...values, status: statusFor(amount, Number(invoice.amount_paid), invoice.status) });
        toast(`Invoice ${saved.invoice_number} updated`);
      } else {
        saved = await createInvoice(values);
        toast(`Invoice ${saved.invoice_number} created`);
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit invoice ${invoice!.invoice_number}` : 'New invoice'}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create invoice'}</Button></>}
    >
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Account" required error={errors.account_id}>
          <AccountPicker value={v.account_id} disabled={!!accountId || editing} onChange={(id) => { set('account_id')(id); set('policy_id')(null); }} />
        </Field>
        <Field label="Policy" hint="Optional — link the invoice to a policy">
          <PolicySelect accountId={v.account_id} value={v.policy_id} onChange={set('policy_id')} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Invoice #" required error={errors.invoice_number}>
            <Input value={v.invoice_number} onChange={(e) => set('invoice_number')(e.target.value)} />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={v.amount} onChange={(e) => set('amount')(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Due date" required error={errors.due_date}>
            <Input type="date" value={v.due_date} onChange={(e) => set('due_date')(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={v.description} onChange={(e) => set('description')(e.target.value)} placeholder="e.g. Homeowners premium — HO-1234567" />
        </Field>
        {invoice && Number(invoice.amount_paid) > 0 && (
          <div className="text-xs text-ink-500">{fmtMoney(invoice.amount_paid, true)} has already been paid on this invoice.</div>
        )}
      </div>
    </Modal>
  );
}

/** Record a payment against an invoice. Pass `invoice`, or `invoices` to let the user choose among open ones. */
export function PaymentModal({ invoice, invoices, onClose, onSaved }: {
  invoice?: Invoice | null;
  invoices?: Invoice[];
  onClose: () => void;
  onSaved?: (inv: Invoice) => void;
}) {
  const { toast } = useFeedback();
  const { me } = useAppData();
  const choices = (invoices ?? []).filter(isOpen);
  const [invoiceId, setInvoiceId] = useState<string>(invoice?.id ?? choices[0]?.id ?? '');
  const current = invoice ?? choices.find((i) => i.id === invoiceId) ?? null;
  const balance = current ? balanceOf(current) : 0;
  const [amount, setAmount] = useState(balance ? balance.toFixed(2) : '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<string>('Check');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = choices.find((i) => i.id === id);
    setAmount(inv ? balanceOf(inv).toFixed(2) : '');
  };

  const save = async () => {
    const e: Record<string, string> = {};
    const amt = round2(Number(amount));
    if (!current) e.invoice = 'Choose an invoice';
    else if (!isOpen(current)) e.invoice = 'This invoice is not open';
    if (!(amt > 0)) e.amount = 'Enter an amount greater than 0';
    else if (amt > balance + 0.004) e.amount = `Can't exceed the balance of ${fmtMoney(balance, true)}`;
    if (!date) e.date = 'Required';
    if (!method) e.method = 'Required';
    setErrors(e);
    if (Object.keys(e).length || !current) return;
    setBusy(true);
    setError(null);
    try {
      const paid = round2(Number(current.amount_paid) + amt);
      const saved = await db.update('invoices', current.id, {
        amount_paid: paid, status: statusFor(Number(current.amount), paid), paid_date: date, payment_method: method,
      });
      await logActivity({
        account_id: current.account_id, policy_id: current.policy_id, subject: `Payment received ${fmtMoney(amt, true)}`,
        description: `${method} payment applied to invoice ${current.invoice_number} on ${fmtDate(date)}. Remaining balance ${fmtMoney(balanceOf(saved), true)}.`,
        assigned_to: me?.name ?? null,
      });
      toast(`Payment of ${fmtMoney(amt, true)} recorded`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record payment"
      subtitle={current ? `Invoice ${current.invoice_number} · balance ${fmtMoney(balance, true)}` : undefined}
      size="sm"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!current} onClick={save}>Record payment</Button></>}
    >
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!invoice && (
          choices.length ? (
            <Field label="Invoice" required error={errors.invoice}>
              <Select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} options={choices.map((i) => ({ value: i.id, label: `${i.invoice_number} · due ${fmtDate(i.due_date)} · ${fmtMoney(balanceOf(i), true)}` }))} />
            </Field>
          ) : <div className="text-[13px] text-ink-500">There are no open invoices to apply a payment to.</div>
        )}
        {errors.invoice && invoice && <ErrorBanner message={errors.invoice} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required error={errors.amount}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Payment date" required error={errors.date} hint={current && Number(current.amount_paid) > 0 ? "Becomes the invoice's last payment date" : undefined}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Method" required error={errors.method}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)} options={[...PAYMENT_METHODS]} />
        </Field>
        {current && balance > 0 && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAmount(balance.toFixed(2))}>Pay in full</Button>
            <Button size="sm" onClick={() => setAmount((balance / 2).toFixed(2))}>Half</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
