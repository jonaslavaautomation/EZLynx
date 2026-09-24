import { daysUntil } from '@/lib/format';
import type { Claim, ClaimStatus } from '@/lib/types';

export const LOSS_TYPES = ['Collision', 'Comprehensive', 'Glass', 'Theft', 'Wind/Hail', 'Water Damage', 'Fire', 'Liability', 'Injury', 'Other'];
export const CLAIM_STATUSES: ClaimStatus[] = ['Open', 'Under Review', 'Paid', 'Closed', 'Denied'];

export const isOpenClaim = (c: Pick<Claim, 'status'>) => c.status === 'Open' || c.status === 'Under Review';

/** Days since the claim was reported (or the loss date) — only for claims still open. */
export function daysOpen(c: Pick<Claim, 'status' | 'reported_date' | 'date_of_loss'>) {
  if (!isOpenClaim(c)) return null;
  const n = daysUntil(c.reported_date ?? c.date_of_loss);
  return n === null ? null : Math.max(0, -n);
}

export const claimLabel = (c: Pick<Claim, 'claim_number'>) => c.claim_number || 'Pending claim #';
