import { Layers, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, cx, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { US_STATES } from '@/lib/types';
import { OField, TextBtn, inputCls } from '@/modules/accounts/applicant-fields';
import { CarrierMark, Card, Help, Notice, SectionTitle, Switch, WInput, WSelect, clean, useWf } from './fields';
import {
  AGES_LICENSED, DL_STATUS, GENDERS, INDUSTRIES, MARITAL, MONTHS, NO_PRIOR, OTHER_PRIORS, PRIOR_LIMITS, RATED, RELATIONSHIPS, TERMS, YEARS, YES_NO,
  answerKey, blankDriver, driverName, mature, prefillDrivers, questionsFor, stepQuestions, youthful,
  type CarrierQuestion, type WDriver, type Workflow,
} from './model';

// ── Shared pieces ──

export function StepFooter({ back, next, extra }: { back?: { label: string; to: string }; next?: { label: string; to: string }; extra?: ReactNode }) {
  const { go } = useWf();
  return (
    <div className="bg-white border border-ink-200 rounded shadow-card px-3 py-3 mt-5 flex flex-wrap items-center gap-2">
      {back && <TextBtn onClick={() => go(back.to)}>{back.label}</TextBtn>}
      <div className="flex-1" />
      {extra}
      {next && <Button variant="primary" onClick={() => go(next.to)}>{next.label}</Button>}
    </div>
  );
}

/** Fills carrier-question defaults for every selected carrier (Carrier Answers Prefill). */
export function applyPrefill(w: Workflow, autoCarriers: string[]): Workflow {
  if (!w.rating.carrier_prefill) return w;
  const answers = { ...w.answers };
  const prefilled = new Set(w.prefilled);
  const rated = w.drivers.filter((d) => d.rated === 'Rated');
  for (const c of w.rating.carriers) for (const q of questionsFor(c, autoCarriers)) {
    if (!q.prefill) continue;
    const subjects = q.per === 'driver' ? rated.map((d) => d.key) : q.per === 'vehicle' ? w.vehicles.map((v) => v.key) : [''];
    for (const s of subjects) {
      const k = answerKey(c, q.id, s);
      if (!answers[k]) { answers[k] = q.prefill; prefilled.add(k); }
    }
  }
  return { ...w, answers, prefilled: [...prefilled] };
}

/** Carrier answers about a removed driver / vehicle go with it. */
export function dropAnswers(w: Workflow, subject: string): Pick<Workflow, 'answers' | 'prefilled'> {
  const mine = (k: string) => k.endsWith(`|${subject}`);
  return { answers: Object.fromEntries(Object.entries(w.answers).filter(([k]) => !mine(k))), prefilled: w.prefilled.filter((k) => !mine(k)) };
}

export function clearPrefill(w: Workflow): Workflow {
  const answers = { ...w.answers };
  for (const k of w.prefilled) delete answers[k];
  return { ...w, answers, prefilled: [] };
}

/** Carrier question rows for a step (optionally for one driver/vehicle). Shared questions show once as "Multiple". */
export function CarrierQuestions({ step, subject, per, title }: { step: CarrierQuestion['step']; subject?: string; per?: CarrierQuestion['per']; title?: string }) {
  const { w, up, autoCarriers, hidePrefilled, issues } = useWf();
  const names = autoCarriers.map((c) => c.name);
  const groups = stepQuestions(step, w.rating.carriers, names).filter((g) => (per ? g.q.per === per : true));
  const subj = subject ?? '';
  const visible = groups.filter((g) => !hidePrefilled || !g.carriers.every((c) => w.prefilled.includes(answerKey(c, g.q.id, subj))));
  if (!visible.length) return null;
  const set = (g: (typeof groups)[number], value: string) => up((x) => {
    const answers = { ...x.answers };
    for (const c of g.carriers) answers[answerKey(c, g.q.id, subj)] = value;
    return { ...x, answers, prefilled: x.prefilled.filter((k) => !g.carriers.some((c) => k === answerKey(c, g.q.id, subj))) };
  });
  const ok = visible.every((g) => g.carriers.every((c) => !issues.has(`answer.${answerKey(c, g.q.id, subj)}`)));
  return (
    <div className="mt-4">
      {title && <SectionTitle ok={ok}>{title}</SectionTitle>}
      <div className="divide-y divide-ink-100">
        {visible.map((g) => {
          const value = w.answers[answerKey(g.carriers[0], g.q.id, subj)] ?? '';
          const msg = g.carriers.map((c) => issues.get(`answer.${answerKey(c, g.q.id, subj)}`)).find(Boolean);
          return (
            <div key={g.q.id} className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3 py-3 items-start" data-field={`answer.${answerKey(g.carriers[0], g.q.id, subj)}`}>
              <div className="pt-1">
                {g.carriers.length > 1
                  ? <div className="flex flex-col items-center w-24 text-center"><span className="w-10 h-10 rounded-full bg-ink-500 grid place-items-center text-white"><Layers size={20} /></span><span className="text-[12px] text-ink-700 mt-1">Multiple</span><span className="text-[10px] text-ink-400">{g.carriers.length} carriers</span></div>
                  : <CarrierMark name={g.carriers[0]} />}
              </div>
              <div className="max-w-[560px]">
                <div className="text-[13px] text-ink-800 mb-1.5">{g.q.required && <span className="text-red-600">*</span>}{g.q.label}</div>
                <div className="flex items-center gap-3">
                  <select aria-label={g.q.label} value={value} onChange={(e) => set(g, e.target.value)}
                    className={cx('flex-1 h-10 rounded border bg-white px-3 text-[14px] outline-none focus:border-brand-500', msg ? 'border-amber-500' : 'border-ink-300')}>
                    <option value="">{g.q.required ? 'Select' : ''}</option>
                    {g.q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <Help text={g.q.help} />
                </div>
                {msg && <div className="text-[11px] text-ink-600 mt-1">{msg}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 1: Rating ──

export function RatingStep() {
  const { w, up, autoCarriers, issues } = useWf();
  const { toast } = useFeedback();
  const templates = useTable('form_templates', { eq: { form_type: 'Auto Quote' }, order: { column: 'name' } });
  const [tpl, setTpl] = useState(w.rating.template_id);
  const names = autoCarriers.map((c) => c.name);
  const all = names.length > 0 && names.every((n) => w.rating.carriers.includes(n));
  const toggle = (name: string, on: boolean) => up((x) => ({ ...x, rating: { ...x.rating, carriers: on ? [...new Set([...x.rating.carriers, name])] : x.rating.carriers.filter((c) => c !== name) } }));

  const apply = () => {
    const t = templates.data.find((x) => x.id === tpl);
    if (!t) return;
    try {
      const data = JSON.parse(t.fields.data ?? '{}') as { policy?: Partial<Workflow['policy']>; coverage?: Partial<Workflow['coverage']>; carriers?: string[]; description?: string };
      up((x) => ({
        ...x,
        rating: { ...x.rating, template_id: t.id, carriers: data.carriers?.filter((c) => names.includes(c)) ?? x.rating.carriers, description: x.rating.description || data.description || '' },
        policy: { ...x.policy, ...data.policy },
        coverage: { ...x.coverage, ...data.coverage, vehicles: x.coverage.vehicles },
      }));
      toast(`Applied template "${t.name}"`);
    } catch { toast('This template could not be read.', 'error'); }
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-6">
            <SectionTitle ok={clean(issues, 'rating.state')}>General Information</SectionTitle>
            <label className="text-[12.5px] text-ink-500 flex items-center gap-2">Rating State:
              <select aria-label="Rating State" value={w.rating.state} onChange={(e) => up((x) => ({ ...x, rating: { ...x.rating, state: e.target.value } }))} className="h-7 border border-ink-300 rounded px-1 text-[12.5px] text-ink-900 bg-white">
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 max-w-[360px]">
            <div className="flex-1">
              <OField label="Select Quote Template" filled={!!tpl}>
                <select aria-label="Select Quote Template" value={tpl} onChange={(e) => setTpl(e.target.value)} className={cx(inputCls, 'appearance-none cursor-pointer', !tpl && 'text-transparent')}>
                  <option value="" />
                  {templates.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </OField>
            </div>
            <Button size="sm" disabled={!tpl} onClick={apply}>Apply</Button>
          </div>
          {!templates.data.length && <div className="text-[11px] text-ink-400 mt-1">No templates yet: finish a quote and use "Save as template".</div>}
          <textarea aria-label="Description" placeholder="Description" value={w.rating.description} maxLength={500}
            onChange={(e) => up((x) => ({ ...x, rating: { ...x.rating, description: e.target.value } }))}
            className="mt-6 w-full max-w-[460px] h-[80px] rounded border border-ink-300 bg-white p-3 text-[14px] outline-none focus:border-brand-500 resize-y" />
        </div>
        <div className="pt-2 lg:pt-10">
          <Notice>Spend less time answering carrier questions. Enable <b>Carrier Answers Prefill.</b></Notice>
          <div className="mt-2">
            <Switch label="Carrier Answers Prefill" checked={w.rating.carrier_prefill}
              onChange={(on) => up((x) => (on ? applyPrefill({ ...x, rating: { ...x.rating, carrier_prefill: true } }, names) : clearPrefill({ ...x, rating: { ...x.rating, carrier_prefill: false } })))} />
          </div>
        </div>
      </div>

      <div className="mt-6" data-field="carriers">
        <div className="flex flex-wrap items-center gap-6">
          <SectionTitle ok={w.rating.carriers.length > 0}>Select Carriers</SectionTitle>
          {!w.rating.carriers.length && <Notice tone="red">You must select at least one carrier.</Notice>}
        </div>
        {autoCarriers.length === 0 ? (
          <p className="text-[13px] text-ink-500">No appointed carriers are set up to rate Personal Auto. Check Settings → Carriers and Agency Management → Carrier Quoting Setup.</p>
        ) : (
          <>
            <Switch label="Select All Carriers" checked={all} onChange={(on) => up((x) => ({ ...x, rating: { ...x.rating, carriers: on ? names : [] } }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
              {autoCarriers.map((c) => <Switch key={c.id} label={c.name} checked={w.rating.carriers.includes(c.name)} onChange={(on) => toggle(c.name, on)} />)}
            </div>
          </>
        )}
      </div>
      <StepFooter next={{ label: 'Policy info', to: 'policy' }} />
    </div>
  );
}

// ── Step 2: Policy info ──

export function PolicyStep() {
  const { w, up, issues, autoCarriers } = useWf();
  const p = w.policy;
  const set = (k: keyof Workflow['policy']) => (v: string) => up((x) => ({ ...x, policy: { ...x.policy, [k]: v } }));
  const noPrior = p.prior_carrier === NO_PRIOR;
  const priorOptions = [...autoCarriers.map((c) => c.name), ...OTHER_PRIORS];
  const two = (a: ReactNode, b: ReactNode) => <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">{a}{b}</div>;
  return (
    <div>
      <SectionTitle ok={clean(issues, 'policy.')}>Policy Information</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-5">
        <WSelect field="policy.prior_carrier" label="Prior Carrier" required value={p.prior_carrier} onChange={set('prior_carrier')} options={priorOptions} />
        <WInput field="policy.prior_exp" label="Prior Policy Expiration Date" required={!noPrior} type="date" value={p.prior_exp} onChange={set('prior_exp')} disabled={noPrior} />
        <WSelect field="policy.prior_limits" label="Prior Liability Limits" required={!noPrior} value={p.prior_limits} onChange={set('prior_limits')} options={PRIOR_LIMITS} disabled={noPrior} />
        <WSelect field="policy.prior_term" label="Prior Policy Term" required={!noPrior} value={p.prior_term} onChange={set('prior_term')} options={TERMS} disabled={noPrior} />
        <WInput field="policy.prior_premium" label="Prior Policy Premium" inputMode="numeric" value={p.prior_premium} onChange={(v) => set('prior_premium')(v.replace(/[^\d.]/g, ''))} disabled={noPrior} />
        {two(
          <WSelect field="policy.years_prior" label="Years with Prior Carrier" required={!noPrior} value={p.years_prior} onChange={set('years_prior')} options={YEARS} disabled={noPrior} />,
          <WSelect field="policy.months_prior" label="Months" required={!noPrior} value={p.months_prior} onChange={set('months_prior')} options={MONTHS} disabled={noPrior} />,
        )}
        {two(
          <WSelect field="policy.years_cont" label="Years with Continuous Coverage" required={!noPrior} value={p.years_cont} onChange={set('years_cont')} options={YEARS} disabled={noPrior} />,
          <WSelect field="policy.months_cont" label="Months" required={!noPrior} value={p.months_cont} onChange={set('months_cont')} options={MONTHS} disabled={noPrior} />,
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-5 mt-8">
        <WSelect field="policy.credit_auth" label="Credit Check and Other Underwriting Reports Authorized" required value={p.credit_auth} onChange={set('credit_auth')} options={YES_NO} />
        <WSelect field="policy.new_term" label="New Policy Term" required value={p.new_term} onChange={set('new_term')} options={TERMS} />
        <WSelect field="policy.package" label="Quote as Package" required value={p.package} onChange={set('package')} options={YES_NO} />
        <WInput field="policy.effective" label="Effective Date (New Policy)" required type="date" value={p.effective} onChange={set('effective')} />
      </div>
      <CarrierQuestions step="policy" title="Additional Carrier Questions" />
      <StepFooter back={{ label: 'Rating', to: 'rating' }} next={{ label: 'Drivers', to: 'drivers' }} />
    </div>
  );
}

// ── Step 3: Drivers ──

function SsnField({ d, onChange }: { d: WDriver; onChange: (last4: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (d.ssn_last4 ? `•••-••-${d.ssn_last4}` : '');
  return (
    <div data-field={`driver.${d.key}.ssn`}>
      <OField label="SSN" filled={!!shown}>
        <input aria-label="SSN" inputMode="numeric" value={shown} maxLength={11} className={inputCls}
          onFocus={() => setDraft('')}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
          onBlur={() => { const digits = (draft ?? '').replace(/\D/g, ''); if (digits.length >= 4) onChange(digits.slice(-4)); setDraft(null); }} />
      </OField>
      <div className="text-[10.5px] text-ink-400 mt-0.5 ml-3">Only the last 4 digits are stored</div>
    </div>
  );
}

function DriverCard({ d, index }: { d: WDriver; index: number }) {
  const { w, up, issues } = useWf();
  const { confirm } = useFeedback();
  const set = (patch: Partial<WDriver>) => up((x) => ({ ...x, drivers: x.drivers.map((y) => (y.key === d.key ? { ...y, ...patch } : y)) }));
  const f = (k: string) => `driver.${d.key}.${k}`;
  const youth = youthful(d);
  const old = mature(d);
  const remove = async () => {
    if (!(await confirm({ title: `Remove ${driverName(d)}?`, message: 'The driver, their vehicle assignments and incidents are removed from this quote.', confirmLabel: 'Remove', danger: true }))) return;
    up((x) => ({
      ...x,
      ...dropAnswers(x, d.key),
      drivers: x.drivers.filter((y) => y.key !== d.key),
      vehicles: x.vehicles.map((v) => { const a = { ...v.assignment }; delete a[d.key]; return { ...v, assignment: a }; }),
      incidents: { accidents: x.incidents.accidents.filter((i) => i.driver_key !== d.key), violations: x.incidents.violations.filter((i) => i.driver_key !== d.key), comp_losses: x.incidents.comp_losses },
    }));
  };
  const industries = Object.keys(INDUSTRIES);
  return (
    <Card title={d.primary ? 'Primary Insured' : `Driver ${index + 1}`} ok={clean(issues, `driver.${d.key}.`)}
      subtitle={d.last_name || d.first_name ? `${d.last_name}, ${d.first_name}${d.dob ? `  DOB: ${fmtDate(d.dob)}` : ''}` : undefined}
      right={!d.primary && <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:underline"><Trash2 size={13} /> Remove</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        <WInput field={f('first_name')} label="First Name" required value={d.first_name} onChange={(v) => set({ first_name: v })} maxLength={40} />
        <WInput field={f('last_name')} label="Last Name" required value={d.last_name} onChange={(v) => set({ last_name: v })} maxLength={40} />
        <WInput field={f('dob')} label="DOB" required type="date" value={d.dob} onChange={(v) => set({ dob: v })} />
        <WSelect field={f('gender')} label="Gender" required value={d.gender} onChange={(v) => set({ gender: v })} options={GENDERS} />
        <WSelect field={f('marital_status')} label="Marital Status" required value={d.marital_status} onChange={(v) => set({ marital_status: v })} options={MARITAL} />
        <WSelect field={f('relationship')} label="Relationship" required value={d.relationship} onChange={(v) => set({ relationship: v })} options={RELATIONSHIPS.filter((r) => d.primary || r !== 'Insured')} disabled={d.primary} />
        <SsnField d={d} onChange={(ssn_last4) => set({ ssn_last4 })} />
        <WSelect field={f('industry')} label="Occupation Industry" required={d.rated === 'Rated'} value={d.industry} onChange={(v) => set({ industry: v, occupation: '' })} options={industries} />
        <WSelect field={f('occupation')} label="Occupation Title" required={d.rated === 'Rated'} value={d.occupation} onChange={(v) => set({ occupation: v })} options={INDUSTRIES[d.industry] ?? (d.occupation ? [d.occupation] : [])} disabled={!d.industry} />
        <WSelect field={f('dl_status')} label="DL Status" required={d.rated === 'Rated'} value={d.dl_status} onChange={(v) => set({ dl_status: v })} options={DL_STATUS} />
        <WSelect field={f('age_licensed')} label="Age Licensed" required={d.rated === 'Rated'} value={d.age_licensed} onChange={(v) => set({ age_licensed: v })} options={AGES_LICENSED} />
        <WInput field={f('dl_number')} label="DL#" value={d.dl_number} onChange={(v) => set({ dl_number: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })} maxLength={20} />
        <WSelect field={f('dl_state')} label="DL State" required={d.rated === 'Rated'} value={d.dl_state} onChange={(v) => set({ dl_state: v })} options={US_STATES} />
        <WSelect field={f('rated')} label="Rated Driver" value={d.rated} onChange={(v) => set({ rated: v as WDriver['rated'] })} options={RATED} disabled={d.primary} />
        <WInput field={f('defensive_date')} label="Defensive Driver Course Date" type="date" value={d.defensive_date} onChange={(v) => set({ defensive_date: v })} />
        <WSelect field={f('license_sus')} label="License Sus/Rev (Last 5 years)" required={d.rated === 'Rated'} value={d.license_sus} onChange={(v) => set({ license_sus: v })} options={YES_NO} />
        <WSelect field={f('sr22')} label="SR-22 Required" value={d.sr22} onChange={(v) => set({ sr22: v })} options={YES_NO} />
        <WSelect field={f('fr44')} label="FR-44 Required" value={d.fr44} onChange={(v) => set({ fr44: v })} options={YES_NO} />
        <WSelect field={f('good_student')} label="Good Student" value={youth ? d.good_student : ''} onChange={(v) => set({ good_student: v })} options={YES_NO} disabled={!youth} />
        <WSelect field={f('student_away')} label="Student > 100 miles away" value={youth ? d.student_away : ''} onChange={(v) => set({ student_away: v })} options={YES_NO} disabled={!youth} />
        <WSelect field={f('driver_ed')} label="Driver Education" value={d.driver_ed} onChange={(v) => set({ driver_ed: v })} options={YES_NO} />
        <WSelect field={f('mature_driver')} label="Mature Driver" value={old ? d.mature_driver : ''} onChange={(v) => set({ mature_driver: v })} options={YES_NO} disabled={!old} />
        <WSelect field={f('good_driver')} label="Good Driver" value={d.good_driver} onChange={(v) => set({ good_driver: v })} options={YES_NO} />
      </div>
      {d.rated === 'Rated' && <CarrierQuestions step="drivers" subject={d.key} title="Carrier Questions" />}
      {w.rating.carriers.length === 0 && <p className="text-[12px] text-ink-400 mt-3">Select carriers on the Rating step to see carrier questions.</p>}
    </Card>
  );
}

export function DriversStep() {
  const { w, up, account } = useWf();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const prefill = async () => {
    setBusy(true);
    try {
      const rows = await db.list('drivers', { eq: { account_id: account.id }, order: { column: 'created_at' } });
      const r = prefillDrivers(w, rows, account);
      up((x) => ({
        ...x,
        drivers: r.drivers,
        // New rated drivers get a 0% share on each vehicle so the assignment grid lists them.
        vehicles: x.vehicles.map((v) => ({ ...v, assignment: { ...Object.fromEntries(r.drivers.filter((d) => d.rated === 'Rated').map((d) => [d.key, '0'])), ...v.assignment } })),
      }));
      toast(r.added ? `Added ${r.added} driver${r.added > 1 ? 's' : ''} from the applicant's household` : rows.length ? 'All household drivers are already on this quote' : 'No household drivers on file for this applicant', r.added ? 'success' : 'info');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const add = () => up((x) => {
    const d = blankDriver(false);
    return { ...x, drivers: [...x.drivers, d], vehicles: x.vehicles.map((v) => ({ ...v, assignment: { ...v.assignment, [d.key]: '0' } })) };
  });
  return (
    <div>
      <Card title="Prefill Drivers">
        <p className="text-[13px] text-ink-700 mb-4">Use prefill to bring in the drivers already listed on this applicant's household record.</p>
        <TextBtn onClick={() => void prefill()} className={busy ? 'opacity-60 pointer-events-none' : ''}>{busy ? 'Prefilling…' : 'Prefill drivers'}</TextBtn>
      </Card>
      {w.drivers.map((d, i) => <DriverCard key={d.key} d={d} index={i} />)}
      <TextBtn onClick={add}>Add driver</TextBtn>
      <StepFooter back={{ label: 'Policy info', to: 'policy' }} next={{ label: 'Vehicles', to: 'vehicles' }} />
    </div>
  );
}

