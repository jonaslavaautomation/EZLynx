import { Home, Layers, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, cx, useFeedback } from '@/components/ui';
import { useTable } from '@/lib/hooks';
import { US_STATES } from '@/lib/types';
import { OField, TextBtn, inputCls } from '@/modules/accounts/applicant-fields';
import { CarrierMark, Card, Help, Notice, SectionTitle, Switch, WInput, WSelect, clean } from '@/modules/autoquote/fields';
import { DOG_BREEDS, PRIOR_INSURERS } from '@/modules/quotes/reference';
import { useHome } from './ctx';
import {
  ALARM, BATHS, CONSTRUCTION_STYLE, DEDUCTIBLE, DETECTION, DISTANCE_MILES, DWELLING_TYPE, DWELLING_USAGE, EQ_DED, EQ_VENEER, EQ_ZONE, EXTERIOR_WALLS,
  E_ADDITIONS, E_CREDIT_CARD, E_INCREASED_RC, E_JEWELRY, E_LOSS_ASSESSMENT, E_MOLD, E_ORDINANCE, E_WATER_BACKUP, BUSINESS_CLASS, FORM_TYPES, FOUNDATION,
  HALF_BATHS, HEATING, HURRICANE_DED, HYDRANT_FEET, INTERESTS, LIABILITY, LOSSES, LOSS_OF_USE_PCT, MEDPAY, MONTHS, NONE, NO_PRIOR, OCCUPANCY, OCCUPANTS,
  OTHER_PRIORS, OTHER_STRUCT_PCT, PERSONAL_PROPERTY_PCT, ROOF_DESIGN, ROOF_TYPE, ROOF_UL, SECONDARY_HEAT, SPP_CLASSES, SPRINKLER, STORIES, STOVES,
  THEFT_DED, WIND_DED, YEARS, YES_NO, answerKey, applyPrefill, clearPrefill, num, replacementCost, stepQuestions,
  type CarrierQuestion, type HomeWorkflow, type InterestKey, type SppKey,
} from './model';

const money = (x: string) => x.replace(/[^\d]/g, '');
const moneyShow = (x: string) => (x ? `$${Number(x).toLocaleString('en-US')}` : '');
const grid4 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5';
const grid3 = 'grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-5';

export function StepFooter({ back, next, extra }: { back?: { label: string; to: string }; next?: { label: string; to: string }; extra?: ReactNode }) {
  const { go } = useHome();
  return (
    <div className="bg-white border border-ink-200 rounded shadow-card px-3 py-3 mt-5 flex flex-wrap items-center gap-2">
      {back && <TextBtn onClick={() => go(back.to)}>{back.label}</TextBtn>}
      <div className="flex-1" />
      {extra}
      {next && <Button variant="primary" onClick={() => go(next.to)}>{next.label}</Button>}
    </div>
  );
}

/** One carrier-question row per question (shared questions merged under "Multiple"). */
export function CarrierQuestions({ step, title }: { step: CarrierQuestion['step']; title?: string }) {
  const { w, up, homeCarriers, hidePrefilled, issues } = useHome();
  const names = homeCarriers.map((c) => c.name);
  const groups = stepQuestions(step, w.rating.carriers, names)
    .filter((g) => !hidePrefilled || !g.carriers.every((c) => w.prefilled.includes(answerKey(c, g.q.id))));
  if (!groups.length) return null;
  const set = (g: (typeof groups)[number], value: string) => up((x) => {
    const answers = { ...x.answers };
    for (const c of g.carriers) answers[answerKey(c, g.q.id)] = value;
    return { ...x, answers, prefilled: x.prefilled.filter((k) => !g.carriers.some((c) => k === answerKey(c, g.q.id))) };
  });
  const ok = groups.every((g) => g.carriers.every((c) => !issues.has(`answer.${answerKey(c, g.q.id)}`)));
  return (
    <div className="mt-6">
      {title && <SectionTitle ok={ok}>{title}</SectionTitle>}
      <div className="divide-y divide-ink-100">
        {groups.map((g) => {
          const value = w.answers[answerKey(g.carriers[0], g.q.id)] ?? '';
          const msg = g.carriers.map((c) => issues.get(`answer.${answerKey(c, g.q.id)}`)).find(Boolean);
          return (
            <div key={g.q.id} className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3 py-3 items-start" data-field={`answer.${answerKey(g.carriers[0], g.q.id)}`}>
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

/** Yes/no question with a toggle, as underwriting questions are laid out. */
function Question({ label, checked, onChange, field, children }: { label: string; checked: boolean; onChange: (v: boolean) => void; field?: string; children?: ReactNode }) {
  return (
    <div className="py-2.5 border-b border-ink-100 last:border-b-0" data-field={field}>
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <span className="text-[14px] text-ink-800">{label}</span>
        <Switch label={checked ? 'Yes' : 'No'} checked={checked} onChange={onChange} />
      </div>
      {checked && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ── Step 1: Rating ──

export function RatingStep() {
  const { w, up, homeCarriers, issues } = useHome();
  const { toast } = useFeedback();
  const templates = useTable('form_templates', { eq: { form_type: 'Home Quote' }, order: { column: 'name' } });
  const [tpl, setTpl] = useState(w.rating.template_id);
  const names = homeCarriers.map((c) => c.name);
  const all = names.length > 0 && names.every((n) => w.rating.carriers.includes(n));
  const toggle = (name: string, on: boolean) => up((x) => ({ ...x, rating: { ...x.rating, carriers: on ? [...new Set([...x.rating.carriers, name])] : x.rating.carriers.filter((c) => c !== name) } }));
  const apply = () => {
    const t = templates.data.find((x) => x.id === tpl);
    if (!t) return;
    try {
      const data = JSON.parse(t.fields.data ?? '{}') as Partial<Pick<HomeWorkflow, 'coverage' | 'endorsements'>> & { policy?: Partial<HomeWorkflow['policy']>; carriers?: string[]; form?: string };
      up((x) => ({
        ...x,
        rating: { ...x.rating, template_id: t.id, carriers: data.carriers?.filter((c) => names.includes(c)) ?? x.rating.carriers, form: data.form ?? x.rating.form },
        policy: { ...x.policy, ...data.policy },
        coverage: { ...x.coverage, ...data.coverage, dwelling: x.coverage.dwelling, replacement: x.coverage.replacement },
        endorsements: { ...x.endorsements, ...data.endorsements },
      }));
      toast(`Applied template "${t.name}"`);
    } catch { toast('This template could not be read.', 'error'); }
  };
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-6">
            <SectionTitle ok={clean(issues, 'rating.state', 'rating.form')}>General Information</SectionTitle>
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
                  {!templates.data.length && <option value="" disabled>No templates saved yet</option>}
                </select>
              </OField>
            </div>
            <Button size="sm" disabled={!tpl} onClick={apply}>Apply</Button>
          </div>
          {!templates.data.length && <div className="text-[11px] text-ink-400 mt-1">No templates yet: finish a quote and use "Save as template".</div>}
          <textarea aria-label="Description" placeholder="Description" value={w.rating.description} maxLength={500}
            onChange={(e) => up((x) => ({ ...x, rating: { ...x.rating, description: e.target.value } }))}
            className="mt-6 w-full max-w-[460px] h-[80px] rounded border border-ink-300 bg-white p-3 text-[14px] outline-none focus:border-brand-500 resize-y" />
          <div className="mt-5 max-w-[360px]">
            <WSelect field="rating.form" label="Policy/Form Type" required value={w.rating.form} onChange={(form) => up((x) => ({ ...x, rating: { ...x.rating, form } }))} options={FORM_TYPES} />
          </div>
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
        {homeCarriers.length === 0 ? (
          <p className="text-[13px] text-ink-500">No appointed carriers are set up to rate Homeowners. Check Settings → Carriers and Agency Management → Carrier Quoting Setup.</p>
        ) : (
          <>
            <Switch label="Select All Carriers" checked={all} onChange={(on) => up((x) => ({ ...x, rating: { ...x.rating, carriers: on ? names : [] } }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
              {homeCarriers.map((c) => <Switch key={c.id} label={c.name} checked={w.rating.carriers.includes(c.name)} onChange={(on) => toggle(c.name, on)} />)}
            </div>
          </>
        )}
      </div>
      <StepFooter next={{ label: 'Policy info', to: 'policy' }} />
    </div>
  );
}

// ── Step 2: Policy Info ──

export function PolicyStep() {
  const { w, up, issues, homeCarriers } = useHome();
  const p = w.policy;
  const set = (patch: Partial<HomeWorkflow['policy']>) => up((x) => ({ ...x, policy: { ...x.policy, ...patch } }));
  const noPrior = p.prior_carrier === NO_PRIOR;
  const two = (a: ReactNode, b: ReactNode) => <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">{a}{b}</div>;
  return (
    <div>
      <SectionTitle ok={clean(issues, 'policy.prior', 'policy.years', 'policy.months', 'policy.credit', 'policy.package', 'policy.effective')}>Policy Information</SectionTitle>
      <div className={grid3}>
        <WSelect field="policy.prior_carrier" label="Prior Carrier" required value={p.prior_carrier} onChange={(prior_carrier) => set({ prior_carrier })} options={[...new Set([...homeCarriers.map((c) => c.name), ...PRIOR_INSURERS])].sort((a, b) => a.localeCompare(b)).concat(OTHER_PRIORS)} />
        <WInput field="policy.prior_exp" label="Expiration Date (current policy)" required={!noPrior} type="date" value={p.prior_exp} onChange={(prior_exp) => set({ prior_exp })} disabled={noPrior} />
        <WInput field="policy.prior_premium" label="Prior Policy Premium" inputMode="numeric" value={moneyShow(p.prior_premium)} onChange={(x) => set({ prior_premium: money(x) })} disabled={noPrior} />
        {two(
          <WSelect field="policy.years_prior" label="Years with Prior Carrier" required={!noPrior} value={p.years_prior} onChange={(years_prior) => set({ years_prior })} options={YEARS} disabled={noPrior} />,
          <WSelect field="policy.months_prior" label="Months" required={!noPrior} value={p.months_prior} onChange={(months_prior) => set({ months_prior })} options={MONTHS} disabled={noPrior} />,
        )}
        {two(
          <WSelect field="policy.years_cont" label="Years with Continuous Coverage" required={!noPrior} value={p.years_cont} onChange={(years_cont) => set({ years_cont })} options={YEARS} disabled={noPrior} />,
          <WSelect field="policy.months_cont" label="Months" required={!noPrior} value={p.months_cont} onChange={(months_cont) => set({ months_cont })} options={MONTHS} disabled={noPrior} />,
        )}
        <WSelect field="policy.credit_auth" label="Credit Check Authorized" required value={p.credit_auth} onChange={(credit_auth) => set({ credit_auth })} options={YES_NO} />
        <WSelect field="policy.new_term" label="New Policy Term" value={p.new_term} onChange={(new_term) => set({ new_term })} options={['12 Month']} />
        <WSelect field="policy.package" label="Quote as Package" required value={p.package} onChange={(pkg) => set({ package: pkg })} options={YES_NO} />
        <WInput field="policy.effective" label="Effective Date (New Policy)" required type="date" value={p.effective} onChange={(effective) => set({ effective })} />
      </div>

      <SectionTitle ok={clean(issues, 'policy.employees', 'policy.losses')}>Underwriting Information</SectionTitle>
      <div className="bg-white border border-ink-200 rounded px-4 max-w-[900px]">
        <Question label="Has property insurance been cancelled, declined or non-renewed in the last 5 yrs?" checked={p.cancelled} onChange={(cancelled) => set({ cancelled })} />
        <Question label="Is the home under construction?" checked={p.under_construction} onChange={(under_construction) => set({ under_construction })} />
        <Question label="Trampoline" checked={p.trampoline} onChange={(trampoline) => set({ trampoline })} />
        <Question label="Is there a business or daycare on the premises?" checked={p.business} onChange={(business) => set({ business, employees: business ? p.employees || '0' : '' })} field="policy.employees">
          <div className="max-w-[220px]"><WInput field="policy.employees" label="# of Employees" required inputMode="numeric" value={p.employees} onChange={(x) => set({ employees: x.replace(/\D/g, '').slice(0, 3) })} /></div>
        </Question>
        <Question label="Is there a swimming pool on the premises?" checked={p.pool} onChange={(pool) => set({ pool })} />
        <div className="py-3 max-w-[300px]"><WSelect field="policy.losses" label="Property losses in the last 5 years" required value={p.losses} onChange={(losses) => set({ losses })} options={LOSSES} /></div>
      </div>

      <SectionTitle ok={clean(issues, 'policy.dog')}>Dog Information</SectionTitle>
      <div className="bg-white border border-ink-200 rounded px-4 max-w-[900px]">
        <Question label="Are dogs on the premises?" checked={p.dogs} onChange={(dogs) => set({ dogs, ...(dogs ? {} : { dog_breed: '', dog_bite: '' }) })} field="policy.dog_breed">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[560px] pb-1">
            <WSelect field="policy.dog_breed" label="Breed" required value={p.dog_breed} onChange={(dog_breed) => set({ dog_breed })} options={DOG_BREEDS} />
            <WSelect field="policy.dog_bite" label="Any bite history?" required value={p.dog_bite} onChange={(dog_bite) => set({ dog_bite })} options={YES_NO} />
          </div>
        </Question>
      </div>
      <CarrierQuestions step="policy" title="Additional Carrier Questions" />
      <StepFooter back={{ label: 'Rating', to: 'rating' }} next={{ label: 'Dwelling info', to: 'dwelling' }} />
    </div>
  );
}

// ── Step 3: Dwelling Info ──

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = <T,>(list: readonly T[], seed: number) => list[seed % list.length];

/** Fills empty dwelling fields from the property on file, or typical values for the address (training simulation). */
function lookupDwelling(w: HomeWorkflow, property: ReturnType<typeof useHome>['property'], address: string): HomeWorkflow['dwelling'] {
  const d = { ...w.dwelling };
  const h = hash(address.toLowerCase());
  const fill = <K extends keyof HomeWorkflow['dwelling']>(k: K, v: HomeWorkflow['dwelling'][K]) => { if (!d[k]) d[k] = v; };
  const walls = property?.construction ? ({ Frame: 'Vinyl Siding', Masonry: 'Brick / Masonry', 'Brick Veneer': 'Brick Veneer', Stucco: 'Stucco', Log: 'Log', Manufactured: 'Vinyl Siding' } as Record<string, string>)[property.construction] : undefined;
  const roof = property?.roof_type ? ({ 'Composition Shingle': 'Asphalt Shingles', 'Architectural Shingle': 'Architectural Shingles', Metal: 'Metal', Tile: 'Clay Tile', 'Wood Shake': 'Wood Shake', 'Flat / Built-up': 'Tar & Gravel' } as Record<string, string>)[property.roof_type] : undefined;
  const year = property?.year_built ?? 1965 + (h % 56);
  const pc = property?.protection_class ?? 3 + (h % 5);
  fill('year_built', String(year));
  fill('sqft', String(property?.square_feet ?? 1200 + (h % 21) * 100));
  fill('stories', pick(['1', '1', '2', '1.5'], h >> 3));
  fill('style', pick(['Ranch', 'Dwelling', 'Colonial', 'Contemporary'], h >> 5));
  fill('walls', walls ?? pick(['Brick Veneer', 'Vinyl Siding', 'Brick Veneer', 'Stucco', 'Fiber Cement'], h >> 7));
  fill('roof_type', roof ?? pick(['Asphalt Shingles', 'Architectural Shingles', 'Asphalt Shingles', 'Metal'], h >> 9));
  fill('roof_year', String(property?.roof_year ?? Math.min(new Date().getFullYear(), year + 5 + (h % 18))));
  fill('foundation', pick(['Slab', 'Slab', 'Crawl Space', 'Basement - Unfinished'], h >> 11));
  fill('roof_design', pick(['Gable', 'Hip', 'Gable'], h >> 13));
  fill('full_baths', pick(['2', '2', '1', '3'], h >> 15));
  fill('half_baths', pick(['0', '1', '0'], h >> 17));
  fill('heating', pick(['Electric', 'Gas - Forced Air', 'Heat Pump'], h >> 19));
  fill('occupants', pick(['1', '2', '3', '4'], h >> 21));
  fill('station_miles', String(pc <= 4 ? 2 : pc <= 6 ? 4 : pc <= 8 ? 5 : 8));
  fill('hydrant_feet', pc <= 4 ? '1-500' : pc <= 6 ? '501-1000' : pc <= 8 ? '1001-1500' : 'No hydrant');
  fill('smoke_detector', 'Local');
  d.prefilled_at = new Date().toISOString();
  return d;
}

const LOOKUP_STEPS = ['Locating the property', 'Reading property records', 'Estimating replacement cost'];

function LookupOverlay({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 750);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (i >= LOOKUP_STEPS.length) onDone(); }, [i, onDone]);
  return (
    <div className="fixed inset-0 z-[300] bg-[#15181c]/95 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Home lookup">
      <div className="text-center text-white bg-[#22262c] border border-white/10 rounded-xl shadow-pop px-10 py-8">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-brand-600 grid place-items-center animate-pulse shadow-pop"><Home size={40} /></div>
        <div className="mt-5 text-[22px] font-semibold">Home Lookup</div>
        <div className="text-[13px] text-white/70 mt-1">Property records and replacement cost estimate</div>
        <div className="mt-6 w-72 mx-auto text-left space-y-2">
          {LOOKUP_STEPS.map((s, k) => (
            <div key={s} className={cx('flex items-center gap-2 text-[13px]', k < i ? 'text-white' : k === i ? 'text-white' : 'text-white/40')}>
              {k < i ? <span className="w-4 h-4 rounded-full bg-emerald-500 grid place-items-center text-[10px]">✓</span> : k === i ? <Loader2 size={16} className="animate-spin" /> : <span className="w-4 h-4 rounded-full border border-white/40" />}
              {s}
            </div>
          ))}
        </div>
        <div className="mt-6 w-72 mx-auto h-1.5 rounded bg-white/15 overflow-hidden"><div className="h-full bg-brand-400 transition-all duration-700" style={{ width: `${Math.min(100, (i / LOOKUP_STEPS.length) * 100)}%` }} /></div>
        <div className="text-[11px] text-white/50 mt-4 max-w-xs mx-auto">Training simulation: uses the property on file, otherwise typical values for the address. Verify with the insured.</div>
      </div>
    </div>
  );
}

export function DwellingStep() {
  const { w, up, issues, account, property } = useHome();
  const { toast } = useFeedback();
  const [lookup, setLookup] = useState(false);
  const d = w.dwelling;
  const set = (patch: Partial<HomeWorkflow['dwelling']>) => up((x) => ({ ...x, dwelling: { ...x.dwelling, ...patch } }));
  const addr = d.alt_address ? `${d.alt_address.address}, ${d.alt_address.city} ${d.alt_address.zip}` : `${account.address ?? ''}, ${account.city ?? ''} ${account.zip ?? ''}`;
  const finish = () => {
    setLookup(false);
    up((x) => {
      const dwelling = lookupDwelling(x, property, addr);
      const rc = replacementCost(dwelling);
      return { ...x, dwelling, coverage: { ...x.coverage, replacement: x.coverage.replacement || String(rc), dwelling: x.coverage.dwelling || String(rc) } };
    });
    toast(property ? 'Dwelling info filled from the property on file' : 'Dwelling info filled with typical values for this address. Please verify.', property ? 'success' : 'info');
  };
  const f = (k: string) => `dwelling.${k}`;
  const alt = d.alt_address;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <TextBtn onClick={() => setLookup(true)}>Prefill Dwelling Info</TextBtn>
        <TextBtn onClick={() => set({ alt_address: alt ?? { address: '', city: '', state: w.rating.state, zip: '' } })}>Add dwelling address</TextBtn>
        {d.prefilled_at && <span className="text-[11px] text-ink-500 self-center">Prefilled — review each value with the insured.</span>}
      </div>
      {alt && (
        <Card title="Dwelling Address" right={<button type="button" className="text-[12px] text-red-600 hover:underline" onClick={() => set({ alt_address: null })}>Remove</button>}>
          <div className={grid4}>
            <WInput field="dwelling.alt.address" label="Address" required value={alt.address} onChange={(address) => set({ alt_address: { ...alt, address } })} />
            <WInput field="dwelling.alt.city" label="City" value={alt.city} onChange={(city) => set({ alt_address: { ...alt, city } })} />
            <WSelect field="dwelling.alt.state" label="State" value={alt.state} onChange={(state) => set({ alt_address: { ...alt, state } })} options={US_STATES} />
            <WInput field="dwelling.alt.zip" label="ZIP" required inputMode="numeric" value={alt.zip} onChange={(zip) => set({ alt_address: { ...alt, zip: zip.replace(/\D/g, '').slice(0, 5) } })} />
          </div>
        </Card>
      )}
      <Card title="Home Info" ok={clean(issues, 'dwelling.usage', 'dwelling.occupancy', 'dwelling.type', 'dwelling.stories', 'dwelling.sqft', 'dwelling.year_built', 'dwelling.style', 'dwelling.roof', 'dwelling.foundation', 'dwelling.walls', 'dwelling.full_baths', 'dwelling.heating')}>
        <div className={grid4}>
          <WSelect field={f('usage')} label="Dwelling Usage" required value={d.usage} onChange={(usage) => set({ usage })} options={DWELLING_USAGE} />
          <WSelect field={f('occupancy')} label="Occupancy Type" required value={d.occupancy} onChange={(occupancy) => set({ occupancy })} options={OCCUPANCY} />
          <WSelect field={f('type')} label="Dwelling Type" required value={d.type} onChange={(type) => set({ type })} options={DWELLING_TYPE} />
          <WSelect field={f('occupants')} label="Number of Occupants" value={d.occupants} onChange={(occupants) => set({ occupants })} options={OCCUPANTS} />
          <WSelect field={f('stories')} label="Number of Stories" required value={d.stories} onChange={(stories) => set({ stories })} options={STORIES} />
          <WInput field={f('sqft')} label="Square Footage" required inputMode="numeric" value={d.sqft} onChange={(x) => set({ sqft: x.replace(/\D/g, '').slice(0, 5) })} />
          <WInput field={f('year_built')} label="Year Built" required inputMode="numeric" value={d.year_built} onChange={(x) => set({ year_built: x.replace(/\D/g, '').slice(0, 4) })} />
          <WSelect field={f('style')} label="Construction Style" required value={d.style} onChange={(style) => set({ style })} options={CONSTRUCTION_STYLE} />
          <WSelect field={f('roof_type')} label="Roof Type" required value={d.roof_type} onChange={(roof_type) => set({ roof_type })} options={ROOF_TYPE} />
          <WInput field={f('roof_year')} label="Year Roof Replaced" inputMode="numeric" value={d.roof_year} onChange={(x) => set({ roof_year: x.replace(/\D/g, '').slice(0, 4) })} />
          <WSelect field={f('foundation')} label="Foundation Type" required value={d.foundation} onChange={(foundation) => set({ foundation })} options={FOUNDATION} />
          <WSelect field={f('roof_design')} label="Roof Design" required value={d.roof_design} onChange={(roof_design) => set({ roof_design })} options={ROOF_DESIGN} />
          <WSelect field={f('walls')} label="Exterior Walls" required value={d.walls} onChange={(walls) => set({ walls })} options={EXTERIOR_WALLS} />
          <WSelect field={f('full_baths')} label="Number Of Full Baths" required value={d.full_baths} onChange={(full_baths) => set({ full_baths })} options={BATHS} />
          <WSelect field={f('half_baths')} label="Number Of Half Baths" value={d.half_baths} onChange={(half_baths) => set({ half_baths })} options={HALF_BATHS} />
          <WSelect field={f('stoves')} label="# of Wood Burning Stoves" value={d.stoves} onChange={(stoves) => set({ stoves })} options={STOVES} />
          <WSelect field={f('heating')} label="Heating Type" required value={d.heating} onChange={(heating) => set({ heating })} options={HEATING} />
          <WSelect field={f('secondary_heat')} label="Secondary Heating Source Type" value={d.secondary_heat} onChange={(secondary_heat) => set({ secondary_heat })} options={SECONDARY_HEAT} />
          <WSelect field={f('burglar_alarm')} label="Burglar Alarm" value={d.burglar_alarm} onChange={(burglar_alarm) => set({ burglar_alarm })} options={ALARM} />
          <WSelect field={f('roof_ul')} label="Roof UL Classification" value={d.roof_ul} onChange={(roof_ul) => set({ roof_ul })} options={ROOF_UL} />
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5">
          <Switch label="Dead Bolt" checked={d.dead_bolt} onChange={(dead_bolt) => set({ dead_bolt })} />
          <Switch label="Fire Extinguisher" checked={d.extinguisher} onChange={(extinguisher) => set({ extinguisher })} />
        </div>
      </Card>
      <Card title="Protective Devices" ok>
        <div className={grid4}>
          <WSelect field={f('fire_detection')} label="Fire Detection" value={d.fire_detection} onChange={(fire_detection) => set({ fire_detection })} options={DETECTION} />
          <WSelect field={f('sprinkler')} label="Sprinkler System" value={d.sprinkler} onChange={(sprinkler) => set({ sprinkler })} options={SPRINKLER} />
          <WSelect field={f('smoke_detector')} label="Smoke Detector" value={d.smoke_detector} onChange={(smoke_detector) => set({ smoke_detector })} options={DETECTION} />
        </div>
      </Card>
      <Card title="Geographical Info" ok={clean(issues, 'dwelling.purchase', 'dwelling.station', 'dwelling.hydrant')}>
        <div className={grid4}>
          <WInput field={f('purchase_price')} label="Purchase Price" inputMode="numeric" value={moneyShow(d.purchase_price)} onChange={(x) => set({ purchase_price: money(x) })} />
          <WInput field={f('purchase_date')} label="Purchase Date" required type="date" value={d.purchase_date} onChange={(purchase_date) => set({ purchase_date })} />
          <WSelect field={f('station_miles')} label="Distance From Fire Station (miles)" required value={d.station_miles} onChange={(station_miles) => set({ station_miles })} options={DISTANCE_MILES} />
          <WSelect field={f('hydrant_feet')} label="Feet From Hydrant" required value={d.hydrant_feet} onChange={(hydrant_feet) => set({ hydrant_feet })} options={HYDRANT_FEET} />
        </div>
      </Card>
      <CarrierQuestions step="dwelling" title="Carrier Questions" />
      <StepFooter back={{ label: 'Policy info', to: 'policy' }} next={{ label: 'Coverage', to: 'coverage' }} />
      {lookup && <LookupOverlay onDone={finish} />}
    </div>
  );
}

// ── Step 4: Coverage ──

export function CoverageStep() {
  const { w, up, issues } = useHome();
  const c = w.coverage;
  const set = (patch: Partial<HomeWorkflow['coverage']>) => up((x) => ({ ...x, coverage: { ...x.coverage, ...patch } }));
  const setInterest = (k: InterestKey, patch: Partial<HomeWorkflow['coverage']['interests'][InterestKey]>) => up((x) => ({ ...x, coverage: { ...x.coverage, interests: { ...x.coverage.interests, [k]: { ...x.coverage.interests[k], ...patch } } } }));
  const dwelling = num(c.dwelling);
  const amt = (p: string) => (dwelling ? `$${Math.round((dwelling * num(p)) / 100).toLocaleString('en-US')}` : '—');
  const rc = replacementCost(w.dwelling);
  const pctField = (label: string, value: string, options: string[], key: 'other_pct' | 'pp_pct' | 'lou_pct') => (
    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 items-center">
      <WSelect field={`coverage.${key}`} label={label} value={value} onChange={(v) => set({ [key]: v } as Partial<HomeWorkflow['coverage']>)} options={options} />
      <div className="text-[13px] text-ink-700 tabular-nums">{amt(value)}</div>
    </div>
  );
  return (
    <div>
      <SectionTitle ok={clean(issues, 'coverage.dwelling', 'coverage.replacement', 'coverage.liability', 'coverage.medpay', 'coverage.deductible', 'coverage.hurricane')}>General Coverages</SectionTitle>
      <div className={grid4}>
        <WInput field="coverage.dwelling" label="Dwelling" required inputMode="numeric" value={moneyShow(c.dwelling)} onChange={(x) => set({ dwelling: money(x) })} />
        <WInput field="coverage.replacement" label="Est. Replacement Cost" required inputMode="numeric" value={moneyShow(c.replacement)} onChange={(x) => set({ replacement: money(x) })}
          action={rc > 0 ? <button type="button" className="px-2 text-[11px] font-semibold text-brand-700 hover:underline whitespace-nowrap" onClick={() => set({ replacement: String(rc) })}>Calculate</button> : undefined} />
        <WSelect field="coverage.liability" label="Personal Liability" required value={c.liability} onChange={(liability) => set({ liability })} options={LIABILITY.map((v) => ({ value: v, label: `$${Number(v).toLocaleString('en-US')}` }))} />
        <WSelect field="coverage.medpay" label="Medical Payments" required value={c.medpay} onChange={(medpay) => set({ medpay })} options={MEDPAY.map((v) => ({ value: v, label: `$${Number(v).toLocaleString('en-US')}` }))} />
        <WSelect field="coverage.deductible" label="All Perils Deductible" required value={c.deductible} onChange={(deductible) => set({ deductible })} options={DEDUCTIBLE.map((v) => ({ value: v, label: v.endsWith('%') ? v : `$${Number(v).toLocaleString('en-US')}` }))} />
        {pctField('Other Structures %', c.other_pct, OTHER_STRUCT_PCT, 'other_pct')}
        {pctField('Personal Property %', c.pp_pct, PERSONAL_PROPERTY_PCT, 'pp_pct')}
        {pctField('Loss Of Use %', c.lou_pct, LOSS_OF_USE_PCT, 'lou_pct')}
        <WSelect field="coverage.theft_ded" label="Theft Deductible" value={c.theft_ded} onChange={(theft_ded) => set({ theft_ded })} options={THEFT_DED} />
        <WSelect field="coverage.wind_ded" label="Wind Deductible" value={c.wind_ded} onChange={(wind_ded) => set({ wind_ded })} options={WIND_DED} />
        <WSelect field="coverage.hurricane_ded" label="Hurricane Deductible" value={c.hurricane_ded} onChange={(hurricane_ded) => set({ hurricane_ded })} options={HURRICANE_DED} />
      </div>
      {rc > 0 && dwelling > 0 && dwelling < rc * 0.8 && <div className="mt-3"><Notice tone="red">Dwelling is below 80% of the estimated replacement cost (${rc.toLocaleString('en-US')}). Claims may be subject to coinsurance.</Notice></div>}

      <SectionTitle ok={clean(issues, 'coverage.interest', 'coverage.other_interests')}>Financial Interests Information</SectionTitle>
      <div className="bg-white border border-ink-200 rounded px-4 max-w-[900px]">
        {INTERESTS.map((it) => {
          const v = c.interests[it.key];
          return (
            <Question key={it.key} label={it.label} checked={v.on} onChange={(on) => setInterest(it.key, { on })} field={`coverage.interest.${it.key}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[640px] pb-1">
                <WInput field={`coverage.interest.${it.key}`} label="Name" required value={v.name} onChange={(name) => setInterest(it.key, { name })} maxLength={60} />
                <WInput field={`coverage.interest.${it.key}.loan`} label="Loan Number" value={v.loan} onChange={(loan) => setInterest(it.key, { loan })} maxLength={30} />
              </div>
            </Question>
          );
        })}
        <div className="py-3 max-w-[220px]"><WInput field="coverage.other_interests" label="# of Other Interests" required inputMode="numeric" value={c.other_interests} onChange={(x) => set({ other_interests: x.replace(/\D/g, '').slice(0, 2) })} /></div>
      </div>
      <StepFooter back={{ label: 'Dwelling info', to: 'dwelling' }} next={{ label: 'Endorsements', to: 'endorsements' }} />
    </div>
  );
}

// ── Step 5: Endorsements ──

export function EndorsementsStep() {
  const { w, up, issues } = useHome();
  const e = w.endorsements;
  const set = (patch: Partial<HomeWorkflow['endorsements']>) => up((x) => ({ ...x, endorsements: { ...x.endorsements, ...patch } }));
  const setSpp = (k: SppKey, patch: Partial<HomeWorkflow['endorsements']['spp'][SppKey]>) => up((x) => ({ ...x, endorsements: { ...x.endorsements, spp: { ...x.endorsements.spp, [k]: { ...x.endorsements.spp[k], ...patch } } } }));
  const dollars = (list: string[]) => list.map((v) => ({ value: v, label: v === NONE ? NONE : v.endsWith('%') ? v : `$${v}` }));
  const f = (k: string) => `endorsements.${k}`;
  return (
    <div>
      <SectionTitle ok>Endorsements</SectionTitle>
      <div className={grid4}>
        <WSelect field={f('additions')} label="Building Additions or Alterations" value={e.additions} onChange={(additions) => set({ additions })} options={dollars(E_ADDITIONS)} />
        <WSelect field={f('increased_rc')} label="Increased Replacement Cost Dwelling Percent" value={e.increased_rc} onChange={(increased_rc) => set({ increased_rc })} options={dollars(E_INCREASED_RC)} />
        <WSelect field={f('loss_assessment')} label="Loss Assessment" value={e.loss_assessment} onChange={(loss_assessment) => set({ loss_assessment })} options={dollars(E_LOSS_ASSESSMENT)} />
        <WSelect field={f('ordinance')} label="Ordinance or Law" value={e.ordinance} onChange={(ordinance) => set({ ordinance })} options={dollars(E_ORDINANCE)} />
        <WSelect field={f('credit_card')} label="Increased Coverage on Credit Card" value={e.credit_card} onChange={(credit_card) => set({ credit_card })} options={dollars(E_CREDIT_CARD)} />
        <WSelect field={f('jewelry')} label="Increased Limit on Jewelry, Watches and Furs" value={e.jewelry} onChange={(jewelry) => set({ jewelry })} options={dollars(E_JEWELRY)} />
        <WSelect field={f('water_backup')} label="Water Backup" value={e.water_backup} onChange={(water_backup) => set({ water_backup })} options={dollars(E_WATER_BACKUP)} />
        <WSelect field={f('mold')} label="Increased Mold Property Damage" value={e.mold} onChange={(mold) => set({ mold })} options={dollars(E_MOLD)} />
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5">
        <Switch label="Identity Theft" checked={e.identity_theft} onChange={(identity_theft) => set({ identity_theft })} />
        <Switch label="Replacement Cost Content" checked={e.rc_contents} onChange={(rc_contents) => set({ rc_contents })} />
        <Switch label="Personal Injury" checked={e.personal_injury} onChange={(personal_injury) => set({ personal_injury })} />
        <Switch label="Special Personal Property" checked={e.special_pp} onChange={(special_pp) => set({ special_pp })} />
        <Switch label="Sinkhole Collapse" checked={e.sinkhole} onChange={(sinkhole) => set({ sinkhole })} />
      </div>

      <SectionTitle ok={clean(issues, 'endorsements.eq')}>Earthquake</SectionTitle>
      <div className={grid4}>
        <WSelect field={f('eq_zone')} label="Earthquake Zone" value={e.eq_zone} onChange={(eq_zone) => set({ eq_zone, ...(eq_zone === NONE ? { eq_ded: '', eq_veneer: '' } : { eq_ded: e.eq_ded || '10%', eq_veneer: e.eq_veneer || '0%' }) })} options={EQ_ZONE} />
        <WSelect field={f('eq_ded')} label="Deductible" required={e.eq_zone !== NONE} value={e.eq_ded} onChange={(eq_ded) => set({ eq_ded })} options={EQ_DED} disabled={e.eq_zone === NONE} />
        <WSelect field={f('eq_veneer')} label="Percent Veneer" required={e.eq_zone !== NONE} value={e.eq_veneer} onChange={(eq_veneer) => set({ eq_veneer })} options={EQ_VENEER} disabled={e.eq_zone === NONE} />
        <div className="flex items-center"><Switch label="Exclude Masonry Veneer" checked={e.eq_exclude_veneer} disabled={e.eq_zone === NONE} onChange={(eq_exclude_veneer) => set({ eq_exclude_veneer })} /></div>
      </div>

      <SectionTitle ok={clean(issues, 'endorsements.biz')}>Business Pursuits</SectionTitle>
      <div className={grid4}>
        <WInput field={f('biz_name')} label="Business Name" value={e.biz_name} onChange={(biz_name) => set({ biz_name })} maxLength={60} />
        <WSelect field={f('biz_class')} label="Business Class" required={!!e.biz_name.trim()} value={e.biz_class} onChange={(biz_class) => set({ biz_class })} options={BUSINESS_CLASS.filter(Boolean)} />
        <div className="flex items-center"><Switch label="Incidental Business" checked={e.incidental_business} onChange={(incidental_business) => set({ incidental_business })} /></div>
      </div>

      <SectionTitle ok={clean(issues, 'endorsements.spp')}>Scheduled Personal Property</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 max-w-[900px]">
        {SPP_CLASSES.map((sc) => (
          <div key={sc.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center">
            <WInput field={f(`spp.${sc.key}`)} label={sc.label} inputMode="numeric" value={moneyShow(e.spp[sc.key].amount)} onChange={(x) => setSpp(sc.key, { amount: money(x).slice(0, 7) })} />
            <Switch label="Breakage" checked={e.spp[sc.key].breakage} disabled={!e.spp[sc.key].amount} onChange={(breakage) => setSpp(sc.key, { breakage })} />
          </div>
        ))}
      </div>
      <StepFooter back={{ label: 'Coverage', to: 'coverage' }} next={{ label: 'Carrier Questions', to: 'carrier' }} />
    </div>
  );
}

// ── Step 6: Carrier Questions ──

export function CarrierStep() {
  const { w, homeCarriers } = useHome();
  const names = homeCarriers.map((c) => c.name);
  const any = w.rating.carriers.some((c) => stepQuestions('carrier', [c], names).length);
  return (
    <div>
      <div className="bg-white border border-ink-200 rounded shadow-card p-4">
        <h3 className="text-[15px] text-ink-900 mb-2">Carrier Questions</h3>
        {!w.rating.carriers.length && <p className="text-[13px] text-ink-500">Select carriers on the Rating step first.</p>}
        {w.rating.carriers.length > 0 && !any && <p className="text-[13px] text-ink-500">No additional questions for the selected carriers.</p>}
        <CarrierQuestions step="carrier" />
      </div>
      <StepFooter back={{ label: 'Endorsements', to: 'endorsements' }} next={{ label: 'Finish', to: 'review' }} />
    </div>
  );
}
