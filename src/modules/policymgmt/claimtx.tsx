import { Banknote, Download, Plus, Receipt, RotateCcw, ShieldAlert, Trash2, Undo2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Modal, PageHeader, Panel, Pills, SearchInput, Select, StatCard, Textarea, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { downloadCsv, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Account, Claim, ClaimTransaction, ClaimTransactionType } from '@/lib/types';
import { CLAIM_TX_HINTS, CLAIM_TX_TONES, CLAIM_TX_TYPES, cents, claimTxTotals, insuredName, parseAmount } from './shared';

type Row = ClaimTransaction & { claim?: Claim; account?: Account; insured: string; claimNo: string };

const claimNo = (c: Claim | undefined) => (c ? c.claim_number || 'Pending claim #' : 'Deleted claim');

function useClaimTxRows(claimId?: string) {
  const txs = useTable('claim_transactions', claimId ? { eq: { claim_id: claimId }, order: { column: 'transaction_date', ascending: false } } : { order: { column: 'transaction_date', ascending: false } });
  const claims = useTable('claims', claimId ? { eq: { id: claimId } } : { order: { column: 'date_of_loss', ascending: false } });
  const accounts = useTable('accounts');
  const rows = useMemo<Row[]>(() => {
    const cm = new Map(claims.data.map((c) => [c.id, c]));
    const am = new Map(accounts.data.map((a) => [a.id, a]));
    return txs.data.map((t) => {
      const claim = cm.get(t.claim_id);
      const account = am.get(t.account_id);
      return { ...t, claim, account, insured: insuredName(account), claimNo: claimNo(claim) };
    });
  }, [txs.data, claims.data, accounts.data]);
  return { rows, txs, claims, accounts, error: txs.error || claims.error || accounts.error };
}

/** Applies (sign = 1) or reverses (sign = -1) a transaction's effect on the claim's financials. */
async function applyToClaim(claim: Claim, type: ClaimTransactionType, amount: number, sign: 1 | -1, remaining: ClaimTransaction[]) {
  if (type === 'Payment') {
    await db.update('claims', claim.id, { amount_paid: Math.max(0, cents(Number(claim.amount_paid ?? 0) + sign * amount)) });
  } else if (type === 'Recovery') {
    await db.update('claims', claim.id, { amount_paid: Math.max(0, cents(Number(claim.amount_paid ?? 0) - sign * amount)) });
  } else if (type === 'Reserve') {
    if (sign === 1) await db.update('claims', claim.id, { amount_reserved: amount });
    else {
      // Removing a reserve change: fall back to the latest remaining reserve entry.
      const prev = remaining.filter((t) => t.type === 'Reserve').sort((a, b) => `${b.transaction_date}|${b.created_at}`.localeCompare(`${a.transaction_date}|${a.created_at}`))[0];
      await db.update('claims', claim.id, { amount_reserved: prev ? Number(prev.amount) : null });
    }
  }
}

function claimTxColumns(showClaim: boolean, onDelete: (r: Row) => void): Column<Row>[] {
  return [
    { key: 'date', header: 'Date', sortValue: (r) => `${r.transaction_date}|${r.created_at}`, render: (r) => <span className="whitespace-nowrap">{fmtDate(r.transaction_date)}</span> },
    ...(showClaim ? [
      { key: 'claim', header: 'Claim #', sortValue: (r: Row) => r.claimNo, render: (r: Row) => (r.claim ? <a href={href(`/claims/${r.claim.id}`)} className="font-semibold text-brand-600 hover:underline whitespace-nowrap">{r.claimNo}</a> : <span className="text-ink-400">{r.claimNo}</span>) },
      { key: 'insured', header: 'Insured', sortValue: (r: Row) => r.insured, render: (r: Row) => <a href={href(`/accounts/${r.account_id}`)} className="hover:text-brand-600 hover:underline whitespace-nowrap">{r.insured}</a> },
    ] as Column<Row>[] : []),
    { key: 'type', header: 'Type', sortValue: (r) => r.type, render: (r) => <Badge tone={CLAIM_TX_TONES[r.type] ?? 'gray'}>{r.type}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => Number(r.amount), render: (r) => <span className={r.type === 'Recovery' ? 'tabular-nums text-emerald-700' : 'tabular-nums'}>{r.type === 'Recovery' ? '−' : ''}{fmtMoney(r.amount, true)}</span> },
    { key: 'desc', header: 'Description', render: (r) => <span className="block max-w-[320px] truncate text-ink-500" title={r.description ?? ''}>{r.description || '—'}</span> },
    { key: 'actions', header: '', align: 'right', render: (r) => <IconButton label="Delete transaction" onClick={(e) => { e.stopPropagation(); onDelete(r); }}><Trash2 size={14} /></IconButton> },
  ];
}

function useDelete() {
  const { confirm, toast } = useFeedback();
  const { me } = useAppData();
  return async (r: Row) => {
    const ok = await confirm({
      title: 'Delete claim transaction?',
      message: `${r.type} of ${fmtMoney(r.amount, true)} on ${fmtDate(r.transaction_date)} will be removed${r.claim && r.type !== 'Expense' ? ' and its effect on the claim’s reserve/paid amounts reversed' : ''}.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await db.remove('claim_transactions', r.id);
      const claim = r.claim ? await db.get('claims', r.claim.id) : null;
      if (claim) {
        const remaining = await db.list('claim_transactions', { eq: { claim_id: claim.id } });
        await applyToClaim(claim, r.type, Number(r.amount), -1, remaining);
      }
      await logActivity({ account_id: r.account_id, policy_id: r.claim?.policy_id ?? null, assigned_to: me?.name ?? null, subject: `Claim ${r.claimNo}: ${r.type.toLowerCase()} of ${fmtMoney(r.amount, true)} deleted` }).catch(() => {});
      toast('Transaction deleted');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
}

export function ClaimTransactionsPage() {
  const { toast } = useFeedback();
  const { rows, txs, claims, error } = useClaimTxRows();
  const [type, setType] = useState<'all' | ClaimTransactionType>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [adding, setAdding] = useState(false);
  const onDelete = useDelete();
  const columns = claimTxColumns(true, onDelete);

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && r.transaction_date < from) return false;
      if (to && r.transaction_date > to) return false;
      if (term && !`${r.claimNo} ${r.insured} ${r.description ?? ''} ${r.claim?.loss_type ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, q, from, to]);
  const filtered = useMemo(() => (type === 'all' ? base : base.filter((r) => r.type === type)), [base, type]);
  const totals = useMemo(() => claimTxTotals(base), [base]);
  const filtersActive = !!(q || from || to || type !== 'all');
  const clear = () => { setQ(''); setFrom(''); setTo(''); setType('all'); };

  const exportCsv = () => {
    if (!filtered.length) { toast('No transactions to export', 'info'); return; }
    downloadCsv(`claim-transactions-${today()}.csv`, filtered.map((r) => ({
      Date: r.transaction_date, 'Claim #': r.claimNo, Insured: r.insured, 'Loss Type': r.claim?.loss_type ?? '', Type: r.type, Amount: r.amount, Description: r.description ?? '',
    })));
    toast(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`);
  };

  return (
    <div>
      <PageHeader
        title="Claim Transactions"
        subtitle="Reserves, loss payments, expenses and recoveries recorded against claims"
        icon={<Receipt size={20} />}
        actions={<>
          <Button icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)} disabled={!claims.data.length && !claims.loading}>Add transaction</Button>
        </>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Current reserves" value={fmtMoney(totals.reserves)} hint="Latest reserve per claim" icon={<Wallet size={18} />} tone="blue" />
        <StatCard label="Paid" value={fmtMoney(totals.paid)} icon={<Banknote size={18} />} tone="green" />
        <StatCard label="Expenses" value={fmtMoney(totals.expense)} icon={<Receipt size={18} />} tone="amber" />
        <StatCard label="Recoveries" value={fmtMoney(totals.recovery)} icon={<Undo2 size={18} />} tone="purple" />
        <StatCard label="Net incurred" value={fmtMoney(totals.incurred)} hint="Net paid + outstanding + expenses" icon={<ShieldAlert size={18} />} tone="red" />
      </div>
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100 space-y-3">
          <div className="overflow-x-auto">
            <Pills value={type} onChange={setType} options={[{ value: 'all' as const, label: 'All', count: base.length }, ...CLAIM_TX_TYPES.map((t) => ({ value: t, label: t, count: base.filter((r) => r.type === t).length }))]} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,2fr)_150px_150px_auto] gap-2 items-end">
            <SearchInput value={q} onChange={setQ} placeholder="Search claim #, insured, description…" />
            <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!filtersActive} onClick={clear}>Clear</Button>
          </div>
        </div>
        <div className="p-3">
          <ErrorBanner message={error} />
          <DataTable
            columns={columns}
            rows={filtered}
            loading={txs.loading}
            dense
            initialSort={{ key: 'date', dir: 'desc' }}
            empty={<EmptyState icon={<Receipt size={22} />} title={txs.data.length ? 'No transactions match' : 'No claim transactions yet'} message={txs.data.length ? 'Adjust or clear the filters.' : 'Record reserves and payments as the carrier reports them.'} action={filtersActive ? <Button onClick={clear}>Clear filters</Button> : claims.data.length ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add transaction</Button> : undefined} />}
          />
        </div>
      </Panel>
      {adding && <ClaimTxModal claims={claims.data} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Claim transactions for one claim, embedded on the claim detail page. */
export function ClaimTransactionsPanel({ claimId }: { claimId: string }) {
  const { rows, txs, claims, error } = useClaimTxRows(claimId);
  const [adding, setAdding] = useState(false);
  const onDelete = useDelete();
  const columns = claimTxColumns(false, onDelete);
  const totals = useMemo(() => claimTxTotals(rows), [rows]);
  return (
    <Panel
      title="Claim Transactions"
      className="mb-4"
      bodyClassName="p-3"
      actions={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setAdding(true)} disabled={!claims.data.length}>Add transaction</Button>}
    >
      <ErrorBanner message={error} />
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-[13px]">
          {([['Reserve', totals.reserves], ['Paid', totals.paid], ['Expenses', totals.expense], ['Recoveries', totals.recovery], ['Net incurred', totals.incurred]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="bg-ink-50 border border-ink-100 rounded px-2.5 py-1.5 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
              <div className="font-semibold tabular-nums">{fmtMoney(v, true)}</div>
            </div>
          ))}
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={txs.loading}
        dense
        pageSize={10}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<EmptyState icon={<Receipt size={22} />} title="No transactions on this claim" message="Record the carrier’s reserve, payments, expenses and recoveries." />}
      />
      {adding && <ClaimTxModal claims={claims.data} fixedClaimId={claimId} onClose={() => setAdding(false)} />}
    </Panel>
  );
}

function ClaimTxModal({ claims, fixedClaimId, onClose }: { claims: Claim[]; fixedClaimId?: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const { me } = useAppData();
  const accounts = useTable('accounts');
  const [claimId, setClaimId] = useState(fixedClaimId ?? '');
  const [type, setType] = useState<ClaimTransactionType>('Payment');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const am = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const options = claims.map((c) => ({ value: c.id, label: `${claimNo(c)} · ${insuredName(am.get(c.account_id))} · ${c.loss_type} (${fmtDate(c.date_of_loss)})` }));
  const claim = claims.find((c) => c.id === claimId);
  const amt = parseAmount(amount);

  const preview = (() => {
    if (!claim || amt === null || amt <= 0) return null;
    const paid = Number(claim.amount_paid ?? 0);
    if (type === 'Reserve') return `Reserve: ${fmtMoney(claim.amount_reserved, true)} → ${fmtMoney(amt, true)}`;
    if (type === 'Payment') return `Paid: ${fmtMoney(paid, true)} → ${fmtMoney(cents(paid + amt), true)}`;
    if (type === 'Recovery') return `Paid: ${fmtMoney(paid, true)} → ${fmtMoney(Math.max(0, cents(paid - amt)), true)}`;
    return 'Claim reserve and paid amounts are unchanged.';
  })();

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!claim) return setError('Choose the claim.');
    if (amt === null || amt <= 0) return setError('Enter an amount greater than zero.');
    if (!date) return setError('Enter the transaction date.');
    if (date > today()) return setError('The transaction date cannot be in the future.');
    setBusy(true);
    try {
      await db.insert('claim_transactions', { claim_id: claim.id, account_id: claim.account_id, type, amount: cents(amt), transaction_date: date, description: desc.trim() || null });
      const fresh = (await db.get('claims', claim.id)) ?? claim;
      await applyToClaim(fresh, type, cents(amt), 1, []);
      await logActivity({
        account_id: claim.account_id, policy_id: claim.policy_id, assigned_to: me?.name ?? null,
        subject: `Claim ${claimNo(claim)}: ${type.toLowerCase()} of ${fmtMoney(amt, true)} recorded`,
        description: desc.trim() || null,
      }).catch(() => {});
      toast(`${type} recorded`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Add claim transaction" subtitle={claim ? `${claimNo(claim)} · ${insuredName(am.get(claim.account_id))}` : undefined} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>Save transaction</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!fixedClaimId && (
          <Field label="Claim" required><Select value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="Select a claim" options={options} /></Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" required hint={CLAIM_TX_HINTS[type]} className="col-span-2 sm:col-span-1"><Select value={type} onChange={(e) => setType(e.target.value as ClaimTransactionType)} options={CLAIM_TX_TYPES} /></Field>
          <Field label="Amount" required className="col-span-2 sm:col-span-1"><Input value={amount} inputMode="decimal" placeholder="0.00" onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date" required className="col-span-2 sm:col-span-1"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Body shop payment — check #10442" /></Field>
        {preview && <div className="text-xs bg-ink-50 border border-ink-100 rounded px-3 py-2 text-ink-600">{preview}</div>}
      </div>
    </Modal>
  );
}
