import { db } from '@/lib/db';
import { addMonths, today } from '@/lib/format';
import type { Activity, Coverage, Invoice, LineOfBusiness, Policy, TransactionType } from '@/lib/types';

/** Shared business operations used by more than one module. */

const LOB_PREFIX: Partial<Record<LineOfBusiness, string>> = {
  'Personal Auto': 'PA', Homeowners: 'HO', Renters: 'RT', Condo: 'CD', 'Dwelling Fire': 'DF', Umbrella: 'UM', Motorcycle: 'MC',
  Boat: 'BT', Flood: 'FL', Life: 'LF', 'Commercial Auto': 'CA', 'General Liability': 'GL', BOP: 'BP', 'Workers Comp': 'WC', 'Commercial Property': 'CP',
};

export function generatePolicyNumber(line: LineOfBusiness) {
  const n = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  return `${LOB_PREFIX[line] ?? 'PL'}-${n}`;
}

export function generateNumber(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
}

export async function addTransaction(policy: Pick<Policy, 'id' | 'account_id'>, type: TransactionType, effective_date: string, premium_change: number, description: string | null) {
  return db.insert('policy_transactions', { policy_id: policy.id, account_id: policy.account_id, type, effective_date, premium_change, description });
}

/** Log a completed note/activity against an account (and optionally a policy). */
export async function logActivity(values: Pick<Activity, 'subject'> & Partial<Activity>) {
  return db.insert('activities', {
    type: 'Note', priority: 'Normal', status: 'Completed', completed_at: new Date().toISOString(), due_date: today(),
    account_id: null, policy_id: null, description: null, assigned_to: null, ...values,
  });
}

export type NewPolicy = Omit<Policy, 'id' | 'created_at' | 'expiration_date' | 'policy_number' | 'coverages' | 'notes' | 'payment_plan' | 'producer'> & Partial<Pick<Policy, 'expiration_date' | 'policy_number' | 'coverages' | 'notes' | 'payment_plan' | 'producer'>>;

/**
 * Creates a policy plus its New Business transaction; for Agency Bill policies also creates the first
 * invoice. Marks the account Active. Returns the new policy.
 */
export async function createPolicy(values: NewPolicy): Promise<Policy> {
  const policy = await db.insert('policies', {
    coverages: [] as Coverage[], notes: null, payment_plan: 'Paid in Full', producer: null,
    ...values,
    policy_number: values.policy_number || generatePolicyNumber(values.line_of_business),
    expiration_date: values.expiration_date || addMonths(values.effective_date, values.term_months),
  });
  await addTransaction(policy, 'New Business', policy.effective_date, policy.premium, `New ${policy.line_of_business} policy with ${policy.carrier}`);
  if (policy.billing_type === 'Agency Bill') await createInvoice({ account_id: policy.account_id, policy_id: policy.id, amount: policy.premium, description: `${policy.line_of_business} premium — ${policy.policy_number}`, due_date: policy.effective_date });
  const account = await db.get('accounts', policy.account_id);
  if (account && account.status !== 'Active') await db.update('accounts', account.id, { status: 'Active' });
  return policy;
}

export async function createInvoice(values: Pick<Invoice, 'account_id' | 'amount' | 'due_date'> & Partial<Invoice>) {
  return db.insert('invoices', {
    policy_id: null, description: null, amount_paid: 0, status: 'Unpaid', paid_date: null, payment_method: null,
    invoice_number: generateNumber('INV'), ...values,
  });
}

/** Agency commission earned on a policy. */
export const commissionOf = (p: Pick<Policy, 'premium' | 'commission_rate'>) => (Number(p.premium) * Number(p.commission_rate)) / 100;
