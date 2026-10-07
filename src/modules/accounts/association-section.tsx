import { Check, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';
import { OInput, OSelect } from '@/modules/accounts/applicant-fields';
import {
  AMENITIES, ASSOCIATION_TYPES, ASSOC_ROOF_TYPES, DELINQUENCY, ISO_CONSTRUCTION, MANAGEMENT_TYPES, MANAGER_DESIGNATIONS, SPRINKLER_OPTIONS, UNIT_COVERAGE, YES_NO,
  fmtUsd, minimumFidelity, num, type AssociationProfile,
} from '@/modules/accounts/association';

/*
 * "Association Info" on the Commercial Applicant page: the community association underwriting questions
 * (profile, buildings & values, management, amenities, financial controls, loss history), shown when the
 * applicant's NAICS class or legal entity type marks it as an HOA / condo association.
 */

const grid = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5';
const digits = (s: string) => s.replace(/[^\d]/g, '');
const money = (s: string) => { const d = digits(s); return d ? Number(d).toLocaleString('en-US') : ''; };

function Sub({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mt-8 first:mt-0">
      <h3 className="text-[15px] text-ink-900 mb-1">{title}</h3>
      {note && <p className="text-[12px] text-ink-600 mb-4">{note}</p>}
      <div className={cx(!note && 'mt-4')}>{children}</div>
    </div>
  );
}

export function AssociationFields({ value: p, onChange, issues }: { value: AssociationProfile; onChange: (patch: Partial<AssociationProfile>) => void; issues: Record<string, string> }) {
  const err = (k: keyof AssociationProfile) => (issues[`assoc.${k}`] ? { level: 'proceed' as const, message: issues[`assoc.${k}`] } : { level: null, message: undefined });
  const text = (k: keyof AssociationProfile, label: string, opts: { required?: boolean; kind?: 'int' | 'money' | 'year' } = {}) => (
    <OInput
      label={label}
      required={opts.required ? 'proceed' : undefined}
      value={p[k] as string}
      inputMode={opts.kind ? 'numeric' : undefined}
      maxLength={opts.kind === 'year' ? 4 : undefined}
      onChange={(v) => onChange({ [k]: opts.kind === 'money' ? money(v) : opts.kind ? digits(v) : v })}
      {...err(k)}
    />
  );
  const select = (k: keyof AssociationProfile, label: string, options: string[], required?: boolean) => (
    <OSelect label={label} required={required ? 'proceed' : undefined} value={p[k] as string} onChange={(v) => onChange({ [k]: v })} options={options} {...err(k)} />
  );
  const fidelity = minimumFidelity(p);
  const has = (a: string) => p.amenities.includes(a);
  const pool = has('Swimming pool'), lake = has('Lake / pond') || has('Docks / boat slips'), roads = has('Private roads');

  return (
    <div data-testid="association-fields">
      <Sub title="Association Profile">
        <div className={grid}>
          {select('association_type', 'Association Type', ASSOCIATION_TYPES, true)}
          {text('year_established', 'Year Established', { kind: 'year' })}
          {text('total_units', 'Total Units', { required: true, kind: 'int' })}
          {text('owner_units', 'Owner-Occupied Units', { kind: 'int' })}
          {text('rented_units', 'Rented Units', { kind: 'int' })}
          {text('vacant_units', 'Vacant Units', { kind: 'int' })}
          {text('developer_units', 'Units Owned by Developer', { kind: 'int' })}
          {select('developer_controls_board', 'Developer Controls Board', YES_NO)}
          {select('under_construction', 'Still Under Construction', YES_NO)}
          {select('short_term_rentals', 'Short-Term Rentals Allowed', YES_NO)}
        </div>
      </Sub>

      <Sub title="Buildings & Property Values">
        <div className={grid}>
          {text('residential_buildings', 'Residential Buildings', { kind: 'int' })}
          {text('other_buildings', 'Other Buildings (clubhouse, etc.)', { kind: 'int' })}
          {text('max_stories', 'Max Stories', { kind: 'int' })}
          {text('elevators', 'Elevators', { kind: 'int' })}
          {text('year_built', 'Year Built', { kind: 'year' })}
          {select('construction', 'Construction (ISO)', ISO_CONSTRUCTION)}
          {select('roof_type', 'Roof Type', ASSOC_ROOF_TYPES)}
          {text('roof_year', 'Roof Replaced (Year)', { kind: 'year' })}
          {text('protection_class', 'ISO Protection Class', { kind: 'int' })}
          {select('sprinklers', 'Sprinklers', SPRINKLER_OPTIONS)}
          <OSelect className="sm:col-span-2" label="Unit Coverage (per Declarations)" value={p.unit_coverage} onChange={(v) => onChange({ unit_coverage: v })} options={UNIT_COVERAGE} />
          {text('building_value', 'Building Value — Common Elements ($)', { kind: 'money' })}
          {text('outdoor_value', 'Outdoor Property ($)', { kind: 'money' })}
          {text('bpp_value', 'Business Personal Property ($)', { kind: 'money' })}
        </div>
      </Sub>

      <Sub title="Management">
        <div className={grid}>
          {select('management', 'Management', MANAGEMENT_TYPES)}
          {p.management !== 'Self-managed' && text('management_company', 'Management Company')}
          {p.management !== 'Self-managed' && text('property_manager', 'Property Manager')}
          {p.management !== 'Self-managed' && select('manager_designation', 'Manager Designation', MANAGER_DESIGNATIONS)}
          {p.management !== 'Self-managed' && select('manager_has_crime', 'Manager Carries Crime Coverage', YES_NO)}
          {text('board_members', 'Board Members', { kind: 'int' })}
          {text('employees', 'Association Employees', { kind: 'int' })}
        </div>
      </Sub>

      <Sub title="Amenities & Common Areas" note="Select every amenity the association owns or maintains; liability carriers rate and underwrite each one.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Amenities">
          {AMENITIES.map((a) => {
            const on = has(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ amenities: on ? p.amenities.filter((x) => x !== a) : [...p.amenities, a] })}
                className={cx('inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px]', on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-300 text-ink-800 hover:border-ink-500')}
              >
                {on && <Check size={14} />}{a}
              </button>
            );
          })}
        </div>
        {(pool || lake || roads) && (
          <div className={cx(grid, 'mt-5')}>
            {pool && text('pools', 'Number of Pools / Spas', { kind: 'int' })}
            {pool && select('pool_fenced', 'Pools Fenced w/ Self-Closing Gates', YES_NO)}
            {pool && select('lifeguard', 'Lifeguard on Duty', YES_NO)}
            {lake && text('lake_acres', 'Largest Lake / Pond (acres)', { kind: 'int' })}
            {roads && text('road_miles', 'Private Road Miles', { kind: 'int' })}
          </div>
        )}
      </Sub>

      <Sub title="Financials & Controls">
        <div className={grid}>
          {text('annual_assessments', 'Annual Assessments / Budget ($)', { kind: 'money' })}
          {text('reserve_balance', 'Reserve Fund Balance ($)', { kind: 'money' })}
          {text('monthly_dues', 'Monthly Dues per Unit ($)', { kind: 'money' })}
          {select('delinquency', 'Owners Delinquent on Dues', DELINQUENCY)}
          {select('positive_fund_balance', 'Positive Fund Balance', YES_NO)}
          {select('cpa_audit', 'Annual CPA Audit / Review', YES_NO)}
          {select('dual_signatures', 'Two Signatures on Checks', YES_NO)}
          {select('independent_reconciliation', 'Bank Reconciled by Non-Signer', YES_NO)}
          {select('special_assessment', 'Special Assessment Pending', YES_NO)}
        </div>
        <div className="mt-5 flex items-start gap-3 rounded border border-ink-200 bg-[#f5f8fb] px-4 py-3 max-w-[744px]" data-testid="fidelity-minimum">
          <ShieldCheck size={20} className="text-brand-600 shrink-0 mt-0.5" />
          <div className="text-[13px] text-ink-800">
            <div className="font-semibold text-ink-900">Minimum Crime / Fidelity limit: {fidelity === null ? 'enter the annual budget or monthly dues' : fmtUsd(fidelity)}</div>
            Three months of assessments on all units plus reserve funds (the Fannie Mae and FHA guideline lenders check for condo and PUD
            projects with more than 20 units).
            {fidelity !== null && num(p.total_units) !== null && num(p.total_units)! <= 20 && ' This association has 20 units or fewer, so lenders may waive it, but it is still recommended.'}
          </div>
        </div>
      </Sub>

      <Sub title="Loss & Claims History">
        <div className={grid}>
          {select('losses_3yr', 'Losses Over $10,000 (3 yrs)', YES_NO)}
          {select('do_claims_5yr', 'D&O Claims or Lawsuits (5 yrs)', YES_NO)}
        </div>
        {(p.losses_3yr === 'Yes' || p.do_claims_5yr === 'Yes') && (
          <label className="relative block rounded border border-ink-300 focus-within:border-brand-500 mt-5 max-w-[744px]">
            <span className="sr-only">Loss details</span>
            <textarea value={p.loss_details} onChange={(e) => onChange({ loss_details: e.target.value })} placeholder="Describe each loss or claim: date, cause, amount paid, and what the association changed" rows={3} className="w-full bg-transparent outline-none px-3 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 resize-y rounded" />
          </label>
        )}
      </Sub>
    </div>
  );
}
