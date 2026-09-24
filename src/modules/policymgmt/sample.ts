import { uuid } from '@/lib/db';
import { commissionOf } from '@/lib/domain';
import { accountName, addDays, addMonths, today, toISODate, parseDate } from '@/lib/format';
import type { Account, Carrier, Claim, ClaimTransaction, CommissionRule, CommissionStatement, CommissionStatementLine, Policy, Staff } from '@/lib/types';

const cents = (n: number) => Math.round(n * 100) / 100;
const minDate = (a: string, b: string) => (a < b ? a : b);

/**
 * Deterministic sample rows for the Policy Mgmt + Commissions module (no randomness; everything is derived
 * from the input order), with dates relative to today.
 */
export function buildPolicyMgmtSample(d: { accounts: Account[]; policies: Policy[]; claims: Claim[]; staff: Staff[]; carriers: Carrier[] }): {
  claim_transactions: ClaimTransaction[];
  commission_statements: CommissionStatement[];
  commission_statement_lines: CommissionStatementLine[];
  commission_rules: CommissionRule[];
} {
  const now = Date.now();
  let tick = 0;
  const stamp = () => new Date(now - 3_600_000 + (tick++) * 1000).toISOString();
  const t = today();
  const accountById = new Map(d.accounts.map((a) => [a.id, a]));

  // ── Claim transactions: a reserve, loss payments consistent with the claim's paid amount, plus an expense or recovery.
  const claim_transactions: ClaimTransaction[] = [];
  d.claims.forEach((c, i) => {
    const start = c.reported_date || c.date_of_loss || t;
    const reserve = Number(c.amount_reserved ?? 0) || 1500 + (i % 5) * 750;
    const paid = Number(c.amount_paid ?? 0);
    const add = (type: ClaimTransaction['type'], amount: number, offset: number, description: string) => {
      claim_transactions.push({
        id: uuid(), created_at: stamp(), claim_id: c.id, account_id: c.account_id, type, amount: cents(amount),
        transaction_date: minDate(addDays(start, offset), t), description,
      });
    };
    add('Reserve', reserve, 1, `Initial reserve set by carrier — ${c.loss_type}`);
    const recovery = i % 3 === 1 && paid > 0 ? cents(Math.min(400, paid * 0.1)) : 0;
    if (paid > 0) add('Payment', paid + recovery, 12, i % 2 ? 'Repair shop payment' : 'Indemnity payment to insured');
    if (recovery > 0) add('Recovery', recovery, 30, 'Subrogation recovery from at-fault party');
    else add('Expense', 150 + (i % 4) * 85, 5, i % 2 ? 'Independent adjuster fee' : 'Inspection / appraisal fee');
  });

  // ── Commission statements: last month, for the two carriers with the most active policies.
  const thisMonth = toISODate(new Date((parseDate(t) ?? new Date()).getFullYear(), (parseDate(t) ?? new Date()).getMonth(), 1));
  const periodStart = addMonths(thisMonth, -1);
  const periodEnd = addDays(thisMonth, -1);
  const byCarrier = new Map<string, Policy[]>();
  d.policies.filter((p) => p.status === 'Active').forEach((p) => byCarrier.set(p.carrier, [...(byCarrier.get(p.carrier) ?? []), p]));
  const top = [...byCarrier.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 2);

  const commission_statements: CommissionStatement[] = [];
  const commission_statement_lines: CommissionStatementLine[] = [];
  top.forEach(([carrier, list], si) => {
    const statement_id = uuid();
    const lines: CommissionStatementLine[] = list.slice(0, 6).map((p, li) => ({
      id: uuid(), created_at: stamp(), statement_id, policy_id: p.id, policy_number: p.policy_number,
      insured_name: accountName(accountById.get(p.account_id)), transaction_type: li % 2 === 0 ? 'Renewal' : 'New Business',
      premium: Number(p.premium),
      // One line is paid slightly short, to demonstrate the variance check.
      commission_amount: cents(commissionOf(p) - (li === 1 ? 12.5 + si * 5 : 0)),
    }));
    lines.push({
      id: uuid(), created_at: stamp(), statement_id, policy_id: null, policy_number: `${si ? 'ZX' : 'QX'}-90${String(4412 + si * 37)}`,
      insured_name: si ? 'Harbor View Holdings LLC' : 'R. Delgado', transaction_type: 'Endorsement', premium: 240 + si * 60, commission_amount: cents((240 + si * 60) * 0.1),
    });
    const sum = cents(lines.reduce((s, l) => s + l.commission_amount, 0));
    commission_statements.push({
      id: statement_id, created_at: stamp(), carrier, statement_date: minDate(addDays(thisMonth, 4 + si * 3), t), period_start: periodStart, period_end: periodEnd,
      // The second statement's printed total is $25 off the lines, to demonstrate an out-of-balance statement.
      total_amount: si === 0 ? sum : cents(sum + 25), status: 'Open',
      notes: si === 0 ? 'Monthly direct-bill commission statement' : 'Carrier total includes a $25.00 adjustment not itemized',
    });
    commission_statement_lines.push(...lines);
  });

  // ── Service Team Rules: producers 40% new business / 25% renewal; CSRs 5% of everything.
  const commission_rules: CommissionRule[] = [];
  d.staff.forEach((s) => {
    const base = { carrier: null, line_of_business: null, active: true, staff_name: s.name };
    if (s.role === 'Producer') {
      commission_rules.push({ ...base, id: uuid(), created_at: stamp(), name: `${s.name} — New Business`, business_type: 'New Business', split_percent: 40 });
      commission_rules.push({ ...base, id: uuid(), created_at: stamp(), name: `${s.name} — Renewal`, business_type: 'Renewal', split_percent: 25 });
    } else if (s.role === 'CSR') {
      commission_rules.push({ ...base, id: uuid(), created_at: stamp(), name: `${s.name} — CSR service split`, business_type: 'All', split_percent: 5 });
    }
  });

  return { claim_transactions, commission_statements, commission_statement_lines, commission_rules };
}
