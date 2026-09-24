import { useMemo, type ReactNode } from 'react';
import { DataTable, StatusBadge, cx, type Column } from '@/components/ui';
import { accountName, fmtDate, fmtMoney } from '@/lib/format';
import { navigate, href } from '@/lib/router';
import type { Account, Claim, Policy } from '@/lib/types';
import { claimLabel, daysOpen } from './constants';

export type ClaimLookup = { accounts: Map<string, Account>; policies: Map<string, Policy> };

export function ClaimsTable({ rows, lookup, loading, showInsured = true, empty }: { rows: Claim[]; lookup: ClaimLookup; loading?: boolean; showInsured?: boolean; empty?: ReactNode }) {
  const columns = useMemo<Column<Claim>[]>(() => {
    const cols: (Column<Claim> | false)[] = [
      {
        key: 'claim', header: 'Claim #', sortValue: (c) => c.claim_number ?? '',
        render: (c) => <span className={cx('font-semibold whitespace-nowrap', c.claim_number ? 'text-brand-600' : 'text-ink-400 italic font-normal')}>{claimLabel(c)}</span>,
      },
      showInsured && {
        key: 'insured', header: 'Insured', sortValue: (c) => accountName(lookup.accounts.get(c.account_id)),
        render: (c) => {
          const a = lookup.accounts.get(c.account_id);
          return a ? <a href={href(`/accounts/${a.id}`)} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline whitespace-nowrap">{accountName(a)}</a> : <span className="text-ink-300">—</span>;
        },
      },
      {
        key: 'policy', header: 'Policy',
        render: (c) => {
          const p = c.policy_id ? lookup.policies.get(c.policy_id) : undefined;
          return p ? (
            <a href={href(`/policies/${p.id}`)} onClick={(e) => e.stopPropagation()} className="hover:underline whitespace-nowrap">
              <span className="text-brand-600">{p.policy_number}</span>
              <span className="block text-[11px] text-ink-400">{p.line_of_business} · {p.carrier}</span>
            </a>
          ) : <span className="text-ink-300">—</span>;
        },
      },
      { key: 'loss', header: 'Date of Loss', sortValue: (c) => c.date_of_loss, render: (c) => <span className="whitespace-nowrap">{fmtDate(c.date_of_loss)}</span> },
      { key: 'type', header: 'Loss Type', sortValue: (c) => c.loss_type, render: (c) => c.loss_type },
      { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <StatusBadge status={c.status} /> },
      { key: 'reserved', header: 'Reserved', align: 'right', sortValue: (c) => c.amount_reserved ?? 0, render: (c) => <span className="tabular-nums">{fmtMoney(c.amount_reserved)}</span> },
      { key: 'paid', header: 'Paid', align: 'right', sortValue: (c) => c.amount_paid ?? 0, render: (c) => <span className="tabular-nums">{fmtMoney(c.amount_paid)}</span> },
      { key: 'adjuster', header: 'Adjuster', render: (c) => c.adjuster_name ? <div className="whitespace-nowrap">{c.adjuster_name}{c.adjuster_phone && <div className="text-[11px] text-ink-400">{c.adjuster_phone}</div>}</div> : <span className="text-ink-300">—</span> },
      {
        key: 'days', header: 'Days Open', align: 'right', sortValue: (c) => daysOpen(c) ?? -1,
        render: (c) => { const d = daysOpen(c); return d === null ? <span className="text-ink-300">—</span> : <span className={cx('tabular-nums', d > 30 && 'text-red-600 font-semibold')}>{d}</span>; },
      },
    ];
    return cols.filter(Boolean) as Column<Claim>[];
  }, [lookup, showInsured]);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      onRowClick={(c) => navigate(`/claims/${c.id}`)}
      initialSort={{ key: 'loss', dir: 'desc' }}
      empty={empty}
    />
  );
}
