import { ArrowRight, Check, Plus, Repeat2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Panel, SearchInput, Select, StatusBadge, Textarea, useFeedback, type Column } from '@/components/ui';
import { CarrierSelect } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { addTransaction, createPolicy, generatePolicyNumber, logActivity } from '@/lib/domain';
import { addMonths, fmtDate, fmtMoney, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, Policy } from '@/lib/types';
import { TERM_OPTIONS, cents, insuredName, parseAmount, proRataReturn, signedMoney } from './shared';

type RewriteRow = { id: string; neu: Policy; old?: Policy; account?: Account; insured: string };

export function RewritesPage() {
  const policies = useTable('policies');
  const accounts = useTable('accounts');
  const [open, setOpen] = useState(false);

  const rows = useMemo<RewriteRow[]>(() => {
    const pm = new Map(policies.data.map((p) => [p.id, p]));
    const am = new Map(accounts.data.map((a) => [a.id, a]));
    return policies.data.filter((p) => p.rewritten_from_policy_id).map((p) => {
      const account = am.get(p.account_id);
      return { id: p.id, neu: p, old: pm.get(p.rewritten_from_policy_id!), account, insured: insuredName(account) };
    });
  }, [policies.data, accounts.data]);

  const columns: Column<RewriteRow>[] = [
    { key: 'date', header: 'Rewrite date', sortValue: (r) => r.neu.effective_date, render: (r) => <span className="whitespace-nowrap">{fmtDate(r.neu.effective_date)}</span> },
    { key: 'insured', header: 'Insured', sortValue: (r) => r.insured, render: (r) => <a href={href(`/accounts/${r.neu.account_id}`)} onClick={(e) => e.stopPropagation()} className="hover:text-brand-600 hover:underline whitespace-nowrap">{r.insured}</a> },
    { key: 'lob', header: 'Line', sortValue: (r) => r.neu.line_of_business, render: (r) => <span className="whitespace-nowrap">{r.neu.line_of_business}</span> },
    {
      key: 'change', header: 'Old → New', render: (r) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          {r.old ? <a href={href(`/policies/${r.old.id}`)} onClick={(e) => e.stopPropagation()} className="text-ink-600 hover:text-brand-600 hover:underline">{r.old.policy_number} <span className="text-ink-400">({r.old.carrier})</span></a> : <span className="text-ink-400">Deleted policy</span>}
          <ArrowRight size={13} className="text-ink-400 shrink-0" />
          <a href={href(`/policies/${r.neu.id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline">{r.neu.policy_number} <span className="font-normal text-ink-500">({r.neu.carrier})</span></a>
        </div>
      ),
    },
    { key: 'carrierChange', header: 'Carrier change', render: (r) => (r.old && r.old.carrier !== r.neu.carrier ? <Badge tone="purple">New carrier</Badge> : <Badge>Same carrier</Badge>) },
    { key: 'premium', header: 'New premium', align: 'right', sortValue: (r) => Number(r.neu.premium), render: (r) => <span className="tabular-nums">{fmtMoney(r.neu.premium)}</span> },
    { key: 'diff', header: 'Δ vs old', align: 'right', sortValue: (r) => (r.old ? Number(r.neu.premium) - Number(r.old.premium) : null), render: (r) => (r.old ? <span className="tabular-nums">{signedMoney(cents(Number(r.neu.premium) - Number(r.old.premium)), fmtMoney)}</span> : '—') },
    { key: 'status', header: 'Status', sortValue: (r) => r.neu.status, render: (r) => <StatusBadge status={r.neu.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Policy Rewrites"
        subtitle="Replace an in-force policy with a new one (new policy number and/or carrier) while keeping the history linked"
        icon={<Repeat2 size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Rewrite a policy</Button>}
      />
      <Panel title="Rewritten policies" bodyClassName="p-3">
        <ErrorBanner message={policies.error || accounts.error} />
        <DataTable
          columns={columns}
          rows={rows}
          loading={policies.loading}
          initialSort={{ key: 'date', dir: 'desc' }}
          onRowClick={(r) => navigate(`/policies/${r.neu.id}`)}
          empty={<EmptyState icon={<Repeat2 size={22} />} title="No rewrites yet" message="Rewrite a policy to move it to a new carrier or policy number mid-term. The original is cancelled pro-rata and linked to its replacement." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Rewrite a policy</Button>} />}
        />
      </Panel>
      {open && <RewriteModal policies={policies.data} accounts={accounts.data} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Wizard ──

type Progress = { policy?: Policy; nbRemoved?: boolean; rewriteTx?: boolean; oldCancelled?: boolean; cancelTx?: boolean };

function RewriteModal({ policies, accounts, onClose }: { policies: Policy[]; accounts: Account[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const { me, carriers } = useAppData();
  const [old, setOld] = useState<Policy | null>(null);
  const [q, setQ] = useState('');
  const [date, setDate] = useState(today());
  const [carrier, setCarrier] = useState('');
  const [number, setNumber] = useState('');
  const [premium, setPremium] = useState('');
  const [term, setTerm] = useState('12');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const progress = useRef<Progress>({});

  const am = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const candidates = useMemo(() => {
    const term = q.trim().toLowerCase();
    return policies
      .filter((p) => p.status === 'Active')
      .filter((p) => !term || `${p.policy_number} ${p.carrier} ${p.line_of_business} ${insuredName(am.get(p.account_id))}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [policies, q, am]);

  const choose = (p: Policy) => {
    setOld(p);
    setCarrier(p.carrier);
    setPremium(String(p.premium));
    setTerm(String(p.term_months === 6 ? 6 : 12));
    const d = today() < p.effective_date ? p.effective_date : today() > p.expiration_date ? p.expiration_date : today();
    setDate(d);
    setError(null);
  };

  const prem = parseAmount(premium);
  const unearned = old && date ? proRataReturn(old, date) : 0;
  const locked = !!progress.current.policy; // once the new policy exists, its inputs can't change

  const submit = async () => {
    if (busy || !old) return;
    setError(null);
    if (!date) return setError('Enter the rewrite effective date.');
    if (date < old.effective_date || date > old.expiration_date) return setError(`The rewrite date must fall within the current term (${fmtDate(old.effective_date)} – ${fmtDate(old.expiration_date)}).`);
    if (!carrier) return setError('Choose the new carrier.');
    if (prem === null || prem < 0) return setError('Enter a valid premium for the new policy.');
    if (!reason.trim()) return setError('Enter the reason for the rewrite.');
    const num = number.trim();
    if (num && policies.some((p) => p.policy_number.toLowerCase() === num.toLowerCase() && p.id !== progress.current.policy?.id)) return setError(`Policy number ${num} is already in use.`);
    setBusy(true);
    const st = progress.current;
    try {
      const newCarrier = carriers.find((c) => c.name === carrier);
      // Each step is recorded so a retry after a partial failure resumes instead of duplicating.
      if (!st.policy) {
        st.policy = await createPolicy({
          account_id: old.account_id, line_of_business: old.line_of_business, carrier, status: 'Active', effective_date: date,
          expiration_date: addMonths(date, Number(term)), term_months: Number(term), premium: prem!,
          commission_rate: carrier === old.carrier ? old.commission_rate : newCarrier?.commission_rate ?? old.commission_rate,
          billing_type: old.billing_type, payment_plan: old.payment_plan, source: 'Manual', producer: old.producer,
          coverages: (old.coverages ?? []).map((c) => ({ ...c })), notes: old.notes,
          policy_number: num || generatePolicyNumber(old.line_of_business), rewritten_from_policy_id: old.id,
        });
      }
      const neu = st.policy;
      if (!st.nbRemoved) {
        // createPolicy records a New Business transaction; a rewrite is recorded as 'Rewrite' instead so premium isn't counted twice.
        const nb = await db.list('policy_transactions', { eq: { policy_id: neu.id, type: 'New Business' } });
        for (const t of nb) await db.remove('policy_transactions', t.id);
        st.nbRemoved = true;
      }
      if (!st.rewriteTx) {
        await addTransaction(neu, 'Rewrite', date, prem!, `Rewrite of ${old.policy_number} (${old.carrier}) — ${reason.trim()}`);
        st.rewriteTx = true;
      }
      if (!st.oldCancelled) {
        await db.update('policies', old.id, { status: 'Cancelled' });
        st.oldCancelled = true;
      }
      if (!st.cancelTx) {
        await addTransaction(old, 'Cancellation', date, -unearned, `Rewritten to ${neu.policy_number} (${neu.carrier}) effective ${fmtDate(date)}. Pro-rata return ${fmtMoney(unearned, true)}.`);
        st.cancelTx = true;
      }
      await logActivity({
        account_id: old.account_id, policy_id: neu.id, assigned_to: me?.name ?? null,
        subject: `Policy rewritten — ${old.policy_number} → ${neu.policy_number}`,
        description: `${old.line_of_business}: ${old.carrier} ${old.policy_number} replaced by ${neu.carrier} ${neu.policy_number} effective ${fmtDate(date)}. New premium ${fmtMoney(prem!, true)}. Reason: ${reason.trim()}`,
      }).catch(() => {});
      toast(`Rewritten to ${neu.policy_number}`);
      onClose();
      navigate(`/policies/${neu.id}`);
    } catch (e) {
      setError(`${(e as Error).message}${st.policy ? ' — the new policy was created; press Rewrite again to finish the remaining steps.' : ''}`);
      setBusy(false);
    }
  };

  const account = old ? am.get(old.account_id) : undefined;

  return (
    <Modal title="Rewrite a policy" subtitle={old ? `${old.policy_number} · ${old.line_of_business} · ${insuredName(account)}` : 'Step 1: choose the in-force policy to replace'} size="md" onClose={busy ? () => {} : onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      {old && <Button variant="primary" icon={<Repeat2 size={15} />} loading={busy} onClick={() => void submit()}>{locked ? 'Finish rewrite' : 'Rewrite policy'}</Button>}
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!old ? (
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search active policies by number, insured, carrier…" />
            <div className="border border-ink-100 rounded divide-y divide-ink-50 max-h-80 overflow-y-auto">
              {candidates.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-ink-400">No active policies match.</div>}
              {candidates.map((p) => (
                <button key={p.id} type="button" onClick={() => choose(p)} className="w-full text-left px-3 py-2 bg-transparent hover:bg-brand-50 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-semibold text-[13px] text-brand-600">{p.policy_number}</span>
                  <span className="text-[13px] text-ink-900">{insuredName(am.get(p.account_id))}</span>
                  <span className="text-xs text-ink-400">{p.line_of_business} · {p.carrier} · {fmtDate(p.effective_date)} – {fmtDate(p.expiration_date)} · {fmtMoney(p.premium)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-ink-50 border border-ink-100 rounded px-3 py-2.5 text-[13px]">
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Current</div><div className="font-semibold truncate">{old.carrier}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Term</div><div className="font-semibold">{fmtDate(old.effective_date)} – {fmtDate(old.expiration_date)}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Premium</div><div className="font-semibold tabular-nums">{fmtMoney(old.premium, true)}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Unearned (pro-rata)</div><div className="font-semibold tabular-nums">{fmtMoney(unearned, true)}</div></div>
            </div>
            {!locked && <button type="button" className="text-xs text-brand-600 hover:underline bg-transparent inline-flex items-center gap-1" onClick={() => setOld(null)}><X size={12} /> Choose a different policy</button>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Rewrite effective date" required hint="Old policy is cancelled and the new one starts on this date"><Input type="date" value={date} disabled={locked} min={old.effective_date} max={old.expiration_date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="New carrier" required>{locked ? <Input value={carrier} disabled readOnly /> : <CarrierSelect value={carrier} onChange={setCarrier} line={old.line_of_business} />}</Field>
              <Field label="New policy number" hint="Leave blank to generate one"><Input value={number} disabled={locked} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generate" /></Field>
              <Field label="New premium" required><Input value={premium} disabled={locked} inputMode="decimal" onChange={(e) => setPremium(e.target.value)} /></Field>
              <Field label="Term"><Select value={term} disabled={locked} onChange={(e) => setTerm(e.target.value)} options={TERM_OPTIONS} /></Field>
              <Field label="New expiration"><Input value={date ? fmtDate(addMonths(date, Number(term))) : '—'} disabled readOnly /></Field>
              <Field label="Reason for rewrite" required className="sm:col-span-2"><Textarea rows={2} value={reason} disabled={locked} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Better rate with new carrier; change of named insured; coverage restructure" /></Field>
            </div>
            <ul className="text-xs text-ink-500 space-y-1">
              <li className="flex gap-1.5"><Check size={13} className="text-emerald-600 shrink-0 mt-px" /> {old.policy_number} is set to Cancelled with a {fmtMoney(unearned, true)} pro-rata return.</li>
              <li className="flex gap-1.5"><Check size={13} className="text-emerald-600 shrink-0 mt-px" /> A new {old.line_of_business} policy is created with {carrier || 'the new carrier'}, copying coverages{old.billing_type === 'Agency Bill' ? ' and invoicing the premium (Agency Bill)' : ''}, linked to the original.</li>
              {prem !== null && <li className="flex gap-1.5"><Check size={13} className="text-emerald-600 shrink-0 mt-px" /> Premium change vs. current term: {signedMoney(cents(prem - Number(old.premium)), fmtMoney)}.</li>}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
