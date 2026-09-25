import { EmptyState, LoadingBlock } from '@/components/ui';
import { useRow } from '@/lib/hooks';
import { CommercialApplicant } from '@/modules/accounts/CommercialApplicant';
import { PersonalApplicant } from '@/modules/accounts/PersonalApplicant';

/** Opens the Personal or Commercial Applicant page for an existing account. */
export function ApplicantEditor({ accountId }: { accountId: string }) {
  const account = useRow('accounts', accountId);
  if (account.loading && !account.data) return <LoadingBlock label="Loading applicant…" />;
  if (!account.data) return <EmptyState title="Applicant not found" message="It may have been deleted." />;
  return account.data.account_type === 'Commercial' ? <CommercialApplicant accountId={accountId} /> : <PersonalApplicant accountId={accountId} />;
}
