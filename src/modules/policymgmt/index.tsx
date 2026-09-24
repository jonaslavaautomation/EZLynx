import { useEffect } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { navigate } from '@/lib/router';
import { AcordPage } from './acord';
import { ClaimTransactionsPage } from './claimtx';
import { RewritesPage } from './rewrites';
import { RulesPage } from './rules';
import { StatementDetail } from './statement-detail';
import { StatementsPage } from './statements';
import { TeamPage } from './team';
import { TransactionsPage } from './transactions';

export { ClaimTransactionsPanel } from './claimtx';

/** Policy Mgmt + Commissions. `segments` are the path parts after "policy-mgmt". */
export function PolicyMgmtRoutes({ segments }: { segments: string[] }) {
  const [page, id] = segments;
  const isIndex = !page;
  useEffect(() => {
    if (isIndex) navigate('/policy-mgmt/transactions', { replace: true });
  }, [isIndex]);

  switch (page) {
    case undefined:
    case 'transactions': return <TransactionsPage />;
    case 'rewrites': return <RewritesPage />;
    case 'claim-transactions': return <ClaimTransactionsPage />;
    case 'acord': return <AcordPage />;
    case 'statements': return id ? <StatementDetail key={id} id={id} /> : <StatementsPage />;
    case 'rules': return <RulesPage />;
    case 'team': return <TeamPage />;
    default:
      return <EmptyState title="Page not found" message={`There is no Policy Mgmt page called “${page}”.`} action={<Button onClick={() => navigate('/policy-mgmt/transactions')}>Go to Policy Transactions</Button>} />;
  }
}
