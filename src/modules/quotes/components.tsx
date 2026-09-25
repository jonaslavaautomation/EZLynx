import { ChevronDown, ChevronRight, Info, Trophy } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Badge, Button, DescriptionList, Field, Input, Select, StatusBadge, cx } from '@/components/ui';
import { age, fmtDate, fmtMoney } from '@/lib/format';
import type { CarrierRate, LineOfBusiness } from '@/lib/types';
import { classLabel, sectionOf, wcLabel, type QuoteInput } from './inputs';
import { monthlyEstimate, sortRates, type RatedCarrier } from './rating';
import { sortByPref, sortPrefFor, useUserPreferences } from '@/modules/usersettings/data';

// ── Form helpers ──

export function SimulatedNote({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-start gap-1.5 text-[11px] text-ink-400', className)}>
      <Info size={12} className="shrink-0 mt-px" />
      <span>Simulated rates — not bindable carrier quotes. Premiums come from the built-in rating model, not live carrier connections.</span>
    </div>
  );
}

const shown = (n: number) => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '');
const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function NumField({ label, value, onChange, error, min, max, step, hint, required, className }: {
  label: string; value: number; onChange: (n: number) => void; error?: string; min?: number; max?: number; step?: number; hint?: string; required?: boolean; className?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <Input type="number" inputMode="decimal" value={shown(value)} min={min} max={max} step={step} onChange={(e) => onChange(parseNum(e.target.value))} />
    </Field>
  );
}

export function TextField({ label, value, onChange, error, required, placeholder, type = 'text', className, hint, maxLength }: {
  label: string; value: string; onChange: (s: string) => void; error?: string; required?: boolean; placeholder?: string; type?: string; className?: string; hint?: string; maxLength?: number;
}) {
  return (
    <Field label={label} error={error} required={required} className={className} hint={hint}>
      <Input type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField<T extends string | number>({ label, value, onChange, options, error, required, className, placeholder, hint }: {
  label: string; value: T; onChange: (v: T) => void; options: (T | { value: T; label: string })[]; error?: string; required?: boolean; className?: string; placeholder?: string; hint?: string;
}) {
  const isNum = typeof value === 'number' || options.some((o) => typeof (typeof o === 'object' ? o.value : o) === 'number');
  const opts = options.map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label } : { value: String(o), label: String(o) }));
  return (
    <Field label={label} error={error} required={required} className={className} hint={hint}>
      <Select value={String(value ?? '')} placeholder={placeholder} options={opts} onChange={(e) => onChange((isNum ? Number(e.target.value) : e.target.value) as T)} />
    </Field>
  );
}


export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 mt-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{children}</h3>
      {actions}
    </div>
  );
}

// ── Comparison ──

export function ComparisonTable({ rates, onSelect, selectLabel = 'Select', selectedCarrier, selectDisabledReason, line }: {
  rates: CarrierRate[]; onSelect?: (r: CarrierRate) => void; selectLabel?: string; selectedCarrier?: string | null; selectDisabledReason?: string | null; line?: LineOfBusiness | null;
}) {
  // Sort order and emphasized payment column come from User Settings → Preferences.
  const prefs = useUserPreferences();
  const sorted = sortByPref(rates, sortPrefFor(prefs, line));
  const monthlyFirst = prefs.payment_option === 'monthly';
  const quoted = sortRates(rates).filter((r) => r.status === 'Quoted' && r.premium !== null);
  const low = quoted[0]?.premium ?? null;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (c: string) => setOpen((o) => ({ ...o, [c]: !o[c] }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <th className="px-3 py-2 text-left w-8" />
            <th className="px-3 py-2 text-left">Carrier</th>
            <th className={cx('px-3 py-2 text-right whitespace-nowrap', !monthlyFirst && 'text-ink-700')}>{monthlyFirst ? 'Term premium' : 'Paid in full'}</th>
            <th className={cx('px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell', monthlyFirst && 'text-ink-700')}>Monthly est.</th>
            <th className="px-3 py-2 text-left">Status</th>
            {onSelect && <th className="px-3 py-2 text-right" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isLow = r.premium !== null && r.premium === low && r.status === 'Quoted';
            const isSel = selectedCarrier === r.carrier;
            const expanded = !!open[r.carrier];
            const rr = r as RatedCarrier;
            return (
              <Fragment key={r.carrier}>
                <tr className={cx('border-b border-ink-50', isSel ? 'bg-emerald-50/60' : isLow ? 'bg-brand-50/70' : '', r.status !== 'Quoted' && 'text-ink-400')}>
                  <td className="px-3 py-2.5 align-top">
                    <button type="button" onClick={() => toggle(r.carrier)} className="bg-transparent text-ink-400 hover:text-ink-800 mt-0.5" aria-label={expanded ? 'Hide details' : 'Show details'} aria-expanded={expanded}>
                      {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <button type="button" onClick={() => toggle(r.carrier)} className="bg-transparent text-left font-semibold text-ink-900 hover:text-brand-600">{r.carrier}</button>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {isLow && <Badge tone="teal"><Trophy size={11} /> Lowest</Badge>}
                      {isSel && <Badge tone="green">Selected</Badge>}
                    </div>
                    {r.status !== 'Quoted' && r.message && <div className="text-xs text-red-600 mt-1">{r.message}</div>}
                    {r.status === 'Quoted' && r.message && <div className="text-xs text-amber-700 mt-1">{r.message}</div>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums whitespace-nowrap">
                    {r.premium !== null ? (
                      <>
                        <div className={cx('font-semibold', isLow ? 'text-brand-700' : 'text-ink-900')}>{fmtMoney(r.premium)}</div>
                        <div className="text-[11px] text-ink-400">{r.term_months} mo{low !== null && r.premium > low ? ` · +${fmtMoney(r.premium - low)}` : ''}</div>
                        <div className="text-[11px] text-ink-400 sm:hidden">~{fmtMoney(monthlyEstimate(r), true)}/mo</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className={cx('px-3 py-2.5 align-top text-right tabular-nums hidden sm:table-cell', monthlyFirst && r.premium !== null && 'font-semibold text-ink-900')}>{r.premium !== null ? `${fmtMoney(monthlyEstimate(r), true)}` : '—'}</td>
                  <td className="px-3 py-2.5 align-top"><StatusBadge status={r.status} /></td>
                  {onSelect && (
                    <td className="px-3 py-2.5 align-top text-right">
                      {r.status === 'Quoted' && (
                        <Button size="sm" variant={isLow ? 'primary' : 'secondary'} disabled={!!selectDisabledReason} title={selectDisabledReason ?? undefined} onClick={() => onSelect(r)}>{selectLabel}</Button>
                      )}
                    </td>
                  )}
                </tr>
                {expanded && (
                  <tr className="border-b border-ink-100 bg-ink-50/40">
                    <td />
                    <td colSpan={onSelect ? 5 : 4} className="px-3 py-3">
                      {r.coverages.length ? (
                        <table className="w-full text-xs max-w-xl">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-ink-400">
                              <th className="text-left py-1 pr-2">Coverage</th><th className="text-left py-1 pr-2">Limit</th><th className="text-left py-1 pr-2">Deductible</th><th className="text-right py-1">Premium</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.coverages.map((c) => (
                              <tr key={c.name} className="border-t border-ink-100">
                                <td className="py-1 pr-2 text-ink-800">{c.name}</td>
                                <td className="py-1 pr-2 text-ink-600">{c.limit}</td>
                                <td className="py-1 pr-2 text-ink-600">{c.deductible ?? '—'}</td>
                                <td className="py-1 text-right tabular-nums text-ink-800">{c.premium ? fmtMoney(c.premium) : c.premium === 0 ? 'Incl.' : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <div className="text-xs text-ink-400">{r.status === 'Quoted' ? 'No coverage breakdown returned.' : 'No coverages — carrier did not offer terms.'}</div>}
                      {(rr.discounts?.length || rr.surcharges?.length) ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rr.discounts?.map((d) => <Badge key={d} tone="green">{d}</Badge>)}
                          {rr.surcharges?.map((d) => <Badge key={d} tone="amber">{d}</Badge>)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Side-by-side coverage limits for each quoting carrier. */
export function CoverageMatrix({ rates }: { rates: CarrierRate[] }) {
  const quoted = sortRates(rates).filter((r) => r.status === 'Quoted');
  if (!quoted.length) return <div className="text-[13px] text-ink-400 py-6 text-center">No carriers returned terms to compare.</div>;
  const names: string[] = [];
  quoted.forEach((r) => r.coverages.forEach((c) => { if (!names.includes(c.name)) names.push(c.name); }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400 sticky left-0 bg-ink-50">Coverage</th>
            {quoted.map((r) => <th key={r.carrier} className="px-3 py-2 text-left text-[11px] font-semibold text-ink-700 whitespace-nowrap">{r.carrier}</th>)}
          </tr>
        </thead>
        <tbody>
          {names.map((n) => (
            <tr key={n} className="border-b border-ink-50">
              <td className="px-3 py-1.5 text-ink-800 font-medium sticky left-0 bg-white whitespace-nowrap">{n}</td>
              {quoted.map((r) => {
                const c = r.coverages.find((x) => x.name === n);
                return (
                  <td key={r.carrier} className="px-3 py-1.5 text-ink-600 whitespace-nowrap">
                    {c ? <>{c.limit}{c.deductible ? <span className="text-ink-400"> · ded {c.deductible}</span> : null}{c.premium ? <span className="text-ink-400"> · {fmtMoney(c.premium)}</span> : null}</> : <span className="text-ink-300">Not included</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="bg-ink-50/60 font-semibold">
            <td className="px-3 py-2 text-ink-900 sticky left-0 bg-ink-50">Total term premium</td>
            {quoted.map((r) => <td key={r.carrier} className="px-3 py-2 text-ink-900 tabular-nums">{fmtMoney(r.premium)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Input summary ──

const yes = (b: boolean | undefined) => (b ? 'Yes' : 'No');
const m = (n: number | undefined) => fmtMoney(n ?? null);

export function InputSummary({ line, input }: { line: LineOfBusiness; input: Partial<QuoteInput> }) {
  const key = sectionOf(line);
  const sec = input[key];
  if (!sec) return <div className="text-[13px] text-ink-400 py-4">No rating inputs were captured for this quote. Use <strong>Edit</strong> to complete them.</div>;
  if (key === 'auto' && input.auto) {
    const a = input.auto;
    return (
      <div className="space-y-4">
        <DescriptionList columns={4} items={[
          { label: 'Rating state', value: a.state }, { label: 'Term', value: `${a.term_months} months` }, { label: 'Prior insurance', value: a.prior_insurance },
          { label: 'Bodily injury', value: a.bi }, { label: 'Property damage', value: m(a.pd) }, { label: 'Uninsured motorist', value: a.um ? a.bi : 'Rejected' },
          { label: 'Medical payments', value: a.medpay ? m(a.medpay) : 'None' }, { label: 'Comp / Coll deductible', value: `${a.comp_ded ? m(a.comp_ded) : 'None'} / ${a.coll_ded ? m(a.coll_ded) : 'None'}` },
          { label: 'Rental / Towing', value: `${yes(a.rental)} / ${yes(a.towing)}` }, { label: 'Homeowner', value: yes(a.homeowner) }, { label: 'Multi-policy', value: yes(a.multi_policy) }, { label: 'Paid in full', value: yes(a.paid_in_full) },
        ]} />
        <MiniTable title="Drivers" head={['Name', 'Age', 'Relationship', 'License', 'Viol.', 'Acc.']} rows={a.drivers.map((d) => [
          `${d.first_name} ${d.last_name}`, d.dob ? `${age(d.dob)} (${fmtDate(d.dob)})` : '—', d.relationship || '—', [d.license_state, d.license_number].filter(Boolean).join(' ') || '—', String(d.violations), String(d.accidents),
        ])} />
        <MiniTable title="Vehicles" head={['Vehicle', 'VIN', 'Usage', 'Miles/yr', 'Garaging ZIP', 'Est. value']} rows={a.vehicles.map((v) => [
          `${v.year} ${v.make} ${v.model}`, v.vin || '—', v.usage, (v.annual_miles ?? 0).toLocaleString(), v.garaging_zip, m(v.value),
        ])} />
      </div>
    );
  }
  if (key === 'home' && input.home) {
    const h = input.home;
    return <DescriptionList columns={4} items={[
      { label: 'Location', value: [h.address, h.city, h.state, h.zip].filter(Boolean).join(', ') }, { label: 'Year built', value: h.year_built }, { label: 'Square feet', value: h.square_feet?.toLocaleString() },
      { label: 'Construction', value: h.construction }, { label: 'Roof', value: `${h.roof_type} (${h.roof_year})` }, { label: 'Protection class', value: h.protection_class },
      { label: 'Claims (5 yrs)', value: h.claims_5yr }, { label: 'Alarm / Sprinklers', value: `${yes(h.alarm)} / ${yes(h.sprinklers)}` },
      { label: 'Dwelling (A)', value: m(h.dwelling) }, { label: 'Personal property', value: `${h.personal_property_pct}% of A` }, { label: 'Deductible', value: m(h.deductible) },
      { label: 'Liability / Med pay', value: `${m(h.liability)} / ${m(h.medpay)}` }, { label: 'Multi-policy', value: yes(h.multi_policy) }, { label: 'Paid in full', value: yes(h.paid_in_full) },
    ]} />;
  }
  if (key === 'renters' && input.renters) {
    const r = input.renters;
    return <DescriptionList columns={4} items={[
      { label: 'Location', value: [r.address, r.city, r.state, r.zip].filter(Boolean).join(', ') }, { label: 'Personal property', value: m(r.personal_property) },
      { label: 'Liability', value: m(r.liability) }, { label: 'Medical payments', value: m(r.medpay) }, { label: 'Deductible', value: m(r.deductible) },
      { label: 'Claims (5 yrs)', value: r.claims_5yr }, { label: 'Alarm', value: yes(r.alarm) }, { label: 'Multi-policy', value: yes(r.multi_policy) }, { label: 'Paid in full', value: yes(r.paid_in_full) },
    ]} />;
  }
  if (key === 'condo' && input.condo) {
    const c = input.condo;
    return <DescriptionList columns={4} items={[
      { label: 'Location', value: [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') }, { label: 'Year built', value: c.year_built }, { label: 'Protection class', value: c.protection_class },
      { label: 'Walls-in (A)', value: m(c.dwelling) }, { label: 'Personal property', value: m(c.personal_property) }, { label: 'Liability', value: m(c.liability) },
      { label: 'Deductible', value: m(c.deductible) }, { label: 'Loss assessment', value: m(c.loss_assessment) }, { label: 'Claims (5 yrs)', value: c.claims_5yr },
      { label: 'Alarm', value: yes(c.alarm) }, { label: 'Multi-policy', value: yes(c.multi_policy) }, { label: 'Paid in full', value: yes(c.paid_in_full) },
    ]} />;
  }
  if (key === 'umbrella' && input.umbrella) {
    const u = input.umbrella;
    return <DescriptionList columns={4} items={[
      { label: 'State', value: u.state }, { label: 'Limit', value: m(u.limit * 1_000_000) }, { label: 'Autos', value: u.autos }, { label: 'Youthful drivers', value: u.youthful_drivers },
      { label: 'Residences', value: u.residences }, { label: 'Rental units', value: u.rental_units }, { label: 'Watercraft', value: u.watercraft }, { label: 'Household violations', value: u.violations },
      { label: 'Underlying auto BI', value: u.underlying_auto_bi }, { label: 'Underlying home liability', value: m(u.underlying_home_liability) },
    ]} />;
  }
  if (key === 'commercial' && input.commercial) {
    const c = input.commercial;
    return <DescriptionList columns={4} items={[
      { label: 'Business', value: c.business_name }, { label: 'Class', value: classLabel(c.class_key) }, { label: 'Location', value: `${c.state} ${c.zip}` },
      { label: 'Annual revenue', value: m(c.revenue) }, { label: 'Employees', value: c.employees }, { label: 'Years in business', value: c.years_in_business }, { label: 'Claims (5 yrs)', value: c.claims_5yr },
      { label: 'GL limits', value: c.gl_limit },
      ...(line === 'BOP' ? [
        { label: 'Building', value: c.building_value ? m(c.building_value) : 'Tenant (none)' }, { label: 'Business property', value: m(c.bpp_value) },
        { label: 'Construction', value: c.construction }, { label: 'Protection class', value: c.protection_class }, { label: 'Deductible', value: m(c.deductible) },
      ] : []),
    ]} />;
  }
  if (key === 'wc' && input.wc) {
    const w = input.wc;
    return (
      <div className="space-y-4">
        <DescriptionList columns={4} items={[
          { label: 'State', value: w.state }, { label: 'Employees', value: w.employees }, { label: 'Experience mod', value: w.experience_mod?.toFixed(2) },
          { label: "Employer's liability", value: w.el_limits }, { label: 'Years in business', value: w.years_in_business }, { label: 'Claims (5 yrs)', value: w.claims_5yr },
          { label: 'Total payroll', value: m(w.classes.reduce((s, c) => s + (c.payroll || 0), 0)) },
        ]} />
        <MiniTable title="Class codes" head={['Code', 'Description', 'Payroll']} rows={w.classes.map((c) => [c.code, wcLabel(c.code), m(c.payroll)])} />
      </div>
    );
  }
  if (key === 'cauto' && input.cauto) {
    const c = input.cauto;
    return (
      <div className="space-y-4">
        <DescriptionList columns={4} items={[
          { label: 'State', value: c.state }, { label: 'Business class', value: classLabel(c.class_key) }, { label: 'Radius', value: c.radius }, { label: 'Years in business', value: c.years_in_business },
          { label: 'Drivers', value: c.drivers }, { label: 'Drivers w/ violations', value: c.drivers_with_violations }, { label: 'Combined single limit', value: m(c.csl) },
          { label: 'Comp / Coll deductible', value: `${c.comp_ded ? m(c.comp_ded) : 'None'} / ${c.coll_ded ? m(c.coll_ded) : 'None'}` }, { label: 'Hired & non-owned', value: yes(c.hnoa) },
        ]} />
        <MiniTable title="Vehicles" head={['Year', 'Type', 'Value']} rows={c.vehicles.map((v) => [String(v.year), v.type, m(v.value)])} />
      </div>
    );
  }
  return null;
}

function MiniTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <SectionTitle>{title} ({rows.length})</SectionTitle>
      <div className="overflow-x-auto border border-ink-100 rounded">
        <table className="w-full text-xs">
          <thead><tr className="bg-ink-50/60">{head.map((h) => <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-ink-50">{r.map((c, j) => <td key={j} className="px-3 py-1.5 text-ink-800 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
