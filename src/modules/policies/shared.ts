import { daysUntil, parseDate } from '@/lib/format';
import type { Tone } from '@/components/ui';
import type { Coverage, LineOfBusiness, Policy, PolicyStatus } from '@/lib/types';

export const POLICY_STATUSES: PolicyStatus[] = ['Active', 'Pending', 'Cancelled', 'Expired', 'Non-Renewed'];
export const PAYMENT_PLANS = ['Paid in Full', 'Semi-Annual', 'Quarterly', 'Monthly', 'EFT Monthly', 'Payroll Deduct'];
export const BILLING_TYPES: Policy['billing_type'][] = ['Direct Bill', 'Agency Bill'];
export const TERM_OPTIONS = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
];
export const CANCEL_REASONS = [
  'Insured request', 'Non-payment of premium', 'Underwriting reasons', 'Replaced with another carrier', 'Sold vehicle / property', 'Moved out of state', 'Other',
];

/** Starting coverage schedule for a new policy of a common line. */
export const DEFAULT_COVERAGES: Partial<Record<LineOfBusiness, Coverage[]>> = {
  'Personal Auto': [
    { name: 'Bodily Injury Liability', limit: '$100,000 / $300,000' },
    { name: 'Property Damage Liability', limit: '$100,000' },
    { name: 'Uninsured / Underinsured Motorist', limit: '$100,000 / $300,000' },
    { name: 'Medical Payments', limit: '$5,000' },
    { name: 'Comprehensive', limit: 'ACV', deductible: '$500' },
    { name: 'Collision', limit: 'ACV', deductible: '$500' },
  ],
  Homeowners: [
    { name: 'Coverage A — Dwelling', limit: '$350,000', deductible: '$1,000' },
    { name: 'Coverage B — Other Structures', limit: '$35,000' },
    { name: 'Coverage C — Personal Property', limit: '$175,000' },
    { name: 'Coverage D — Loss of Use', limit: '$70,000' },
    { name: 'Coverage E — Personal Liability', limit: '$300,000' },
    { name: 'Coverage F — Medical Payments', limit: '$5,000' },
  ],
  Renters: [
    { name: 'Personal Property', limit: '$30,000', deductible: '$500' },
    { name: 'Loss of Use', limit: '$9,000' },
    { name: 'Personal Liability', limit: '$100,000' },
    { name: 'Medical Payments', limit: '$1,000' },
  ],
  Condo: [
    { name: 'Dwelling (Walls-In)', limit: '$50,000', deductible: '$1,000' },
    { name: 'Personal Property', limit: '$60,000' },
    { name: 'Loss Assessment', limit: '$10,000' },
    { name: 'Personal Liability', limit: '$300,000' },
  ],
  'Dwelling Fire': [
    { name: 'Dwelling', limit: '$250,000', deductible: '$1,000' },
    { name: 'Fair Rental Value', limit: '$25,000' },
    { name: 'Premises Liability', limit: '$300,000' },
  ],
  Umbrella: [{ name: 'Personal Umbrella Liability', limit: '$1,000,000', deductible: '$0 SIR' }],
  Motorcycle: [
    { name: 'Bodily Injury Liability', limit: '$50,000 / $100,000' },
    { name: 'Property Damage Liability', limit: '$50,000' },
    { name: 'Comprehensive', limit: 'ACV', deductible: '$250' },
    { name: 'Collision', limit: 'ACV', deductible: '$500' },
  ],
  Boat: [
    { name: 'Hull (Agreed Value)', limit: '$25,000', deductible: '$500' },
    { name: 'Watercraft Liability', limit: '$300,000' },
  ],
  Flood: [
    { name: 'Building', limit: '$250,000', deductible: '$1,250' },
    { name: 'Contents', limit: '$100,000', deductible: '$1,250' },
  ],
  Life: [{ name: 'Death Benefit', limit: '$500,000' }],
  'Commercial Auto': [
    { name: 'Combined Single Limit', limit: '$1,000,000' },
    { name: 'Hired & Non-Owned Auto', limit: '$1,000,000' },
    { name: 'Comprehensive', limit: 'ACV', deductible: '$1,000' },
    { name: 'Collision', limit: 'ACV', deductible: '$1,000' },
  ],
  'General Liability': [
    { name: 'Each Occurrence', limit: '$1,000,000' },
    { name: 'General Aggregate', limit: '$2,000,000' },
    { name: 'Products / Completed Ops Aggregate', limit: '$2,000,000' },
    { name: 'Personal & Advertising Injury', limit: '$1,000,000' },
    { name: 'Damage to Rented Premises', limit: '$100,000' },
    { name: 'Medical Expense', limit: '$5,000' },
  ],
  BOP: [
    { name: 'Building', limit: '$500,000', deductible: '$1,000' },
    { name: 'Business Personal Property', limit: '$150,000', deductible: '$1,000' },
    { name: 'Business Income', limit: '12 months ALS' },
    { name: 'Liability — Each Occurrence', limit: '$1,000,000' },
    { name: 'Liability — Aggregate', limit: '$2,000,000' },
  ],
  'Workers Comp': [
    { name: 'Part One — Workers Compensation', limit: 'Statutory' },
    { name: 'Employers Liability — Each Accident', limit: '$1,000,000' },
    { name: 'Employers Liability — Disease Policy Limit', limit: '$1,000,000' },
    { name: 'Employers Liability — Disease Each Employee', limit: '$1,000,000' },
  ],
  'Commercial Property': [
    { name: 'Building', limit: '$1,000,000', deductible: '$2,500' },
    { name: 'Business Personal Property', limit: '$250,000', deductible: '$2,500' },
    { name: 'Business Income w/ Extra Expense', limit: '$100,000' },
  ],
};

export const defaultCoverages = (line: LineOfBusiness): Coverage[] => (DEFAULT_COVERAGES[line] ?? []).map((c) => ({ ...c }));

/** Whether the policy belongs in the renewals queue given the reminder window. */
export function inRenewalWindow(p: Pick<Policy, 'status' | 'expiration_date'>, windowDays: number) {
  if (p.status !== 'Active' && p.status !== 'Expired') return false;
  const d = daysUntil(p.expiration_date);
  return d !== null && d <= windowDays && d >= -30;
}

export function expirationTone(days: number): Tone {
  if (days < 0) return 'red';
  if (days <= 15) return 'red';
  if (days <= 30) return 'amber';
  return 'blue';
}

export function relativeDays(days: number) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return '1 day ago';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const dayMs = 86400000;

/** Unearned premium returned when cancelling on `cancelDate`, pro-rata over the term. */
export function proRataReturn(p: Pick<Policy, 'premium' | 'effective_date' | 'expiration_date'>, cancelDate: string) {
  const start = parseDate(p.effective_date), end = parseDate(p.expiration_date), at = parseDate(cancelDate);
  if (!start || !end || !at) return 0;
  const term = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs));
  const remaining = Math.min(term, Math.max(0, Math.round((end.getTime() - at.getTime()) / dayMs)));
  return Math.round((Number(p.premium) * remaining * 100) / term) / 100;
}

/** Parse a money-ish input string ("1,234.50", "-50") into a number, or null when blank/invalid. */
export function parseAmount(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, '');
  if (!clean || clean === '-' || clean === '.') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export const signedMoney = (n: number, fmt: (n: number, cents?: boolean) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), true);

// ── Coverage drafts (editable coverage rows) ──

/** Editable coverage row; premium kept as text while editing. */
export type CoverageDraft = { key: number; name: string; limit: string; deductible: string; premium: string };

let seq = 0;
export const toDrafts = (list: Coverage[] | null | undefined): CoverageDraft[] =>
  (list ?? []).map((c) => ({ key: ++seq, name: c.name ?? '', limit: c.limit ?? '', deductible: c.deductible ?? '', premium: c.premium === undefined || c.premium === null ? '' : String(c.premium) }));

export const blankDraft = (): CoverageDraft => ({ key: ++seq, name: '', limit: '', deductible: '', premium: '' });

/** Validates drafts; returns the cleaned coverages or an error message. */
export function fromDrafts(drafts: CoverageDraft[]): { coverages: Coverage[]; error: string | null } {
  const coverages: Coverage[] = [];
  for (const [i, d] of drafts.entries()) {
    const empty = !d.name.trim() && !d.limit.trim() && !d.deductible.trim() && !d.premium.trim();
    if (empty) continue;
    if (!d.name.trim()) return { coverages, error: `Coverage row ${i + 1} needs a name.` };
    if (!d.limit.trim()) return { coverages, error: `Coverage "${d.name.trim()}" needs a limit.` };
    let premium: number | undefined;
    if (d.premium.trim()) {
      const n = parseAmount(d.premium);
      if (n === null || n < 0) return { coverages, error: `Coverage "${d.name.trim()}" has an invalid premium.` };
      premium = n;
    }
    const c: Coverage = { name: d.name.trim(), limit: d.limit.trim() };
    if (d.deductible.trim()) c.deductible = d.deductible.trim();
    if (premium !== undefined) c.premium = premium;
    coverages.push(c);
  }
  return { coverages, error: null };
}


// ── Transaction availability by status ──

export type PolicyAction = 'endorse' | 'renew' | 'cancel' | 'reinstate' | 'nonrenew' | 'audit';

const ALLOWED: Record<PolicyAction, PolicyStatus[]> = {
  endorse: ['Active', 'Pending'],
  renew: ['Active', 'Expired'],
  cancel: ['Active', 'Pending'],
  reinstate: ['Cancelled'],
  nonrenew: ['Active'],
  audit: ['Active', 'Expired', 'Cancelled'],
};

export const canDo = (action: PolicyAction, status: PolicyStatus) => ALLOWED[action].includes(status);
