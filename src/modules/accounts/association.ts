import { db } from '@/lib/db';
import type { Account } from '@/lib/types';
import { saveAppConfig, useAppConfig } from '@/modules/admin/config';

/*
 * Community association (HOA / condominium / co-op) underwriting profile for a commercial applicant.
 * The questions follow the community-association applications carriers use (association type and unit counts,
 * buildings and values, management, amenities, financial controls and loss history). Stored per account in
 * app_config ('association_details') so no database migration is needed; values are kept as entered.
 */

/** NAICS 813990 covers homeowners', condominium owners' and property owners' associations (SIC 8641). */
export const ASSOCIATION_NAICS = '813990';
export const ASSOCIATION_ENTITY = 'Association';

export const ASSOCIATION_TYPES = ['Single-Family HOA', 'Condominium Association', 'Townhome Association', 'Cooperative (Co-op)', 'Master Association', 'Office Condominium'];
export const ISO_CONSTRUCTION = ['Frame', 'Joisted Masonry', 'Non-Combustible', 'Masonry Non-Combustible', 'Modified Fire Resistive', 'Fire Resistive'];
export const ASSOC_ROOF_TYPES = ['Asphalt / Composition Shingle', 'Architectural Shingle', 'Tile (Clay)', 'Tile (Concrete)', 'Metal', 'Flat (Membrane)', 'Flat (Tar & Gravel)', 'Wood Shake'];
export const SPRINKLER_OPTIONS = ['None', 'Partial', 'Full (all buildings)'];
/** What the master policy covers inside each unit, per the declarations. */
export const UNIT_COVERAGE = ['Bare Walls', 'Single Entity (original specifications)', 'All-In (including improvements)'];
export const MANAGEMENT_TYPES = ['Self-managed', 'Professional management company'];
export const MANAGER_DESIGNATIONS = ['None', 'CMCA', 'AMS', 'PCAM', 'AAMC (company)'];
export const DELINQUENCY = ['0–15% of owners', '16% or more of owners'];
export const YES_NO = ['Yes', 'No'];
export const AMENITIES = ['Swimming pool', 'Clubhouse', 'Fitness center', 'Playground', 'Sport courts', 'Lake / pond', 'Docks / boat slips', 'Gated entry', 'Security patrol', 'Private roads', 'Golf course', 'Parking garage'];

export type AssociationProfile = {
  association_type: string; year_established: string;
  total_units: string; owner_units: string; rented_units: string; vacant_units: string; developer_units: string;
  developer_controls_board: string; under_construction: string; short_term_rentals: string;
  residential_buildings: string; other_buildings: string; max_stories: string; elevators: string;
  year_built: string; construction: string; roof_type: string; roof_year: string; protection_class: string; sprinklers: string; unit_coverage: string;
  building_value: string; outdoor_value: string; bpp_value: string;
  management: string; management_company: string; property_manager: string; manager_designation: string; manager_has_crime: string;
  board_members: string; employees: string;
  amenities: string[]; pools: string; pool_fenced: string; lifeguard: string; lake_acres: string; road_miles: string;
  annual_assessments: string; reserve_balance: string; monthly_dues: string; delinquency: string;
  positive_fund_balance: string; cpa_audit: string; dual_signatures: string; independent_reconciliation: string; special_assessment: string;
  losses_3yr: string; do_claims_5yr: string; loss_details: string;
};

export const BLANK_ASSOCIATION: AssociationProfile = {
  association_type: '', year_established: '', total_units: '', owner_units: '', rented_units: '', vacant_units: '', developer_units: '',
  developer_controls_board: '', under_construction: '', short_term_rentals: '',
  residential_buildings: '', other_buildings: '', max_stories: '', elevators: '', year_built: '', construction: '', roof_type: '', roof_year: '',
  protection_class: '', sprinklers: '', unit_coverage: '', building_value: '', outdoor_value: '', bpp_value: '',
  management: '', management_company: '', property_manager: '', manager_designation: '', manager_has_crime: '', board_members: '', employees: '',
  amenities: [], pools: '', pool_fenced: '', lifeguard: '', lake_acres: '', road_miles: '',
  annual_assessments: '', reserve_balance: '', monthly_dues: '', delinquency: '',
  positive_fund_balance: '', cpa_audit: '', dual_signatures: '', independent_reconciliation: '', special_assessment: '',
  losses_3yr: '', do_claims_5yr: '', loss_details: '',
};

/** An applicant is treated as a community association by its NAICS class or legal entity type. */
export const isAssociation = (a: Pick<Account, 'naics_code' | 'legal_entity_type'> | null | undefined) =>
  !!a && (a.naics_code === ASSOCIATION_NAICS || a.legal_entity_type === ASSOCIATION_ENTITY);

/** Whole number from a form value ('1,250' → 1250); null when blank or not a number. */
export const num = (s: string | undefined | null) => {
  const n = Number(String(s ?? '').replace(/[$,\s]/g, ''));
  return String(s ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};

/**
 * Minimum fidelity / employee-theft limit: three months of aggregate assessments on all units plus reserve funds
 * (the Fannie Mae requirement for condo and PUD projects with more than 20 units), rounded up to the next $25,000.
 * Null until the budget is entered.
 */
export function minimumFidelity(p: Pick<AssociationProfile, 'annual_assessments' | 'monthly_dues' | 'total_units' | 'reserve_balance'>) {
  const annual = num(p.annual_assessments) ?? ((num(p.monthly_dues) ?? 0) * 12 * (num(p.total_units) ?? 0) || null);
  if (!annual) return null;
  const raw = annual / 4 + (num(p.reserve_balance) ?? 0);
  return Math.ceil(raw / 25000) * 25000;
}

/** Validation messages keyed by field ('assoc.<field>'). */
export function associationIssues(p: AssociationProfile): Record<string, string> {
  const e: Record<string, string> = {};
  const thisYear = new Date().getFullYear();
  const total = num(p.total_units);
  if (!p.association_type) e['assoc.association_type'] = 'Association type is required to proceed';
  if (total === null || total < 1) e['assoc.total_units'] = 'Total units is required to proceed';
  const parts = [p.owner_units, p.rented_units, p.vacant_units].map(num).reduce<number>((s, n) => s + (n ?? 0), 0);
  if (total !== null && parts > total) e['assoc.owner_units'] = 'Owner, rented and vacant units add up to more than the total';
  for (const k of ['year_established', 'year_built', 'roof_year'] as const) {
    const y = num(p[k]);
    if (p[k] && (y === null || y < 1800 || y > thisYear)) e[`assoc.${k}`] = `Enter a year between 1800 and ${thisYear}`;
  }
  const pc = num(p.protection_class);
  if (p.protection_class && (pc === null || pc < 1 || pc > 10)) e['assoc.protection_class'] = '1 (best) to 10';
  for (const k of ['building_value', 'outdoor_value', 'bpp_value', 'annual_assessments', 'reserve_balance', 'monthly_dues'] as const) {
    if (p[k] && (num(p[k]) === null || num(p[k])! < 0)) e[`assoc.${k}`] = 'Enter a dollar amount';
  }
  return e;
}

/** Saved association profile for an account (null when none has been entered). */
export function useAssociation(accountId: string | null | undefined) {
  const { value, loading } = useAppConfig('association_details');
  const saved = accountId ? value.byAccount[accountId] ?? null : null;
  return { profile: saved ? { ...BLANK_ASSOCIATION, ...saved } : null, loading };
}

export async function getAssociation(accountId: string): Promise<AssociationProfile | null> {
  const [row] = await db.list('app_config', { eq: { key: 'association_details' } });
  const saved = (row?.value as { byAccount?: Record<string, AssociationProfile> } | undefined)?.byAccount?.[accountId];
  return saved ? { ...BLANK_ASSOCIATION, ...saved } : null;
}

/** Read-modify-write so profiles saved by other users in the meantime are kept. */
export async function saveAssociation(accountId: string, profile: AssociationProfile | null) {
  const [row] = await db.list('app_config', { eq: { key: 'association_details' } });
  const stored = (row?.value ?? {}) as { byAccount?: Record<string, AssociationProfile>; program_installed?: boolean };
  const all = { ...(stored.byAccount ?? {}) };
  if (profile) all[accountId] = profile; else delete all[accountId];
  await saveAppConfig('association_details', { ...stored, byAccount: all });
}

export const fmtUsd = (n: number | null) => (n === null ? '--' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
