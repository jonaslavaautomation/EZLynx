import { useMemo } from 'react';
import { useTable } from '@/lib/hooks';
import { parseDate, toISODate, today } from '@/lib/format';
import type { Account, Activity, Claim, Policy, PolicyTransaction, Quote } from '@/lib/types';

export type ReportData = {
  policies: Policy[];
  transactions: PolicyTransaction[];
  accounts: Account[];
  activities: Activity[];
  claims: Claim[];
  quotes: Quote[];
  accountsById: Map<string, Account>;
  policiesById: Map<string, Policy>;
  loading: boolean;
  error: string | null;
};

/** Loads every table the report library reads (live — refreshes on any change). */
export function useReportData(): ReportData {
  const policies = useTable('policies');
  const transactions = useTable('policy_transactions');
  const accounts = useTable('accounts');
  const activities = useTable('activities');
  const claims = useTable('claims');
  const quotes = useTable('quotes');
  const all = [policies, transactions, accounts, activities, claims, quotes];
  const loading = all.some((t) => t.loading);
  const error = all.map((t) => t.error).find(Boolean) ?? null;
  return useMemo(() => ({
    policies: policies.data, transactions: transactions.data, accounts: accounts.data, activities: activities.data, claims: claims.data, quotes: quotes.data,
    accountsById: new Map(accounts.data.map((a) => [a.id, a])),
    policiesById: new Map(policies.data.map((p) => [p.id, p])),
    loading, error,
  }), [policies.data, transactions.data, accounts.data, activities.data, claims.data, quotes.data, loading, error]);
}

export type Month = { key: string; label: string; start: string; end: string };

/** The last `n` calendar months ending with the current month, oldest first. */
export function lastMonths(n = 12): Month[] {
  const now = parseDate(today())!;
  const out: Month[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    out.push({
      key: toISODate(d).slice(0, 7),
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      start: toISODate(d),
      end: toISODate(end),
    });
  }
  return out;
}

export const monthKey = (date: string | null | undefined) => (date ? date.slice(0, 7) : '');

export const producerOf = (p: Policy, accountsById: Map<string, Account>) => p.producer || accountsById.get(p.account_id)?.producer || 'Unassigned';

export const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
export const fmtPct = (n: number, d: number) => (d > 0 ? `${pct(n, d).toFixed(1)}%` : '—');

/** Group items into a Map keyed by `key`. */
export function groupBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  items.forEach((t) => {
    const k = key(t);
    const list = m.get(k);
    if (list) list.push(t); else m.set(k, [t]);
  });
  return m;
}

export const sum = <T,>(items: T[], f: (t: T) => number) => items.reduce((s, t) => s + (Number(f(t)) || 0), 0);
