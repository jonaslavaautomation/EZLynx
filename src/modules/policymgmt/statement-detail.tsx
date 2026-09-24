import { CheckCircle2, Download, FileSpreadsheet, Link2, Link2Off, Lock, Pencil, Play, Plus, RotateCcw, Send, Trash2, Upload, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Menu, Modal, PageHeader, Panel, SearchInput, Select, Checkbox, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { commissionOf, logActivity } from '@/lib/domain';
import { downloadCsv, fmtDate, fmtMoney } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, CommissionStatement, CommissionStatementLine, Policy } from '@/lib/types';
import { LINE_TX_TYPES, STATEMENT_TONES, cents, computePayouts, insuredName, normNumber, parseAmount, parseCsv, type PayoutRow } from './shared';
import { StatementFormModal } from './statements';

type LineRow = CommissionStatementLine & { policy?: Policy; expected: number | null; variance: number | null };

function matchPolicy(number: string, carrier: string, policies: Policy[]) {
  const n = normNumber(number);
  if (!n) return undefined;
  const hits = policies.filter((p) => normNumber(p.policy_number) === n);
  return hits.find((p) => p.carrier.toLowerCase() === carrier.toLowerCase()) ?? hits[0];
}

/** Expected commission at the policy's commission rate on the premium reported on the line. */
const expectedFor = (l: CommissionStatementLine, p: Policy | undefined) => (p ? cents(commissionOf({ premium: Number(l.premium), commission_rate: p.commission_rate })) : null);

export function StatementDetail({ id }: { id: string }) {
  const { toast, confirm } = useFeedback();
  const { me } = useAppData();
  const st = useRow('commission_statements', id);
  const lines = useTable('commission_statement_lines', { eq: { statement_id: id }, order: { column: 'created_at' } });
  const policies = useTable('policies');
  const accounts = useTable('accounts');
  const rules = useTable('commission_rules');
  const [editing, setEditing] = useState(false);
  const [lineModal, setLineModal] = useState<CommissionStatementLine | 'new' | null>(null);
  const [matching, setMatching] = useState<CommissionStatementLine | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  const pm = useMemo(() => new Map(policies.data.map((p) => [p.id, p])), [policies.data]);
  const am = useMemo(() => new Map<string, Account>(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const rows = useMemo<LineRow[]>(() => lines.data.map((l) => {
    const policy = l.policy_id ? pm.get(l.policy_id) : undefined;
    const expected = expectedFor(l, policy);
    return { ...l, policy, expected, variance: expected === null ? null : cents(Number(l.commission_amount) - expected) };
  }), [lines.data, pm]);

  const s = st.data;
  const payouts = useMemo(() => (s ? computePayouts({ lines: lines.data, statementCarrier: s.carrier, rules: rules.data, policies: pm, accounts: am }) : null), [s, lines.data, rules.data, pm, am]);

  if (st.loading && !s) return <LoadingBlock />;
  if (!s) {
    return (
      <div>
        <ErrorBanner message={st.error} />
        <EmptyState icon={<FileSpreadsheet size={22} />} title="Statement not found" message="It may have been deleted." action={<Button onClick={() => navigate('/policy-mgmt/statements')}>Back to Statements</Button>} />
      </div>
    );
  }

  const open = s.status === 'Open';
  const lineTotal = cents(rows.reduce((t, l) => t + (Number(l.commission_amount) || 0), 0));
  const premiumTotal = cents(rows.reduce((t, l) => t + (Number(l.premium) || 0), 0));
  const diff = cents(Number(s.total_amount) - lineTotal);
  const unmatched = rows.filter((l) => !l.policy_id).length;
  const variances = rows.filter((l) => l.variance !== null && Math.abs(l.variance) >= 0.01);

  const log = (subject: string, description: string | null = null) => logActivity({ subject, description, assigned_to: me?.name ?? null }).catch(() => {});

  const setStatus = async (status: CommissionStatement['status']) => {
    if (busy) return;
    if (status === 'Reconciled') {
      if (!rows.length) { toast('Add the statement lines before reconciling', 'error'); return; }
      if (diff !== 0) { toast(`Statement total and lines differ by ${fmtMoney(diff, true)} — resolve the difference first`, 'error'); return; }
      if (unmatched) {
        const ok = await confirm({ title: 'Reconcile with unmatched lines?', message: `${unmatched} line${unmatched === 1 ? ' is' : 's are'} not matched to a policy and will pay no Service Team commission. Reconcile anyway?`, confirmLabel: 'Reconcile' });
        if (!ok) return;
      }
    }
    if (status === 'Open' && s.status === 'Posted') {
      const ok = await confirm({ title: 'Reopen posted statement?', message: 'Payouts from this statement may already have been paid. Reopening lets lines change and payouts be re-run.', confirmLabel: 'Reopen' });
      if (!ok) return;
    }
    setBusy(status);
    try {
      await db.update('commission_statements', s.id, { status });
      await log(`Commission statement ${status === 'Open' ? 'reopened' : status.toLowerCase()} — ${s.carrier} ${fmtDate(s.statement_date)}`, `Total ${fmtMoney(s.total_amount, true)}, ${rows.length} lines.`);
      toast(status === 'Open' ? 'Statement reopened' : `Statement ${status.toLowerCase()}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete statement?', message: `The ${s.carrier} statement of ${fmtDate(s.statement_date)} and its ${rows.length} line${rows.length === 1 ? '' : 's'} will be permanently deleted.`, confirmLabel: 'Delete statement', danger: true });
    if (!ok) return;
    try {
      await db.remove('commission_statements', s.id);
      await log(`Commission statement deleted — ${s.carrier} ${fmtDate(s.statement_date)}`);
      toast('Statement deleted');
      navigate('/policy-mgmt/statements');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const autoMatch = async () => {
    if (busy) return;
    const todo = lines.data.filter((l) => !l.policy_id);
    if (!todo.length) { toast('All lines are already matched', 'info'); return; }
    setBusy('match');
    let n = 0;
    try {
      for (const l of todo) {
        const p = matchPolicy(l.policy_number, s.carrier, policies.data);
        if (!p) continue;
        await db.update('commission_statement_lines', l.id, { policy_id: p.id, insured_name: l.insured_name || insuredName(am.get(p.account_id)) });
        n++;
      }
      toast(n ? `Matched ${n} of ${todo.length} line${todo.length === 1 ? '' : 's'}` : 'No policy numbers matched the book', n ? 'success' : 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const unmatch = async (l: CommissionStatementLine) => {
    try { await db.update('commission_statement_lines', l.id, { policy_id: null }); toast('Line unmatched'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const removeLine = async (l: CommissionStatementLine) => {
    const ok = await confirm({ title: 'Delete line?', message: `${l.policy_number} · ${fmtMoney(l.commission_amount, true)} will be removed from this statement.`, confirmLabel: 'Delete line', danger: true });
    if (!ok) return;
    try { await db.remove('commission_statement_lines', l.id); toast('Line deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const exportPayouts = () => {
    if (!payouts?.rows.length) { toast('No payouts to export', 'info'); return; }
    downloadCsv(`service-team-payouts-${s.carrier.replace(/\W+/g, '-')}-${s.statement_date}.csv`, payouts.rows.map((r) => ({
      Carrier: s.carrier, 'Statement Date': s.statement_date, 'Team Member': r.staff_name, 'Policy #': r.policy_number, Insured: r.insured,
      Rule: r.rule, 'Split %': r.split_percent, 'Agency Commission': r.commission.toFixed(2), Payout: r.payout.toFixed(2),
    })));
    toast(`Exported ${payouts.rows.length} payout row${payouts.rows.length === 1 ? '' : 's'}`);
  };

  const columns: Column<LineRow>[] = [
    { key: 'num', header: 'Policy #', sortValue: (l) => l.policy_number, render: (l) => <span className="font-semibold whitespace-nowrap">{l.policy_number}</span> },
    { key: 'insured', header: 'Insured', sortValue: (l) => l.insured_name, render: (l) => <span className="whitespace-nowrap">{l.insured_name || (l.policy ? insuredName(am.get(l.policy.account_id)) : '—')}</span> },
    { key: 'type', header: 'Transaction', sortValue: (l) => l.transaction_type, render: (l) => <span className="whitespace-nowrap">{l.transaction_type}</span> },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: (l) => Number(l.premium), render: (l) => <span className="tabular-nums">{fmtMoney(l.premium, true)}</span> },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (l) => Number(l.commission_amount), render: (l) => <span className="tabular-nums font-semibold">{fmtMoney(l.commission_amount, true)}</span> },
    { key: 'expected', header: 'Expected', align: 'right', sortValue: (l) => l.expected, render: (l) => (l.expected === null ? <span className="text-ink-300">—</span> : <span className="tabular-nums text-ink-500" title={`${l.policy?.commission_rate}% of ${fmtMoney(l.premium, true)}`}>{fmtMoney(l.expected, true)}</span>) },
    { key: 'var', header: 'Variance', align: 'right', sortValue: (l) => l.variance, render: (l) => (l.variance === null ? <span className="text-ink-300">—</span> : Math.abs(l.variance) >= 0.01 ? <Badge tone={l.variance < 0 ? 'red' : 'amber'}>{l.variance > 0 ? '+' : '−'}{fmtMoney(Math.abs(l.variance), true)}</Badge> : <span className="text-emerald-700 text-xs font-semibold">OK</span>) },
    { key: 'match', header: 'Matched policy', sortValue: (l) => (l.policy_id ? 1 : 0), render: (l) => (l.policy ? <a href={href(`/policies/${l.policy.id}`)} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline whitespace-nowrap inline-flex items-center gap-1"><Link2 size={12} /> {l.policy.policy_number}</a> : <Badge tone="amber">Unmatched</Badge>) },
    {
      key: 'actions', header: '', align: 'right', render: (l) => (open ? (
        <Menu items={[
          { label: 'Edit line', icon: <Pencil size={14} />, onClick: () => setLineModal(l) },
          { label: l.policy_id ? 'Change matched policy' : 'Match to policy…', icon: <Link2 size={14} />, onClick: () => setMatching(l) },
          ...(l.policy_id ? [{ label: 'Unmatch', icon: <Link2Off size={14} />, onClick: () => void unmatch(l) }] : []),
          'divider' as const,
          { label: 'Delete line', icon: <Trash2 size={14} />, danger: true, onClick: () => void removeLine(l) },
        ]} />
      ) : <Lock size={13} className="text-ink-300 inline" />),
    },
  ];

  const payoutLineCols: Column<PayoutRow>[] = [
    { key: 'staff', header: 'Team member', sortValue: (r) => r.staff_name, render: (r) => <span className="font-semibold whitespace-nowrap">{r.staff_name}</span> },
    { key: 'num', header: 'Policy #', sortValue: (r) => r.policy_number, render: (r) => r.policy_number },
    { key: 'insured', header: 'Insured', sortValue: (r) => r.insured, render: (r) => <span className="whitespace-nowrap">{r.insured}</span> },
    { key: 'rule', header: 'Rule', sortValue: (r) => r.rule, render: (r) => <span className="whitespace-nowrap text-ink-500">{r.rule}</span> },
    { key: 'split', header: 'Split', align: 'right', sortValue: (r) => r.split_percent, render: (r) => `${r.split_percent}%` },
    { key: 'comm', header: 'Commission', align: 'right', sortValue: (r) => r.commission, render: (r) => <span className="tabular-nums">{fmtMoney(r.commission, true)}</span> },
    { key: 'payout', header: 'Payout', align: 'right', sortValue: (r) => r.payout, render: (r) => <span className="tabular-nums font-semibold">{fmtMoney(r.payout, true)}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Commission Statements', href: href('/policy-mgmt/statements') }]}
        icon={<FileSpreadsheet size={20} />}
        title={<span className="flex items-center gap-2 flex-wrap">{s.carrier} statement <Badge tone={STATEMENT_TONES[s.status] ?? 'gray'}>{s.status}</Badge></span>}
        subtitle={`Dated ${fmtDate(s.statement_date)}${s.period_start || s.period_end ? ` · Period ${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}` : ''}${s.notes ? ` · ${s.notes}` : ''}`}
        actions={<>
          {open && <Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy === 'Reconciled'} onClick={() => void setStatus('Reconciled')}>Mark Reconciled</Button>}
          {s.status === 'Reconciled' && <Button variant="primary" icon={<Send size={15} />} loading={busy === 'Posted'} onClick={() => void setStatus('Posted')}>Post</Button>}
          {!open && <Button icon={<RotateCcw size={14} />} loading={busy === 'Open'} onClick={() => void setStatus('Open')}>Reopen</Button>}
          <Button icon={<Pencil size={14} />} onClick={() => setEditing(true)} disabled={!open} title={open ? undefined : 'Reopen the statement to edit it'}>Edit</Button>
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 size={14} />} onClick={() => void remove()}>Delete</Button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {([
          ['Statement total', fmtMoney(s.total_amount, true), null],
          ['Sum of lines', fmtMoney(lineTotal, true), `${rows.length} line${rows.length === 1 ? '' : 's'} · ${fmtMoney(premiumTotal, true)} premium`],
          ['Difference', fmtMoney(diff, true), diff === 0 ? 'In balance' : 'Must be $0.00 to reconcile'],
          ['Unmatched lines', String(unmatched), rows.length ? `${Math.round(((rows.length - unmatched) / rows.length) * 100)}% matched` : null],
          ['Commission variances', String(variances.length), variances.length ? `${fmtMoney(cents(variances.reduce((t, l) => t + (l.variance ?? 0), 0)), true)} vs expected` : 'All matched lines as expected'],
        ] as [string, string, string | null][]).map(([k, v, hint]) => (
          <div key={k} className={`bg-white border rounded shadow-card p-3 min-w-0 ${k === 'Difference' && diff !== 0 ? 'border-red-300' : k === 'Unmatched lines' && unmatched ? 'border-amber-300' : 'border-[#e3e3e3]'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
            <div className={`text-lg font-semibold tabular-nums ${k === 'Difference' && diff !== 0 ? 'text-red-600' : 'text-ink-900'}`}>{v}</div>
            {hint && <div className="text-xs text-ink-400 truncate">{hint}</div>}
          </div>
        ))}
      </div>

      <Panel
        className="mb-4"
        bodyClassName="p-3"
        title="Statement lines"
        actions={open ? <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" icon={<Wand2 size={13} />} loading={busy === 'match'} onClick={() => void autoMatch()} disabled={!unmatched}>Auto-match</Button>
          <Button size="sm" icon={<Upload size={13} />} onClick={() => setImporting(true)}>Import lines (CSV)</Button>
          <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setLineModal('new')}>Add line</Button>
        </div> : <span className="text-xs text-ink-400 inline-flex items-center gap-1"><Lock size={12} /> {s.status} — reopen to change lines</span>}
      >
        <ErrorBanner message={lines.error || policies.error} />
        <DataTable columns={columns} rows={rows} loading={lines.loading} dense pageSize={50} initialSort={{ key: 'num', dir: 'asc' }}
          empty={<EmptyState icon={<FileSpreadsheet size={22} />} title="No lines yet" message="Add each policy on the carrier statement, or import them from a CSV file." action={open ? <div className="flex gap-2 justify-center"><Button icon={<Upload size={14} />} onClick={() => setImporting(true)}>Import CSV</Button><Button variant="primary" icon={<Plus size={14} />} onClick={() => setLineModal('new')}>Add line</Button></div> : undefined} />} />
      </Panel>

      <Panel
        title="Service Team payouts"
        bodyClassName="p-3"
        actions={<>
          {ran && <Button size="sm" icon={<Download size={13} />} onClick={exportPayouts}>Export CSV</Button>}
          <Button size="sm" variant="primary" icon={<Play size={13} />} onClick={() => { setRan(true); toast('Service Team Rules applied to matched lines'); }} disabled={!rows.length}>{ran ? 'Re-run rules' : 'Run Service Team Rules'}</Button>
        </>}
      >
        {!ran || !payouts ? (
          <div className="text-[13px] text-ink-500">
            Runs each matched line through the active <a href={href('/policy-mgmt/rules')} className="text-brand-600 hover:underline">Service Team Rules</a>: the policy’s producer and CSR each earn their split of the line’s commission; the agency retains the remainder. Results update automatically when rules or lines change.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-ink-50 border border-ink-100 rounded px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Agency commission</div><div className="text-base font-semibold tabular-nums">{fmtMoney(payouts.commission, true)}</div></div>
              <div className="bg-ink-50 border border-ink-100 rounded px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Paid to Service Team</div><div className="text-base font-semibold tabular-nums">{fmtMoney(payouts.paid, true)}</div></div>
              <div className="bg-ink-50 border border-ink-100 rounded px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Agency retains</div><div className="text-base font-semibold tabular-nums text-emerald-700">{fmtMoney(payouts.retained, true)}</div></div>
            </div>
            {!payouts.rows.length ? (
              <EmptyState title="No payouts" message={rules.data.some((r) => r.active) ? 'No active rule applies to the producers/CSRs on the matched policies. Check the Service Team Rules or match more lines.' : 'There are no active Service Team Rules yet.'} action={<Button onClick={() => navigate('/policy-mgmt/rules')}>Open Service Team Rules</Button>} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-400">
                      <th className="px-3 py-2 text-left">Team member</th><th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">Commission base</th><th className="px-3 py-2 text-right">Payout</th>
                    </tr></thead>
                    <tbody>
                      {payouts.byStaff.map((b) => (
                        <tr key={b.staff_name} className="border-b border-ink-50"><td className="px-3 py-2 font-semibold">{b.staff_name}</td><td className="px-3 py-2 text-right">{b.lines}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.commission, true)}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(b.payout, true)}</td></tr>
                      ))}
                      <tr className="bg-ink-50/60"><td className="px-3 py-2 font-semibold">Agency (retained)</td><td /><td /><td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(payouts.retained, true)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Per-line breakdown</div>
                  <DataTable columns={payoutLineCols} rows={payouts.rows} dense pageSize={25} initialSort={{ key: 'staff', dir: 'asc' }} />
                </div>
              </>
            )}
          </div>
        )}
      </Panel>

      {editing && <StatementFormModal statement={s} onClose={() => setEditing(false)} />}
      {lineModal && <LineModal statement={s} line={lineModal === 'new' ? null : lineModal} policies={policies.data} accounts={am} onClose={() => setLineModal(null)} />}
      {matching && <MatchModal statement={s} line={matching} policies={policies.data} accounts={am} onClose={() => setMatching(null)} />}
      {importing && <ImportModal statement={s} policies={policies.data} accounts={am} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ── Line add/edit ──

function LineModal({ statement, line, policies, accounts, onClose }: { statement: CommissionStatement; line: CommissionStatementLine | null; policies: Policy[]; accounts: Map<string, Account>; onClose: () => void }) {
  const { toast } = useFeedback();
  const [number, setNumber] = useState(line?.policy_number ?? '');
  const [insured, setInsured] = useState(line?.insured_name ?? '');
  const [type, setType] = useState(line?.transaction_type ?? 'New Business');
  const [premium, setPremium] = useState(line ? String(line.premium) : '');
  const [comm, setComm] = useState(line ? String(line.commission_amount) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const match = matchPolicy(number, statement.carrier, policies);
  const prem = parseAmount(premium);

  const fillFromPolicy = () => {
    if (!match) return;
    if (!insured.trim()) setInsured(insuredName(accounts.get(match.account_id)));
    if (!premium.trim()) setPremium(String(match.premium));
    if (!comm.trim()) setComm(String(cents(commissionOf(prem !== null ? { premium: prem, commission_rate: match.commission_rate } : match))));
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    const c = parseAmount(comm);
    if (!number.trim()) return setError('Enter the policy number as printed on the statement.');
    if (!type.trim()) return setError('Enter the transaction type.');
    if (prem === null) return setError('Enter the premium (negative for a return premium).');
    if (c === null) return setError('Enter the commission amount (negative for a chargeback).');
    setBusy(true);
    try {
      const keepMatch = line?.policy_id && line.policy_number.trim().toLowerCase() === number.trim().toLowerCase();
      const values = {
        statement_id: statement.id, policy_number: number.trim(), insured_name: insured.trim() || (match ? insuredName(accounts.get(match.account_id)) : null),
        transaction_type: type.trim(), premium: cents(prem), commission_amount: cents(c), policy_id: keepMatch ? line!.policy_id : match?.id ?? null,
      };
      if (line) await db.update('commission_statement_lines', line.id, values);
      else await db.insert('commission_statement_lines', values);
      toast(line ? 'Line updated' : `Line added${values.policy_id ? ' and matched' : ''}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={line ? 'Edit statement line' : 'Add statement line'} subtitle={`${statement.carrier} · ${fmtDate(statement.statement_date)}`} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>{line ? 'Save line' : 'Add line'}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Policy number" required hint={number.trim() ? (match ? `Matches ${match.policy_number} · ${insuredName(accounts.get(match.account_id))} · ${match.carrier}` : 'No policy in the book has this number — the line will be unmatched') : undefined}>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} onBlur={fillFromPolicy} autoFocus />
        </Field>
        <Field label="Insured name"><Input value={insured} onChange={(e) => setInsured(e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Transaction" required><Select value={LINE_TX_TYPES.includes(type) ? type : '__other'} onChange={(e) => setType(e.target.value === '__other' ? '' : e.target.value)} options={[...LINE_TX_TYPES, { value: '__other', label: 'Other…' }]} /></Field>
          <Field label="Premium" required><Input value={premium} inputMode="decimal" onChange={(e) => setPremium(e.target.value)} /></Field>
          <Field label="Commission" required hint={match && prem !== null ? `Expected ${fmtMoney(commissionOf({ premium: prem, commission_rate: match.commission_rate }), true)} at ${match.commission_rate}%` : undefined}><Input value={comm} inputMode="decimal" onChange={(e) => setComm(e.target.value)} /></Field>
        </div>
        {!LINE_TX_TYPES.includes(type) && <Field label="Transaction type (other)" required><Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Contingency bonus" /></Field>}
      </div>
    </Modal>
  );
}

// ── Manual match ──

function MatchModal({ statement, line, policies, accounts, onClose }: { statement: CommissionStatement; line: CommissionStatementLine; policies: Policy[]; accounts: Map<string, Account>; onClose: () => void }) {
  const { toast } = useFeedback();
  const [q, setQ] = useState(line.policy_number);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return policies
      .filter((p) => !t || `${p.policy_number} ${insuredName(accounts.get(p.account_id))} ${p.carrier}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.carrier === statement.carrier) - Number(a.carrier === statement.carrier))
      .slice(0, 12);
  }, [q, policies, accounts, statement.carrier]);

  const pick = async (p: Policy) => {
    if (busy) return;
    setBusy(true);
    try {
      await db.update('commission_statement_lines', line.id, { policy_id: p.id, insured_name: line.insured_name || insuredName(accounts.get(p.account_id)) });
      toast(`Matched to ${p.policy_number}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title="Match line to a policy" subtitle={`${line.policy_number} · ${line.insured_name ?? ''} · ${fmtMoney(line.commission_amount, true)}`} size="sm" onClose={onClose}>
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search policy #, insured, carrier…" />
        <div className="border border-ink-100 rounded divide-y divide-ink-50 max-h-80 overflow-y-auto">
          {!list.length && <div className="px-3 py-6 text-center text-[13px] text-ink-400">No policies match.</div>}
          {list.map((p) => (
            <button key={p.id} type="button" disabled={busy} onClick={() => void pick(p)} className="w-full text-left px-3 py-2 bg-transparent hover:bg-brand-50 disabled:opacity-50">
              <div className="text-[13px]"><span className="font-semibold text-brand-600">{p.policy_number}</span> · {insuredName(accounts.get(p.account_id))}</div>
              <div className="text-xs text-ink-400">{p.line_of_business} · {p.carrier}{p.carrier !== statement.carrier ? ' (different carrier)' : ''} · {p.status} · {fmtMoney(p.premium)}</div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── CSV import ──

const REQUIRED_COLS = ['policy_number', 'commission_amount'];
const KNOWN_COLS = ['policy_number', 'insured_name', 'transaction_type', 'premium', 'commission_amount'];

type Parsed = { rows: { row: number; values: Partial<CommissionStatementLine> }[]; errors: { row: number; message: string }[]; headerError: string | null };

function parseStatementCsv(text: string): Parsed {
  const grid = parseCsv(text);
  if (!grid.length) return { rows: [], errors: [], headerError: 'The file is empty.' };
  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/[\s#]+/g, '_').replace(/_+$/, ''));
  const missing = REQUIRED_COLS.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], errors: [], headerError: `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. The first row must be a header: ${KNOWN_COLS.join(', ')}.` };
  const idx = (c: string) => header.indexOf(c);
  const out: Parsed = { rows: [], errors: [], headerError: null };
  grid.slice(1).forEach((cells, i) => {
    const row = i + 2;
    const get = (c: string) => (idx(c) >= 0 ? (cells[idx(c)] ?? '').trim() : '');
    const number = get('policy_number');
    const commission = parseAmount(get('commission_amount'));
    const premiumRaw = get('premium');
    const premium = premiumRaw ? parseAmount(premiumRaw) : 0;
    const problems: string[] = [];
    if (!number) problems.push('policy_number is blank');
    if (commission === null) problems.push(`commission_amount "${get('commission_amount')}" is not a number`);
    if (premium === null) problems.push(`premium "${premiumRaw}" is not a number`);
    if (problems.length) { out.errors.push({ row, message: problems.join('; ') }); return; }
    out.rows.push({ row, values: { policy_number: number, insured_name: get('insured_name') || null, transaction_type: get('transaction_type') || 'New Business', premium: cents(premium!), commission_amount: cents(commission!) } });
  });
  return out;
}

function ImportModal({ statement, policies, accounts, onClose }: { statement: CommissionStatement; policies: Policy[]; accounts: Map<string, Account>; onClose: () => void }) {
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [autoMatch, setAutoMatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => (text.trim() ? parseStatementCsv(text) : null), [text]);

  const readFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError('CSV files must be under 2 MB.'); return; }
    setError(null);
    f.text().then((t) => { setText(t); setFileName(f.name); }).catch((e: Error) => setError(e.message));
  };

  const sample = () => {
    const pick = policies.filter((p) => p.carrier === statement.carrier).slice(0, 3);
    const rows = (pick.length ? pick : policies.slice(0, 3)).map((p) => `${p.policy_number},"${insuredName(accounts.get(p.account_id)).replace(/"/g, '""')}",Renewal,${p.premium},${cents(commissionOf(p))}`);
    setText([KNOWN_COLS.join(','), ...rows].join('\n'));
    setFileName(null);
  };

  const submit = async () => {
    if (busy || !parsed || parsed.headerError || !parsed.rows.length) return;
    setBusy(true);
    setError(null);
    try {
      const values = parsed.rows.map(({ values: v }) => {
        const p = autoMatch ? matchPolicy(v.policy_number!, statement.carrier, policies) : undefined;
        return { ...v, statement_id: statement.id, policy_id: p?.id ?? null, insured_name: v.insured_name || (p ? insuredName(accounts.get(p.account_id)) : null) };
      });
      await db.insertMany('commission_statement_lines', values);
      const matched = values.filter((v) => v.policy_id).length;
      toast(`Imported ${values.length} line${values.length === 1 ? '' : 's'}${autoMatch ? ` · ${matched} matched` : ''}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Import statement lines" subtitle={`${statement.carrier} · ${fmtDate(statement.statement_date)}`} size="md" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" icon={<Upload size={14} />} loading={busy} disabled={!parsed || !!parsed.headerError || !parsed.rows.length} onClick={() => void submit()}>
        Import {parsed && !parsed.headerError ? `${parsed.rows.length} valid row${parsed.rows.length === 1 ? '' : 's'}` : ''}
      </Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="text-[13px] text-ink-600">
          CSV with a header row. Columns: <code className="text-xs bg-ink-50 px-1 rounded">{KNOWN_COLS.join(', ')}</code> — <b>policy_number</b> and <b>commission_amount</b> are required; negative amounts for return premium / chargebacks.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
          <Button size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
          <Button size="sm" variant="ghost" onClick={sample}>Insert example</Button>
          {fileName && <span className="text-xs text-ink-500">{fileName}</span>}
        </div>
        <Field label="Or paste CSV">
          <textarea className="w-full min-h-[120px] rounded border border-ink-200 bg-white px-2.5 py-2 text-xs font-mono text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" value={text} onChange={(e) => { setText(e.target.value); setFileName(null); }} placeholder={`${KNOWN_COLS.join(',')}\nPA-1234567,Jane Doe,Renewal,1200.00,144.00`} />
        </Field>
        {parsed && (parsed.headerError ? <ErrorBanner message={parsed.headerError} /> : (
          <div className="text-[13px] space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{parsed.rows.length} valid</Badge>
              {parsed.errors.length > 0 && <Badge tone="red">{parsed.errors.length} with errors (skipped)</Badge>}
              <Badge>{fmtMoney(cents(parsed.rows.reduce((t, r) => t + Number(r.values.commission_amount ?? 0), 0)), true)} commission</Badge>
            </div>
            {parsed.errors.length > 0 && (
              <ul className="max-h-32 overflow-y-auto border border-red-100 bg-red-50 rounded px-3 py-2 text-xs text-red-700 space-y-0.5">
                {parsed.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
              </ul>
            )}
          </div>
        ))}
        <Checkbox label="Match lines to policies by policy number" checked={autoMatch} onChange={setAutoMatch} />
      </div>
    </Modal>
  );
}
