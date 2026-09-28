import type { Account, Carrier, Coverage } from '@/lib/types';
import { RESTRICTED_BREEDS } from '@/modules/quotes/reference';
import { rateQuote, sortRates } from '@/modules/quotes/rating';
import {
  NONE, SPP_CLASSES, ageOfHome, answerKey, num, protectionClass, questionsFor, toHomeInput,
  type HomeWorkflow, type Rated,
} from './model';

/*
 * Prices a home workflow: the comparative rater's Homeowners model, then everything it doesn't model — form type,
 * underwriting and eligibility, dwelling features, coverage percentages and deductibles, endorsements, earthquake,
 * scheduled property and each carrier's answers. Illustrative training rates.
 */

type Adj = { factor: number; discounts: string[]; surcharges: string[]; endorsements: { name: string; limit: string; premium: number }[]; uw: string[]; decline: string | null };
const pct = (f: number) => `${Math.round(Math.abs(1 - f) * 100)}%`;
const money = (x: number) => x.toLocaleString('en-US');

function adjustments(w: HomeWorkflow, carrier: string, homeCarriers: string[]): Adj {
  const a: Adj = { factor: 1, discounts: [], surcharges: [], endorsements: [], uw: [], decline: null };
  const credit = (label: string, f: number) => { a.factor *= f; a.discounts.push(`${label} ${pct(f)}`); };
  const surcharge = (label: string, f: number) => { a.factor *= f; a.surcharges.push(`${label} +${pct(f)}`); };
  const add = (name: string, limit: string, premium: number) => { if (premium > 0) a.endorsements.push({ name, limit, premium: Math.round(premium) }); };
  const set = Math.max(0, [...homeCarriers].sort().indexOf(carrier)) % 4;
  const p = w.policy, d = w.dwelling, c = w.coverage, e = w.endorsements;
  const dwelling = num(c.dwelling, 250000);
  const ans = (q: string) => (questionsFor(carrier, homeCarriers).some((x) => x.id === q) ? w.answers[answerKey(carrier, q)] ?? '' : '');

  // Eligibility
  if (p.under_construction) a.decline = 'Dwellings under construction are not eligible';
  else if (d.occupancy === 'Vacant') a.decline = 'Vacant dwellings are not eligible';
  else if (p.cancelled && set === 0) a.decline = 'Property insurance cancelled, declined or non-renewed in the last 5 years';
  else if (p.credit_auth === 'No' && set === 0) a.decline = 'Credit authorization is required by this carrier';
  else if (p.dogs && p.dog_bite === 'Yes' && set === 1) a.decline = 'Dogs with a bite history are not eligible';
  else if (p.trampoline && set === 2) a.decline = 'Trampolines on premises are not eligible';
  else if (p.business && num(p.employees) > 0 && set === 3) a.decline = 'Businesses with employees on premises are not eligible';
  else if (ans('open_claims') === 'Yes') a.decline = 'Open claims or pending litigation on the property';

  // Form type
  const form = w.rating.form;
  if (/HO2/.test(form)) credit('Broad form (HO2)', 0.9);
  else if (/HO5/.test(form)) surcharge('Comprehensive form (HO5)', 1.15);
  else if (/HO8/.test(form)) credit('Modified coverage (HO8)', 0.85);

  // Underwriting
  if (p.cancelled) surcharge('Prior cancellation / non-renewal', 1.25);
  if (p.credit_auth === 'No') surcharge('No credit authorization', 1.1);
  if (p.trampoline) { surcharge('Trampoline', 1.05); a.uw.push('Trampoline on premises: safety netting and enclosure required.'); }
  if (p.pool) { surcharge('Swimming pool', 1.05); a.uw.push('Swimming pool: a locking fence at least 4 ft high is required; no diving board or slide.'); }
  if (p.business) { surcharge('Business on premises', 1.1 + Math.min(0.1, num(p.employees) * 0.02)); a.uw.push(`Business or daycare on premises${num(p.employees) ? ` with ${num(p.employees)} employee(s)` : ''}: business liability is excluded without an endorsement.`); }
  if (p.dogs) {
    const restricted = RESTRICTED_BREEDS.includes(p.dog_breed);
    surcharge(restricted ? 'Restricted dog breed' : 'Dog on premises', restricted ? 1.12 : 1.03);
    a.uw.push(`Dog on premises (${p.dog_breed || 'breed not given'})${restricted ? ', a restricted breed: animal liability exclusion may apply' : ''}${p.dog_bite === 'Yes' ? ', with bite history' : ''}.`);
    if (restricted && set === 2 && !a.decline) a.decline = `${p.dog_breed} is a restricted breed with this carrier`;
  }

  // Dwelling
  if (d.usage === 'Secondary') surcharge('Secondary residence', 1.15);
  if (d.usage === 'Seasonal') surcharge('Seasonal residence', 1.3);
  if (d.occupancy === 'Tenant Occupied') surcharge('Tenant occupied', 1.2);
  if (num(d.stoves) > 0) { surcharge(`${num(d.stoves)} wood-burning stove${num(d.stoves) > 1 ? 's' : ''}`, 1 + 0.05 * num(d.stoves)); a.uw.push('Wood-burning stove: professional installation and a UL-listed unit are required.'); }
  if (/Oil|Wood/.test(d.heating)) surcharge(`${d.heating} heat`, /Wood/.test(d.heating) ? 1.1 : 1.05);
  if (/Space Heater/.test(d.secondary_heat)) surcharge('Space heater as secondary heat', 1.04);
  if (d.burglar_alarm === 'Local') credit('Local burglar alarm', 0.97);
  if (d.fire_detection === 'Local') credit('Local fire alarm', 0.97);
  if (d.fire_detection === 'Central Station') credit('Central station fire alarm', 0.94);
  if (d.sprinkler === 'Partial') credit('Partial sprinklers', 0.95);
  if (d.smoke_detector && d.smoke_detector !== 'None') credit('Smoke detectors', 0.98);
  if (d.dead_bolt) credit('Dead bolt locks', 0.99);
  if (d.extinguisher) credit('Fire extinguisher', 0.99);
  if (/Class 4/.test(d.roof_ul)) credit('Impact-resistant roof', 0.9);
  if (d.roof_design === 'Hip') credit('Hip roof', 0.95);
  if (d.roof_design === 'Flat') surcharge('Flat roof', 1.05);
  if (/Pier/.test(d.foundation)) surcharge('Pier foundation', 1.04);
  if (ageOfHome(w) >= 70) a.uw.push(`Home built in ${d.year_built}: updated plumbing, electrical, heating and roof are required.`);
  const roofAge = new Date().getFullYear() - num(d.roof_year, num(d.year_built, new Date().getFullYear()));
  if (roofAge > 15) a.uw.push(`Roof age ${roofAge} years: an inspection may be required at binding.`);
  const pc = protectionClass(d.station_miles, d.hydrant_feet);
  if (pc >= 9) a.uw.push(`Protection class ${pc}: the dwelling is more than 1,000 ft from a hydrant or 5 miles from a fire station.`);

  // Coverage options (the rater assumes 10% other structures, 20% loss of use and one all-perils deductible)
  const os = num(c.other_pct, 10);
  if (os > 10) add('Other Structures increase', `${os}%`, dwelling * ((os - 10) / 100) * 0.0035);
  const lou = num(c.lou_pct, 20);
  if (lou > 20) add('Loss of Use increase', `${lou}%`, dwelling * ((lou - 20) / 100) * 0.0015);
  if (c.wind_ded.endsWith('%')) credit(`Wind/hail ${c.wind_ded} deductible`, { '1%': 0.97, '2%': 0.93, '5%': 0.85 }[c.wind_ded] ?? 1);
  else if (c.wind_ded === '2500') credit('Wind/hail $2,500 deductible', 0.96);
  if (c.theft_ded === '2500') credit('Theft $2,500 deductible', 0.99);
  if (c.hurricane_ded !== 'None') credit(`Hurricane ${c.hurricane_ded} deductible`, { '2%': 0.97, '5%': 0.92, '10%': 0.86 }[c.hurricane_ded] ?? 1);

  // Endorsements (annual premium)
  const amt = (x: string) => num(x.replace(/,/g, ''));
  if (e.additions !== NONE) add('Building Additions or Alterations', e.additions, amt(e.additions) * 0.004);
  if (e.increased_rc !== NONE) add('Increased Replacement Cost Dwelling', e.increased_rc, dwelling * (e.increased_rc === '50%' ? 0.0007 : 0.0004));
  if (e.loss_assessment !== NONE) add('Loss Assessment', e.loss_assessment, { '5,000': 8, '10,000': 12, '25,000': 20 }[e.loss_assessment] ?? 0);
  if (e.ordinance !== NONE) add('Ordinance or Law', e.ordinance, dwelling * ({ '10%': 0.0002, '25%': 0.0004, '50%': 0.0007 }[e.ordinance] ?? 0));
  if (e.credit_card !== NONE) add('Increased Coverage on Credit Card', e.credit_card, { '1,000': 5, '5,000': 10, '10,000': 15 }[e.credit_card] ?? 0);
  if (e.jewelry !== NONE) add('Increased Limit on Jewelry, Watches and Furs', e.jewelry, { '2,500': 15, '5,000': 30, '10,000': 55 }[e.jewelry] ?? 0);
  if (e.water_backup !== NONE) add('Water Backup', e.water_backup, { '5,000': 40, '10,000': 60, '25,000': 95 }[e.water_backup] ?? 0);
  if (e.mold !== NONE) add('Increased Mold Property Damage', e.mold, { '10,000': 20, '25,000': 40, '50,000': 70 }[e.mold] ?? 0);
  if (e.identity_theft) add('Identity Theft', '25,000', 25);
  if (e.rc_contents) add('Replacement Cost Contents', 'Included', dwelling * (num(c.pp_pct, 50) / 100) * 0.0006);
  if (e.personal_injury) add('Personal Injury', 'Included', 20);
  if (e.special_pp) add('Special Personal Property', 'Open perils', dwelling * (num(c.pp_pct, 50) / 100) * 0.0005);
  if (e.sinkhole) add('Sinkhole Collapse', 'Included', 40);
  if (e.eq_zone !== NONE) {
    const zone = num(e.eq_zone.replace('Zone ', ''), 1);
    const dedF = { '10%': 1, '15%': 0.85, '20%': 0.72, '25%': 0.62 }[e.eq_ded] ?? 1;
    const veneerF = e.eq_exclude_veneer ? 0.85 : 1 + (/Over 50|26-50/.test(e.eq_veneer) ? 0.1 : 0);
    add('Earthquake', `${e.eq_zone}, ${e.eq_ded || '10%'} ded`, (dwelling / 1000) * 0.35 * zone * dedF * veneerF);
  }
  if (e.incidental_business) add('Incidental Business Pursuits', e.biz_class || 'Home business', 45);
  for (const sc of SPP_CLASSES) {
    const v = e.spp[sc.key];
    const amount = num(v.amount);
    if (amount > 0) add(`Scheduled ${sc.label}${v.breakage ? ' (with breakage)' : ''}`, money(amount), (amount / 100) * sc.rate * (v.breakage ? 1.3 : 1));
  }

  // This carrier's questions
  if (ans('paperless') === 'Yes') credit('Paperless', 0.98);
  if (ans('prior_liability') === 'Less than $300,000') surcharge('Prior liability under $300,000', 1.02);
  if (ans('prior_liability') === 'No prior coverage') surcharge('No prior home coverage', 1.08);
  if (ans('loss_settlement_roof') === 'Actual Cash Value') credit('ACV roof settlement', 0.93);
  if (ans('roof_updated') === 'Yes') credit('Roof replaced in last 10 years', 0.95);
  if (ans('leak_device') === 'Yes') credit('Water shut-off device', 0.96);
  if (ans('green_home') === 'Yes') credit('Green home', 0.98);
  if (ans('near_water') === 'Yes') { surcharge('Near a body of water', 1.06); a.uw.push('Dwelling within 1,000 ft of water: flood is excluded; offer a separate flood policy.'); }
  return a;
}

function apply(r: Rated, a: Adj, w: HomeWorkflow): Rated {
  if (r.status !== 'Quoted' || r.premium === null) return r;
  if (a.decline) return { ...r, status: 'Declined', premium: null, coverages: [], message: a.decline };
  const dwelling = num(w.coverage.dwelling, 250000);
  const os = num(w.coverage.other_pct, 10), lou = num(w.coverage.lou_pct, 20);
  const fee = r.coverages.find((c) => c.name === 'Policy Fee')?.premium ?? 0;
  const base: Coverage[] = r.coverages.filter((c) => c.name !== 'Policy Fee').map((c) => {
    const premium = Math.round((c.premium ?? 0) * a.factor);
    if (c.name.startsWith('Other Structures')) return { ...c, limit: money(Math.round(dwelling * os / 100)), premium };
    if (c.name.startsWith('Loss of Use')) return { ...c, limit: money(Math.round(dwelling * lou / 100)), premium };
    return { ...c, premium };
  });
  const ends: Coverage[] = a.endorsements.map((x) => ({ name: x.name, limit: x.limit, premium: x.premium }));
  const coverages = [...base, ...ends, ...(fee ? [{ name: 'Policy Fee', limit: '—', premium: fee }] : [])];
  return {
    ...r, premium: coverages.reduce((t, c) => t + (c.premium ?? 0), 0), coverages,
    discounts: [...(r.discounts ?? []), ...a.discounts], surcharges: [...(r.surcharges ?? []), ...a.surcharges],
    endorsements: a.endorsements.map(({ name, premium }) => ({ name, premium })),
    uw: [...a.uw, ...(r.notes ?? [])],
  };
}

export function rateHomeWorkflow(w: HomeWorkflow, carriers: Carrier[], account: Account | null, homeCarriers: string[]): Rated[] {
  const input = toHomeInput(w, account, null);
  const base = rateQuote('Homeowners', { v: 1, carriers: carriers.map((c) => c.name), home: input }, carriers) as Rated[];
  return sortRates(base.map((r) => apply(r, adjustments(w, r.carrier, homeCarriers), w)));
}

// ── Pay plans (12-month term) ──

export type PayPlan = 'full' | 'monthly' | 'eft';
export const PAY_LABEL: Record<PayPlan, string> = { full: 'Full Pay', monthly: 'Monthly', eft: 'EFT' };
export type PlanDetail = { plan: PayPlan; name: string; total: number; down: number | null; installment: number | null; count: number; description: string };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function planDetails(premium: number): PlanDetail[] {
  const monthlyTotal = r2(premium + 11 * 3);
  const eftTotal = r2(premium * 0.98);
  return [
    { plan: 'full', name: 'Paid-In-Full', total: r2(premium), down: null, installment: null, count: 0, description: 'Paid-In-Full' },
    { plan: 'monthly', name: 'Monthly', total: monthlyTotal, down: r2(monthlyTotal / 12), installment: r2(monthlyTotal / 12), count: 11, description: '1/12 down, 11 monthly installments ($3 installment fee)' },
    { plan: 'eft', name: 'EFT', total: eftTotal, down: r2(eftTotal / 12), installment: r2(eftTotal / 12), count: 11, description: '1/12 down, 11 automatic bank drafts (2% EFT credit)' },
  ];
}

export function planPrice(premium: number, plan: PayPlan): { amount: number; unit: string } {
  const d = planDetails(premium).find((x) => x.plan === plan)!;
  return plan === 'full' ? { amount: d.total, unit: '/ 12 mo (Paid-In-Full)' } : { amount: d.installment!, unit: `/ mo (${d.name})` };
}

export const money2 = (x: number) => x.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
