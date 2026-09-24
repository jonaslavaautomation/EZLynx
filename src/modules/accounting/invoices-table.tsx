import { Ban, DollarSign, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, DataTable, Menu, StatusBadge, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtDate, fmtMoney } from '@/lib/format';
import { href } from '@/lib/router';
import type { Account, Invoice, Policy } from '@/lib/types';
import { InvoiceFormModal, PaymentModal } from './modals';
import { balanceOf, daysPastDue, isOpen, printInvoice } from './shared';

/** Invoices table with row actions: Record Payment, Edit, Print, Void, Delete. */
export function InvoicesTable({ rows, accountsById, policiesById, showAccount = true, loading, empty }: {
  rows: Invoice[];
  accountsById: Map<string, Account>;
  policiesById: Map<string, Policy>;
  showAccount?: boolean;
  loading?: boolean;
  empty?: ReactNode;
}) {
  const { toast, confirm } = useFeedback();
  const { settings, me } = useAppData();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);

  const voidInvoice = async (inv: Invoice) => {
    const ok = await confirm({
      title: `Void invoice ${inv.invoice_number}?`,
      message: Number(inv.amount_paid) > 0
        ? `${fmtMoney(inv.amount_paid, true)} has been paid on this invoice. Voiding keeps the payment record but removes the remaining balance from receivables.`
        : 'The invoice stays on file for reference but no longer counts toward receivables.',
      confirmLabel: 'Void invoice', danger: true,
    });
    if (!ok) return;
    try {
      await db.update('invoices', inv.id, { status: 'Void' });
      await logActivity({ account_id: inv.account_id, policy_id: inv.policy_id, subject: `Invoice ${inv.invoice_number} voided`, assigned_to: me?.name ?? null });
      toast(`Invoice ${inv.invoice_number} voided`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const remove = async (inv: Invoice) => {
    const ok = await confirm({ title: `Delete invoice ${inv.invoice_number}?`, message: 'This permanently removes the invoice and its payment history. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await db.remove('invoices', inv.id);
      toast(`Invoice ${inv.invoice_number} deleted`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const print = (inv: Invoice) => {
    if (!printInvoice(inv, accountsById.get(inv.account_id) ?? null, inv.policy_id ? policiesById.get(inv.policy_id) ?? null : null, settings)) {
      toast('Your browser blocked the print window. Allow pop-ups for this site and try again.', 'error');
    }
  };

  const columns: Column<Invoice>[] = [
    { key: 'num', header: 'Invoice #', sortValue: (r) => r.invoice_number, render: (r) => <span className="font-semibold text-ink-900">{r.invoice_number}</span> },
    ...(showAccount ? [{
      key: 'account', header: 'Account', sortValue: (r: Invoice) => accountName(accountsById.get(r.account_id)),
      render: (r: Invoice) => <a href={href(`/accounts/${r.account_id}`)} onClick={(e) => e.stopPropagation()} className="hover:underline">{accountName(accountsById.get(r.account_id))}</a>,
    }] : []),
    {
      key: 'desc', header: 'Description', className: 'max-w-[260px]',
      render: (r) => {
        const p = r.policy_id ? policiesById.get(r.policy_id) : null;
        return (
          <div className="min-w-0">
            <div className="truncate">{r.description || '—'}</div>
            {p && <a href={href(`/policies/${p.id}`)} onClick={(e) => e.stopPropagation()} className="text-xs hover:underline">{p.policy_number}</a>}
          </div>
        );
      },
    },
    {
      key: 'due', header: 'Due', sortValue: (r) => r.due_date,
      render: (r) => {
        const d = daysPastDue(r);
        return <div className="whitespace-nowrap">{fmtDate(r.due_date)}{d > 0 && <div className="text-[11px] text-red-600 font-semibold">{d} days past due</div>}</div>;
      },
    },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => Number(r.amount), render: (r) => <span className="tabular-nums">{fmtMoney(r.amount, true)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', sortValue: (r) => Number(r.amount_paid), render: (r) => <span className="tabular-nums text-ink-500">{fmtMoney(r.amount_paid, true)}</span> },
    { key: 'bal', header: 'Balance', align: 'right', sortValue: (r) => balanceOf(r), render: (r) => <span className="tabular-nums font-semibold">{fmtMoney(balanceOf(r), true)}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <div className="flex gap-1"><StatusBadge status={r.status} />{daysPastDue(r) > 0 && <Badge tone="red">Overdue</Badge>}</div> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <Menu items={[
          { label: 'Record payment', icon: <DollarSign size={14} />, onClick: () => setPaying(r), disabled: !isOpen(r) },
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(r), disabled: r.status === 'Void' },
          { label: 'Print invoice', icon: <Printer size={14} />, onClick: () => print(r) },
          'divider',
          { label: 'Void', icon: <Ban size={14} />, onClick: () => voidInvoice(r), disabled: r.status === 'Void' || r.status === 'Paid', danger: true },
          { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => remove(r), danger: true },
        ]} />
      ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} loading={loading} empty={empty} initialSort={{ key: 'due', dir: 'desc' }} />
      {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} />}
      {editing && <InvoiceFormModal invoice={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
