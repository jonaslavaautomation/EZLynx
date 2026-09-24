import { daysUntil, fmtDate, fmtMoney, accountName } from '@/lib/format';
import type { Account, AgencySettings, Invoice, InvoiceStatus, Policy } from '@/lib/types';

export const PAYMENT_METHODS = ['Check', 'ACH', 'Credit Card', 'Cash'] as const;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const balanceOf = (inv: Pick<Invoice, 'amount' | 'amount_paid' | 'status'>) =>
  inv.status === 'Void' ? 0 : Math.max(0, round2(Number(inv.amount) - Number(inv.amount_paid)));

export const isOpen = (inv: Pick<Invoice, 'status'>) => inv.status === 'Unpaid' || inv.status === 'Partial';

/** Days past due (0 when not yet due or not open). */
export function daysPastDue(inv: Pick<Invoice, 'due_date' | 'status'>) {
  if (!isOpen(inv)) return 0;
  const d = daysUntil(inv.due_date);
  return d === null ? 0 : Math.max(0, -d);
}

export const isOverdue = (inv: Pick<Invoice, 'due_date' | 'status'>) => daysPastDue(inv) > 0;

/** Status derived from amounts (keeps Void). */
export function statusFor(amount: number, paid: number, current?: InvoiceStatus): InvoiceStatus {
  if (current === 'Void') return 'Void';
  if (paid >= amount - 0.004 && amount > 0) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}

export type AgingKey = 'current' | 'd30' | 'd60' | 'd90' | 'd90p';
export const AGING: { key: AgingKey; label: string; test: (d: number) => boolean }[] = [
  { key: 'current', label: 'Current', test: (d) => d <= 0 },
  { key: 'd30', label: '1–30 days', test: (d) => d >= 1 && d <= 30 },
  { key: 'd60', label: '31–60 days', test: (d) => d >= 31 && d <= 60 },
  { key: 'd90', label: '61–90 days', test: (d) => d >= 61 && d <= 90 },
  { key: 'd90p', label: '90+ days', test: (d) => d > 90 },
];

export const agingOf = (inv: Invoice): AgingKey => AGING.find((a) => a.test(daysPastDue(inv)))!.key;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Opens a printable invoice in a new window. Returns false if the popup was blocked. */
export function printInvoice(inv: Invoice, account: Account | null, policy: Policy | null, agency: AgencySettings | null) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return false;
  const bal = balanceOf(inv);
  const agencyLines = agency
    ? [agency.name, agency.address, [agency.city, agency.state, agency.zip].filter(Boolean).join(', '), agency.phone, agency.email, agency.license_number ? `License # ${agency.license_number}` : null]
    : ['Northstar Insurance Agency'];
  const acctLines = account
    ? [accountName(account), account.address, [account.city, account.state, account.zip].filter(Boolean).join(', '), account.email]
    : ['Unknown account'];
  const html = `<!doctype html><html><head><title>Invoice ${esc(inv.invoice_number)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1c1414;margin:40px;font-size:13px}
h1{font-size:26px;margin:0;color:#dc2626;letter-spacing:.04em}
.row{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}
.muted{color:#7f2a2f}.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8f8484;font-weight:bold;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:10px 8px;border-bottom:1px solid #efeaea;text-align:left}
th{font-size:11px;text-transform:uppercase;color:#8f8484;background:#f8f6f6}.r{text-align:right}
.tot td{border:0;padding:4px 8px}.big{font-size:16px;font-weight:bold}
.stamp{display:inline-block;border:2px solid #dc2626;color:#dc2626;padding:4px 12px;font-weight:bold;letter-spacing:.1em;transform:rotate(-4deg)}
.void{border-color:#c0392b;color:#c0392b}
@media print{body{margin:16mm}button{display:none}}
</style></head><body>
<div class="row"><div>${agencyLines.filter(Boolean).map((l, i) => (i === 0 ? `<div class="big">${esc(l)}</div>` : `<div class="muted">${esc(l)}</div>`)).join('')}</div>
<div style="text-align:right"><h1>INVOICE</h1><div class="muted">No. ${esc(inv.invoice_number)}</div><div class="muted">Issued ${esc(fmtDate(inv.created_at))}</div>
${inv.status === 'Paid' ? '<div class="stamp" style="margin-top:10px">PAID</div>' : inv.status === 'Void' ? '<div class="stamp void" style="margin-top:10px">VOID</div>' : ''}</div></div>
<div class="row"><div><div class="lbl">Bill to</div>${acctLines.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('')}</div>
<div style="text-align:right"><div class="lbl">Due date</div><div class="big">${esc(fmtDate(inv.due_date))}</div>
${policy ? `<div class="lbl" style="margin-top:10px">Policy</div><div>${esc(policy.policy_number)}</div><div class="muted">${esc(policy.line_of_business)} · ${esc(policy.carrier)}</div>` : ''}</div></div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
<tbody><tr><td>${esc(inv.description || 'Insurance premium')}</td><td class="r">${esc(fmtMoney(inv.amount, true))}</td></tr></tbody></table>
<table class="tot" style="width:280px;margin-left:auto;margin-top:12px">
<tr><td>Subtotal</td><td class="r">${esc(fmtMoney(inv.amount, true))}</td></tr>
<tr><td>Payments received${inv.paid_date ? ` (${esc(fmtDate(inv.paid_date))}${inv.payment_method ? `, ${esc(inv.payment_method)}` : ''})` : ''}</td><td class="r">-${esc(fmtMoney(inv.amount_paid, true))}</td></tr>
<tr><td class="big">Balance due</td><td class="r big">${esc(fmtMoney(bal, true))}</td></tr></table>
<p class="muted" style="margin-top:40px">Please make checks payable to ${esc(agency?.name ?? 'the agency')} and include the invoice number with your payment. Thank you for your business.</p>
<button onclick="window.print()" style="margin-top:12px;padding:8px 14px;background:#dc2626;color:#fff;border:0;border-radius:4px;cursor:pointer">Print</button>
<script>setTimeout(function(){window.print()},300)</script>
</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
