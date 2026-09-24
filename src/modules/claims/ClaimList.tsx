import { Plus, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, EmptyState, ErrorBanner, Panel } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import type { Account, Policy } from '@/lib/types';
import { ClaimFormModal } from './ClaimFormModal';
import { ClaimsTable } from './ClaimsTable';
import { isOpenClaim } from './constants';

/** Claims for one account (Account detail → Claims tab). */
export function ClaimList({ accountId }: { accountId: string }) {
  const claims = useTable('claims', { eq: { account_id: accountId }, order: { column: 'date_of_loss', ascending: false } });
  const policies = useTable('policies', { eq: { account_id: accountId } });
  const account = useRow('accounts', accountId);
  const [reporting, setReporting] = useState(false);

  const lookup = useMemo(() => ({
    accounts: new Map<string, Account>(account.data ? [[account.data.id, account.data]] : []),
    policies: new Map<string, Policy>(policies.data.map((p) => [p.id, p])),
  }), [account.data, policies.data]);

  const openCount = claims.data.filter(isOpenClaim).length;
  const paid = claims.data.reduce((s, c) => s + Number(c.amount_paid ?? 0), 0);

  return (
    <Panel
      title={<div>
        <h2 className="text-[15px] font-semibold text-ink-900">Claims</h2>
        {claims.data.length > 0 && <div className="text-xs text-ink-400">{claims.data.length} total · {openCount} open · {fmtMoney(paid)} paid</div>}
      </div>}
      actions={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setReporting(true)}>Report Claim</Button>}
      bodyClassName="p-0"
    >
      <ErrorBanner message={claims.error} />
      <ClaimsTable
        rows={claims.data}
        lookup={lookup}
        showInsured={false}
        loading={claims.loading && !claims.data.length}
        empty={<EmptyState icon={<ShieldAlert size={22} />} title="No claims on file" message="Loss history for this account will appear here." action={<Button icon={<Plus size={14} />} onClick={() => setReporting(true)}>Report Claim</Button>} />}
      />
      {reporting && <ClaimFormModal accountId={accountId} onClose={() => setReporting(false)} />}
    </Panel>
  );
}
