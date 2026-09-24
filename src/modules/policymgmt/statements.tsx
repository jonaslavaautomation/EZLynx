import { FileSpreadsheet, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Panel, Pills, Select, StatCard, Textarea, useFeedback, type Column } from '@/components/ui';
import { CarrierSelect } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { CommissionStatement, StatementStatus } from '@/lib/types';
import { STATEMENT_STATUSES, STATEMENT_TONES, cents, parseAmount } from './shared';

type Row = CommissionStatement & { lines: number; matched: number; lineTotal: number };

export function StatementsPage() {
  const statements = useTable('commission_statements', { order: { column: 'statement_date', ascending: false } });
  const lines = useTable('commission_statement_lines');
  const [status, setStatus] = useState<'all' | StatementStatus>('all');
  const [carrier, setCarrier] = useState('');
  const [adding, setAdding] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const agg = new Map<string, { lines: number; matched: number; total: number }>();
    for (const l of lines.data) {
      const a = agg.get(l.statement_id) ?? { lines: 0, matched: 0, total: 0 };
      a.lines += 1;
      if (l.policy_id) a.matched += 1;
      a.total += Number(l.commission_amount) || 0;
      agg.set(l.statement_id, a);
    }
    return statements.data.map((s) => {
      const a = agg.get(s.id);
      return { ...s, lines: a?.lines ?? 0, matched: a?.matched ?? 0, lineTotal: cents(a?.total ?? 0) };
    });
  }, [statements.data, lines.data]);

  const carriers = useMemo(() => [...new Set(statements.data.map((s) => s.carrier))].sort(), [statements.data]);
  const filtered = rows.filter((r) => (status === 'all' || r.status === status) && (!carrier || r.carrier === carrier));
  const openRows = rows.filter((r) => r.status === 'Open');

  const columns: Column<Row>[] = [
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.carrier, render: (r) => <span className="font-semibold text-brand-600 whitespace-nowrap">{r.carrier}</span> },
    { key: 'date', header: 'Statement date', sortValue: (r) => r.statement_date, render: (r) => <span className="whitespace-nowrap">{fmtDate(r.statement_date)}</span> },
    { key: 'period', header: 'Period', sortValue: (r) => r.period_start, render: (r) => <span className="whitespace-nowrap">{r.period_start || r.period_end ? `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}` : '—'}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (r) => Number(r.total_amount), render: (r) => <span className="tabular-nums">{fmtMoney(r.total_amount, true)}</span> },
    { key: 'lines', header: 'Lines', align: 'right', sortValue: (r) => r.lines, render: (r) => r.lines },
    { key: 'matched', header: 'Matched', align: 'right', sortValue: (r) => (r.lines ? r.matched / r.lines : -1), render: (r) => (r.lines ? <span className={r.matched < r.lines ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>{Math.round((r.matched / r.lines) * 100)}%</span> : '—') },
    { key: 'diff', header: 'Difference', align: 'right', sortValue: (r) => cents(Number(r.total_amount) - r.lineTotal), render: (r) => { const d = cents(Number(r.total_amount) - r.lineTotal); return <span className={d !== 0 ? 'tabular-nums text-red-600 font-semibold' : 'tabular-nums text-ink-400'}>{fmtMoney(d, true)}</span>; } },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <Badge tone={STATEMENT_TONES[r.status] ?? 'gray'}>{r.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Commission Statements" subtitle="Enter carrier commission statements, reconcile them against the book, then run Service Team Rules" icon={<FileSpreadsheet size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>New statement</Button>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Open statements" value={openRows.length} hint={fmtMoney(openRows.reduce((s, r) => s + Number(r.total_amount), 0), true)} icon={<FileSpreadsheet size={18} />} tone="blue" onClick={() => setStatus('Open')} />
        <StatCard label="Reconciled (not posted)" value={rows.filter((r) => r.status === 'Reconciled').length} icon={<FileSpreadsheet size={18} />} tone="amber" onClick={() => setStatus('Reconciled')} />
        <StatCard label="Posted commission" value={fmtMoney(rows.filter((r) => r.status === 'Posted').reduce((s, r) => s + Number(r.total_amount), 0), true)} icon={<FileSpreadsheet size={18} />} tone="green" onClick={() => setStatus('Posted')} />
      </div>
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100 flex flex-wrap items-center gap-2">
          <Pills value={status} onChange={setStatus} options={[{ value: 'all' as const, label: 'All', count: rows.length }, ...STATEMENT_STATUSES.map((s) => ({ value: s, label: s, count: rows.filter((r) => r.status === s).length }))]} />
          <Select className="sm:w-56" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="All carriers" options={carriers} aria-label="Carrier" />
          <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={status === 'all' && !carrier} onClick={() => { setStatus('all'); setCarrier(''); }}>Clear</Button>
        </div>
        <div className="p-3">
          <ErrorBanner message={statements.error || lines.error} />
          <DataTable columns={columns} rows={filtered} loading={statements.loading} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(r) => navigate(`/policy-mgmt/statements/${r.id}`)}
            empty={<EmptyState icon={<FileSpreadsheet size={22} />} title={rows.length ? 'No statements match' : 'No commission statements yet'} message={rows.length ? 'Change the filters.' : 'Enter the statement a carrier sent, then add or import its lines.'} action={!rows.length ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>New statement</Button> : undefined} />} />
        </div>
      </Panel>
      {adding && <StatementFormModal onClose={() => setAdding(false)} onSaved={(s) => navigate(`/policy-mgmt/statements/${s.id}`)} />}
    </div>
  );
}

export function StatementFormModal({ statement, onClose, onSaved }: { statement?: CommissionStatement; onClose: () => void; onSaved?: (s: CommissionStatement) => void }) {
  const { toast } = useFeedback();
  const { carriers } = useAppData();
  const [carrier, setCarrier] = useState(statement?.carrier ?? '');
  const [date, setDate] = useState(statement?.statement_date ?? today());
  const [start, setStart] = useState(statement?.period_start ?? '');
  const [end, setEnd] = useState(statement?.period_end ?? '');
  const [total, setTotal] = useState(statement ? String(statement.total_amount) : '');
  const [notes, setNotes] = useState(statement?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(total);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!carrier) return setError('Choose the carrier.');
    if (!date) return setError('Enter the statement date.');
    if (start && end && end < start) return setError('Period end must be on or after the period start.');
    if (amount === null) return setError('Enter the statement total (as printed on the carrier statement).');
    setBusy(true);
    try {
      const values = { carrier, statement_date: date, period_start: start || null, period_end: end || null, total_amount: cents(amount), notes: notes.trim() || null };
      const saved = statement ? await db.update('commission_statements', statement.id, values) : await db.insert('commission_statements', { ...values, status: 'Open' });
      toast(statement ? 'Statement updated' : 'Statement created');
      onClose();
      onSaved?.(saved);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={statement ? 'Edit statement' : 'New commission statement'} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>{statement ? 'Save' : 'Create statement'}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Carrier" required>{carriers.length ? <CarrierSelect value={carrier} onChange={setCarrier} /> : <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />}</Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Statement date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Period start"><Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Period end"><Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Statement total" required hint="Total commission the carrier is paying on this statement"><Input value={total} inputMode="decimal" placeholder="0.00" onChange={(e) => setTotal(e.target.value)} /></Field>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
