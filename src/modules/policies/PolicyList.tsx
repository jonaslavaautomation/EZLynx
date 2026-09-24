import { FileCheck2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Panel, StatusBadge, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { commissionOf } from '@/lib/domain';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { Policy } from '@/lib/types';
import { ExpirationCell } from './PoliciesPage';
import { PolicyFormModal } from './PolicyFormModal';

/** An account's policies (used on the account detail page). */
export function PolicyList({ accountId }: { accountId: string }) {
  const { settings } = useAppData();
  const windowDays = settings?.renewal_reminder_days ?? 60;
  const policies = useTable('policies', { eq: { account_id: accountId }, order: { column: 'effective_date', ascending: false } });
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => {
    const active = policies.data.filter((p) => p.status === 'Active');
    return { count: active.length, premium: active.reduce((s, p) => s + Number(p.premium || 0), 0), commission: active.reduce((s, p) => s + commissionOf(p), 0) };
  }, [policies.data]);

  const columns: Column<Policy>[] = [
    { key: 'number', header: 'Policy #', sortValue: (p) => p.policy_number, render: (p) => <span className="font-semibold text-brand-600 whitespace-nowrap">{p.policy_number}</span> },
    { key: 'lob', header: 'Line', sortValue: (p) => p.line_of_business, render: (p) => <span className="whitespace-nowrap">{p.line_of_business}</span> },
    { key: 'carrier', header: 'Carrier', sortValue: (p) => p.carrier, render: (p) => <span className="whitespace-nowrap">{p.carrier}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'eff', header: 'Effective', sortValue: (p) => p.effective_date, render: (p) => <span className="whitespace-nowrap">{fmtDate(p.effective_date)}</span> },
    { key: 'exp', header: 'Expiration', sortValue: (p) => p.expiration_date, render: (p) => <ExpirationCell policy={p} windowDays={windowDays} /> },
    { key: 'billing', header: 'Billing', render: (p) => <Badge tone={p.billing_type === 'Agency Bill' ? 'purple' : 'gray'}>{p.billing_type}</Badge> },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (p) => Number(p.premium), render: (p) => <span className="tabular-nums">{fmtMoney(p.premium)}</span> },
  ];

  return (
    <Panel
      title="Policies"
      bodyClassName="p-0"
      actions={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add Policy</Button>}
    >
      <div className="p-3">
        <ErrorBanner message={policies.error} />
        {policies.data.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500 px-1 pb-3">
            <span><b className="text-ink-900">{totals.count}</b> active</span>
            <span>Active premium <b className="text-ink-900 tabular-nums">{fmtMoney(totals.premium)}</b></span>
            <span>Est. commission <b className="text-ink-900 tabular-nums">{fmtMoney(totals.commission)}</b></span>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={policies.data}
          loading={policies.loading}
          dense
          pageSize={10}
          onRowClick={(p) => navigate(`/policies/${p.id}`)}
          empty={
            <EmptyState
              icon={<FileCheck2 size={22} />}
              title="No policies on this account"
              message="Add an existing policy or start a quote to write new business."
              action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add Policy</Button>}
            />
          }
        />
      </div>
      {adding && <PolicyFormModal accountId={accountId} onClose={() => setAdding(false)} />}
    </Panel>
  );
}
