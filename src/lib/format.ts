import type { Account } from '@/lib/types';

const currency0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-US');

export const fmtMoney = (n: number | null | undefined, cents = false) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : (cents ? currency2 : currency0).format(Number(n));

export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? '—' : number.format(Number(n)));

/** Today as YYYY-MM-DD in local time. */
export function today() {
  return toISODate(new Date());
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (as a local date) or an ISO timestamp. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date: string, days: number) {
  const d = parseDate(date) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(date: string, months: number) {
  const d = parseDate(date) ?? new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Whole days from today until `date` (negative when past). */
export function daysUntil(date: string | null | undefined) {
  const d = parseDate(date);
  if (!d) return null;
  const t = parseDate(today())!;
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function fmtDate(s: string | null | undefined) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';
}

export function fmtDateTime(s: string | null | undefined) {
  const d = parseDate(s);
  return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

export function fmtRelative(s: string | null | undefined) {
  const d = parseDate(s);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(s);
}

export function fmtBytes(n: number | null | undefined) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtPhone(s: string | null | undefined) {
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
}

export function accountName(a: Pick<Account, 'first_name' | 'last_name' | 'business_name' | 'account_type'> | null | undefined) {
  if (!a) return 'Unknown account';
  if (a.account_type === 'Commercial' && a.business_name) return a.business_name;
  return `${a.first_name} ${a.last_name}`.trim();
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function age(dob: string | null | undefined) {
  const d = parseDate(dob);
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

/** Download rows as a CSV file. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
