import {
  CheckCircle2, ChevronDown, ChevronUp, Clock, ClipboardList, DollarSign, ExternalLink, FileText, Gauge, HeartPulse, Landmark, Loader2, PawPrint,
  ShieldCheck, Siren, Truck, Umbrella, User, UserPlus, Waves,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Modal, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { addDays, fmtDateTime, fmtMoney, today } from '@/lib/format';
import { href, navigate } from '@/lib/router';
import type { CarrierRate } from '@/lib/types';
import type { RatedCarrier } from '@/modules/quotes/rating';
import { OInput, TextBtn } from '@/modules/accounts/applicant-fields';
import { useUserPreferences } from '@/modules/usersettings/data';
import { CarrierMark, Notice, Switch, useWf } from './fields';
import { STEPS, accuracyItems, type StepKey } from './model';
import { PAY_LABEL, median, money2, planPrice, type PayPlan } from './rate';

const STEP_ICON: Record<StepKey, typeof Gauge> = { rating: Gauge, policy: ClipboardList, drivers: User, vehicles: Truck, incidents: Siren, coverage: ShieldCheck, carrier: FileText, review: CheckCircle2 };

// ── Step 8: Invalid / review ──

function SsnModal({ onClose }: { onClose: () => void }) {
  const { w, up, account } = useWf();
  const { toast } = useFeedback();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const digits = v.replace(/\D/g, '');
    if (digits.length !== 9 && digits.length !== 4) { toast('Enter the 9-digit SSN or its last 4 digits.', 'error'); return; }
    const last4 = digits.slice(-4);
    setBusy(true);
    try {
      await db.update('accounts', account.id, { ssn_last4: last4 });
      up((x) => ({ ...x, drivers: x.drivers.map((d) => (d.primary ? { ...d, ssn_last4: last4 } : d)) }));
      toast('Applicant SSN saved (last 4 digits only).');
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const primary = w.drivers.find((d) => d.primary);
  return (
    <Modal title="Applicant SSN" subtitle={primary ? `${primary.first_name} ${primary.last_name}` : undefined} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button>
    </>}>
      <div className="pt-2">
        <OInput label="SSN" inputMode="numeric" value={v} onChange={(x) => setV(x.replace(/[^\d-]/g, '').slice(0, 11))} maxLength={11} />
        <p className="text-[12px] text-ink-500 mt-2">Only the last 4 digits are stored. Carriers use SSN to order credit-based insurance scores, which improves quote accuracy.</p>
      </div>
    </Modal>
  );
}

function SaveTemplateModal({ onClose }: { onClose: () => void }) {
  const { w } = useWf();
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast('Name the template.', 'error'); return; }
    setBusy(true);
    try {
      // Templates keep reusable choices only (no applicant, driver or vehicle data).
      const policy: Partial<typeof w.policy> = { ...w.policy };
      delete policy.prior_exp; delete policy.effective; delete policy.prior_premium;
      const coverage: Partial<typeof w.coverage> = { ...w.coverage };
      delete coverage.vehicles;
      await db.insert('form_templates', { name: name.trim(), form_type: 'Auto Quote', fields: { data: JSON.stringify({ policy, coverage, carriers: w.rating.carriers, description: w.rating.description }) } });
      toast(`Template "${name.trim()}" saved`);
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Save as template" size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void save()}>Save template</Button>
    </>}>
      <div className="pt-2">
        <OInput label="Template name" required="proceed" value={name} onChange={setName} maxLength={60} />
        <p className="text-[12px] text-ink-500 mt-2">Saves the selected carriers, policy terms, coverage limits and credits. Apply it from <b>Select Quote Template</b> on the Rating step of any auto quote.</p>
      </div>
    </Modal>
  );
}

export function ReviewStep() {
  const { w, allIssues, go, account } = useWf();
  const [ssn, setSsn] = useState(false);
  const [tpl, setTpl] = useState(false);
  const acc = accuracyItems(w);
  const byStep = STEPS.filter((s) => s.key !== 'review').map((s) => ({ step: s, items: allIssues.filter((i) => i.step === s.key) })).filter((g) => g.items.length);
  const blocked = allIssues.length > 0;
  return (
    <div>
      {blocked ? (
        <>
          <Notice>You must correct the following items before submitting the quote</Notice>
          <div className="mt-3 mb-6 space-y-5">
            {byStep.map(({ step, items }) => {
              const Icon = STEP_ICON[step.key];
              return (
                <div key={step.key}>
                  <div className="flex items-center gap-2 text-[15px] text-ink-900"><Icon size={18} className="text-ink-700" /> {step.label}</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[280px_auto] items-center gap-4 mt-2 ml-7">
                    <div className="text-[13px] text-ink-800">{items.length} error{items.length > 1 ? 's' : ''} found in {step.label}</div>
                    <button type="button" onClick={() => go(step.key, items[0].field)} className="h-8 px-4 rounded border border-brand-200 bg-brand-50 text-brand-700 text-[13px] font-semibold hover:bg-brand-100">Fix</button>
                  </div>
                  <ul className="ml-7 mt-1.5 space-y-0.5">
                    {items.slice(0, 6).map((i) => (
                      <li key={i.field + i.message}><button type="button" onClick={() => go(step.key, i.field)} className="text-[12px] text-ink-500 hover:text-brand-700 hover:underline text-left">{i.label}: {i.message}</button></li>
                    ))}
                    {items.length > 6 && <li className="text-[12px] text-ink-400">and {items.length - 6} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] px-3 py-2 mb-6 max-w-xl">
          <CheckCircle2 size={16} /> All required information is complete. The quote is ready to submit to carriers.
        </div>
      )}
      {acc.length > 0 && (
        <>
          <Notice>Correcting the following items will increase the accuracy of your quote</Notice>
          <div className="mt-3 ml-1">
            <div className="text-[15px] text-ink-900 mb-2">Applicant</div>
            {acc.map((a) => (
              <div key={a.field} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[300px_auto] items-center gap-4 ml-6 py-1.5">
                <div className="text-[13px] text-ink-800">{a.label}</div>
                <TextBtn onClick={() => (a.step === 'ssn' ? setSsn(true) : go(a.step, a.field))} className="h-8">Edit</TextBtn>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="bg-white border border-ink-200 rounded shadow-card px-3 py-3 mt-6 flex flex-wrap items-center gap-2">
        <TextBtn onClick={() => go('carrier')}>Carrier questions</TextBtn>
        <div className="flex-1" />
        <TextBtn onClick={() => setTpl(true)}>Save as template</TextBtn>
        <Button variant="primary" disabled={blocked} onClick={() => go('submit')} title={blocked ? 'Fix the items above first' : undefined}>Submit to carriers</Button>
        <TextBtn onClick={() => navigate(`/accounts/${account.id}?tab=quotes`)}>Exit</TextBtn>
        <TextBtn onClick={() => navigate('/')}>Go to home</TextBtn>
      </div>
      {ssn && <SsnModal onClose={() => setSsn(false)} />}
      {tpl && <SaveTemplateModal onClose={() => setTpl(false)} />}
    </div>
  );
}

// ── Submit to Carriers ──

type RunState = Record<string, 'waiting' | 'rating' | 'done'>;

export function SubmitView({ onSubmit }: { onSubmit: (carriers: string[], saveToAccount: boolean, onProgress: (c: string, s: 'rating' | 'done') => void) => Promise<void> }) {
  const { w, go, allIssues } = useWf();
  const [picked, setPicked] = useState<string[]>(w.rating.carriers);
  const [saveBack, setSaveBack] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = !!run;
  const submit = async () => {
    setError(null);
    if (!picked.length) { setError('Select at least one carrier.'); return; }
    setRun(Object.fromEntries(picked.map((c) => [c, 'waiting'])));
    try {
      await onSubmit(picked, saveBack, (c, s) => setRun((r) => ({ ...(r ?? {}), [c]: s })));
    } catch (e) {
      setError((e as Error).message);
      setRun(null);
    }
  };
  if (allIssues.length) {
    return (
      <div className="bg-white border border-ink-200 rounded p-6">
        <p className="text-[14px] text-ink-800">This quote still has {allIssues.length} item{allIssues.length > 1 ? 's' : ''} to correct before it can be submitted.</p>
        <Button className="mt-4" onClick={() => go('review')}>Review items</Button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3 -mx-4 -mt-4 mb-5 px-4 py-3 bg-[#f0eded] border-b border-ink-200">
        <Landmark size={30} className="text-ink-500" />
        <h2 className="text-[20px] text-ink-900">Submit to Carriers</h2>
      </div>
      <h3 className="text-[19px] text-ink-900 mb-5">Select Carriers for Auto quote</h3>
      <div className="bg-white border border-ink-200 rounded shadow-card">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 border-b border-ink-200 text-[14px] text-ink-800">
          <span>Carrier</span>
          <label className="block max-w-[320px]">
            <span className="text-[10px] text-ink-500 block -mb-0.5 ml-1">LOB</span>
            <select aria-label="LOB" className="w-full h-9 rounded border border-ink-300 bg-white px-2 text-[14px]" value="Auto" onChange={() => {}}><option>Auto</option></select>
          </label>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {w.rating.carriers.map((c) => {
          const st = run?.[c];
          return (
            <div key={c} className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-3 px-4 py-4 border-b border-ink-100 last:border-b-0">
              <CarrierMark name={c} />
              <label className="inline-flex items-center gap-3 text-[14px] text-ink-800 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 accent-[#b91c1c]" disabled={busy} checked={picked.includes(c)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} /> Auto
              </label>
              <span className="text-[13px] tracking-wide">
                {st === 'rating' ? <span className="inline-flex items-center gap-2 text-brand-700"><Loader2 size={14} className="animate-spin" /> RATING…</span>
                  : st === 'done' ? <span className="inline-flex items-center gap-2 text-emerald-700"><CheckCircle2 size={14} /> RECEIVED</span>
                    : st === 'waiting' ? <span className="text-ink-400">QUEUED</span> : <span className="text-ink-800">ENABLED</span>}
              </span>
              <a href={href('/admin/carrier-quoting')} className="text-[13px] text-brand-700 hover:underline">Carrier setup</a>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 mt-4 text-[13px] text-ink-700">
        <input type="checkbox" className="w-4 h-4 accent-[#b91c1c]" checked={saveBack} disabled={busy} onChange={(e) => setSaveBack(e.target.checked)} />
        Save drivers and vehicles to the applicant record
      </label>
      {error && <div className="text-[13px] text-red-600 mt-3">{error}</div>}
      <div className="bg-white border border-ink-200 rounded shadow-card px-3 py-3 mt-5 flex items-center">
        <TextBtn onClick={() => go('review')} className={busy ? 'opacity-50 pointer-events-none' : ''}>Cancel</TextBtn>
        <div className="flex-1" />
        <Button variant="primary" loading={busy} onClick={() => void submit()}>Submit</Button>
      </div>
      <p className="text-[11px] text-ink-400 mt-3">Carrier connections are simulated for training. Premiums come from the built-in comparative rater, not live carrier systems.</p>
    </div>
  );
}

// ── Quote Results ──

type Sort = 'low' | 'high' | 'carrier';
type Row = RatedCarrier & { alt?: boolean; id: string };

const CROSS_SELL: { key: string; title: string; text: string; icon: ReactNode; action: 'task' | 'umbrella' }[] = [
  { key: 'referral', title: 'Create a client referral', text: 'Ask for a referral while the quote is fresh. Creates a follow-up task.', icon: <UserPlus size={22} />, action: 'task' },
  { key: 'life', title: 'Add Life Insurance', text: '10 year term / $500,000 coverage. Schedule a life insurance review.', icon: <HeartPulse size={22} />, action: 'task' },
  { key: 'roadside', title: 'Roadside Assistance', text: 'Offer a roadside assistance membership with the new auto policy.', icon: <Truck size={22} />, action: 'task' },
  { key: 'umbrella', title: 'Add an Umbrella Policy', text: 'Extra liability over the auto limits. Opens an umbrella quote.', icon: <Umbrella size={22} />, action: 'umbrella' },
  { key: 'pet', title: 'Add pet insurance', text: 'Coverage for accidents, injuries, illness and more.', icon: <PawPrint size={22} />, action: 'task' },
  { key: 'flood', title: 'Flood Insurance', text: 'Standard home policies exclude flood. Schedule a flood review.', icon: <Waves size={22} />, action: 'task' },
];

export function ResultsView({ quoteId, results, alt }: { quoteId: string | null; results: CarrierRate[]; alt: CarrierRate[] }) {
  const { w, go, account, autoCarriers } = useWf();
  const { me, settings } = useAppData();
  const prefs = useUserPreferences();
  const { toast } = useFeedback();
  const [plan, setPlan] = useState<PayPlan>(prefs.payment_option === 'monthly' ? 'monthly' : 'full');
  const [sort, setSort] = useState<Sort>(prefs.sort_auto === 'premium_desc' ? 'high' : prefs.sort_auto === 'carrier_az' ? 'carrier' : 'low');
  const [graph, setGraph] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [cross, setCross] = useState(true);

  const rows = useMemo<Row[]>(() => {
    const quoted: Row[] = [
      ...results.filter((r) => r.status === 'Quoted' && r.premium !== null).map((r) => ({ ...(r as RatedCarrier), id: r.carrier })),
      ...alt.map((r) => ({ ...(r as RatedCarrier), alt: true, id: `alt:${r.carrier}` })),
    ];
    const price = (r: Row) => planPrice(r, plan, w)?.amount ?? Infinity;
    return quoted.sort((a, b) => (sort === 'carrier' ? a.carrier.localeCompare(b.carrier) || Number(!!a.alt) - Number(!!b.alt) : sort === 'high' ? price(b) - price(a) : price(a) - price(b)));
  }, [results, alt, plan, sort, w]);
  const declined = results.filter((r) => r.status !== 'Quoted' || r.premium === null);
  const prices = rows.map((r) => planPrice(r, plan, w)!.amount);
  const lo = Math.min(...prices), hi = Math.max(...prices), med = median(prices);
  const pos = (x: number) => (hi === lo ? 50 : 4 + ((x - lo) / (hi - lo)) * 92);
  const unit = plan === 'full' ? '' : '/mo';

  const crossSell = async (c: (typeof CROSS_SELL)[number]) => {
    if (c.action === 'umbrella') { navigate(`/quotes/new?account=${account.id}&line=Umbrella`); return; }
    try {
      await logActivity({ account_id: account.id, subject: `Cross-sell: ${c.title}`, description: `Suggested from the Personal Auto quote results.`, assigned_to: me?.name ?? null, type: 'Follow-up', status: 'Open', completed_at: null, due_date: addDays(today(), 2) });
      toast(`Follow-up task created: ${c.title}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const website = (name: string) => autoCarriers.find((c) => c.name === name)?.website ?? null;

  return (
    <div>
      <div className="flex items-center gap-3 -mx-4 -mt-4 mb-4 px-4 py-3 bg-[#f0eded] border-b border-ink-200">
        <DollarSign size={26} className="text-ink-500" />
        <h2 className="text-[20px] text-ink-900 flex-1">Quote Results</h2>
        <Switch label="Graph View" checked={graph} onChange={setGraph} />
      </div>
      <div className="bg-white border border-ink-200 rounded shadow-card px-4 py-4 mb-4 flex flex-wrap items-center justify-end gap-6 text-[12.5px] text-ink-700">
        <span className="inline-flex items-center gap-1.5"><User size={14} className="text-ink-500" /> {me?.name ?? 'Agent'} of {settings?.name ?? 'Agency'}</span>
        <span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-ink-500" /> {w.submitted_at ? fmtDateTime(w.submitted_at) : '—'}</span>
      </div>
      <div className="bg-white border border-ink-200 rounded shadow-card px-4 py-3 mb-3 flex flex-wrap items-center gap-4">
        <div className="inline-flex rounded border border-ink-200 overflow-hidden" role="group" aria-label="Payment plan">
          {(['full', 'monthly', 'eft'] as PayPlan[]).map((p) => (
            <button key={p} type="button" aria-pressed={plan === p} onClick={() => setPlan(p)}
              className={cx('h-8 px-3 text-[13px] font-semibold inline-flex items-center gap-1.5', plan === p ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 hover:bg-ink-50', p !== 'full' && 'border-l border-ink-200')}>
              {plan === p && <CheckCircle2 size={13} />}{PAY_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <select aria-label="Sort results" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 w-full sm:w-80 rounded border border-ink-300 bg-white px-3 text-[14px]">
          <option value="low">Premium: Low-High</option>
          <option value="high">Premium: High-Low</option>
          <option value="carrier">Carrier: A-Z</option>
        </select>
      </div>
      <p className="text-[12px] text-ink-500 text-right mb-3">Reminder: rates reflect the application data entered in this quote when it was submitted. Illustrative training rates.</p>

      {rows.length > 0 && (
        graph ? (
          <div className="bg-white border border-ink-200 rounded shadow-card p-4 mb-4 space-y-2" aria-label="Premium graph">
            {rows.map((r) => {
              const p = planPrice(r, plan, w)!.amount;
              return (
                <div key={r.id} className="grid grid-cols-[180px_minmax(0,1fr)_110px] items-center gap-3 text-[12.5px]">
                  <span className="truncate">{r.carrier}{r.alt ? ' (Alt)' : ''}</span>
                  <div className="h-5 bg-ink-100 rounded"><div className="h-5 rounded bg-brand-600" style={{ width: `${Math.max(6, (p / hi) * 100)}%` }} /></div>
                  <span className="text-right tabular-nums font-semibold">{money2(p)}{unit}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-7 mb-4 px-2" aria-label="Premium range">
            <span className="text-[12px] text-ink-800 whitespace-nowrap">({w.rating.state}) Quoted Auto Premium</span>
            <div className="relative flex-1 h-6">
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-brand-700 rounded" />
              {rows.length > 1 && <span className="absolute -top-4 left-0 text-[10px] text-ink-500">{money2(lo)}</span>}
              {rows.length > 1 && <span className="absolute -top-4 right-0 text-[10px] text-ink-500">{money2(hi)}</span>}
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-brand-700 text-white text-[11px] font-semibold px-3 py-0.5 whitespace-nowrap" style={{ left: `${pos(med)}%` }}>Med: {money2(med)}{unit}</span>
            </div>
          </div>
        )
      )}

      <div className="space-y-2">
        {rows.length === 0 && <div className="bg-white border border-ink-200 rounded p-6 text-[14px] text-ink-700">No carrier returned a quote. Review the reasons below, adjust the quote and submit again.</div>}
        {rows.map((r) => {
          const price = planPrice(r, plan, w)!;
          const isOpen = !!open[r.id];
          const site = website(r.carrier);
          return (
            <div key={r.id} className="bg-white border border-ink-200 rounded shadow-card">
              <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="w-52 min-w-0">
                  <CarrierMark name={r.carrier} size="sm" />
                  {r.alt && <div className="mt-1"><Badge tone="teal">Alt Quote</Badge></div>}
                </div>
                <div className="flex-1 flex flex-wrap justify-center gap-2">
                  <TextBtn onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} className="h-8">{isOpen ? 'Hide details' : 'View more details'}</TextBtn>
                  <TextBtn onClick={() => (site ? window.open(site, '_blank', 'noopener') : toast('No website on file for this carrier.', 'info'))} className="h-8">Go to carrier <ExternalLink size={13} /></TextBtn>
                  {!r.alt && quoteId && <TextBtn onClick={() => navigate(`/quotes/${quoteId}`)} className="h-8">Select &amp; bind</TextBtn>}
                </div>
                <div className="text-right tabular-nums"><span className="text-[17px] text-ink-900">{money2(price.amount)}</span> <span className="text-[13px] text-ink-600">{price.unit}</span></div>
                <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} className="text-ink-600">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
              </div>
              {isOpen && (
                <div className="border-t border-ink-100 px-4 py-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 text-[13px]">
                  <table className="w-full">
                    <thead><tr className="text-[11px] uppercase tracking-wide text-ink-400 border-b border-ink-100"><th className="text-left py-1.5">Coverage</th><th className="text-left py-1.5">Limit</th><th className="text-left py-1.5">Deductible</th><th className="text-right py-1.5">Premium</th></tr></thead>
                    <tbody>{r.coverages.map((c) => <tr key={c.name} className="border-b border-ink-50"><td className="py-1.5">{c.name}</td><td>{c.limit}</td><td>{c.deductible ?? '—'}</td><td className="text-right tabular-nums">{c.premium ? fmtMoney(c.premium) : 'Included'}</td></tr>)}</tbody>
                    <tfoot><tr><td colSpan={3} className="py-1.5 font-semibold">{r.term_months}-month term premium</td><td className="text-right font-semibold tabular-nums">{fmtMoney(r.premium)}</td></tr></tfoot>
                  </table>
                  <div className="space-y-3">
                    <div><div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">Pay plans</div>
                      {(['full', 'monthly', 'eft'] as PayPlan[]).map((p) => { const x = planPrice(r, p, w)!; return <div key={p} className="flex justify-between"><span>{PAY_LABEL[p]}</span><span className="tabular-nums">{money2(x.amount)} {x.unit.replace(/^\/ /, '/')}</span></div>; })}
                    </div>
                    {!!r.discounts?.length && <div><div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">Discounts</div><div className="flex flex-wrap gap-1">{r.discounts.map((d) => <Badge key={d} tone="green">{d}</Badge>)}</div></div>}
                    {!!r.surcharges?.length && <div><div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">Surcharges</div><div className="flex flex-wrap gap-1">{r.surcharges.map((d) => <Badge key={d} tone="amber">{d}</Badge>)}</div></div>}
                    {r.message && <p className="text-[12px] text-ink-500">{r.message}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {declined.length > 0 && (
        <div className="bg-white border border-ink-200 rounded mt-4 px-4 py-3">
          <div className="text-[13px] font-semibold text-ink-900 mb-2">Carriers that did not return a quote</div>
          {declined.map((r) => <div key={r.carrier} className="flex flex-wrap gap-3 text-[13px] py-1"><span className="w-52"><CarrierMark name={r.carrier} size="sm" /></span><span className="text-red-700">{r.status}</span><span className="text-ink-600">{r.message}</span></div>)}
        </div>
      )}

      <div className="text-center my-5"><TextBtn onClick={() => setCross((c) => !c)}>Add value to your quote</TextBtn></div>
      {cross && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[920px] mx-auto">
          {CROSS_SELL.map((c) => (
            <button key={c.key} type="button" onClick={() => void crossSell(c)} className="text-left bg-white border border-ink-200 rounded shadow-card p-4 hover:border-brand-300 hover:shadow-pop transition">
              <div className="text-brand-600 mb-2">{c.icon}</div>
              <div className="text-[15px] font-semibold text-ink-900">{c.title}</div>
              <div className="text-[12.5px] text-ink-600 mt-1">{c.text}</div>
            </button>
          ))}
        </div>
      )}
      <div className="bg-white border border-ink-200 rounded shadow-card px-3 py-3 mt-6 flex flex-wrap items-center gap-2">
        <TextBtn onClick={() => go('rating')}>Edit quote</TextBtn>
        <div className="flex-1" />
        {quoteId && <TextBtn onClick={() => navigate(`/quotes/${quoteId}`)}>Open quote record</TextBtn>}
        <TextBtn onClick={() => navigate(`/accounts/${account.id}?tab=quotes`)}>Exit</TextBtn>
      </div>
    </div>
  );
}
