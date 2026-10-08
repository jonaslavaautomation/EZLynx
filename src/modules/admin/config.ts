import { useMemo } from 'react';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import { LINES_OF_BUSINESS, type ActivityType, type Priority } from '@/lib/types';

/**
 * Keyed JSON settings stored in `app_config` (one row per key). Each key has typed defaults; stored values are
 * merged over the defaults so older rows keep working when new fields are added.
 */

export const ALL_ACTIVITY_TYPES: ActivityType[] = ['Task', 'Call', 'Email', 'Meeting', 'Note', 'Renewal Review', 'Follow-up'];

export type AssigneeRule = 'me' | 'csr' | 'producer';

export type ActivityConfig = {
  default_priority: Priority;
  due_in_days: number;
  assignee_rule: AssigneeRule;
  enabled_types: ActivityType[];
  renewal_review_days: number;
};

export type CertificateConfig = {
  holder_name: string;
  holder_address: string;
  remarks: string;
  authorized_rep: string;
  include_ai_wording: boolean;
  ai_wording: string;
};

export type PluginsConfig = { enabled: Record<string, boolean> };

/** staff name → subscribed notification keys */
export type EmailSubscriptionsConfig = { subscriptions: Record<string, string[]> };

export type LineSetting = { enabled: boolean; default_term: 6 | 12 };
export type LinesConfig = Record<string, LineSetting>;

/** Monthly targets shown on the dashboard Performance Goals tile. */
export type GoalsConfig = { monthly_new_policies: number; monthly_new_premium: number; quote_close_pct: number; tasks_on_time_pct: number };

/** An agency-licensed fillable ACORD PDF uploaded to the ACORD Library (the file itself never ships with the app). */
export type AcordFileRef = {
  name: string; storage_path: string | null; data_url: string | null; size_bytes: number;
  field_count: number; edition: string; uploaded_at: string; uploaded_by: string | null;
};
export type AcordFilesConfig = { forms: Record<string, AcordFileRef> };
/** Labels on individual policies (policy id → label ids from Manage Labels). */
export type PolicyLabelsConfig = { byPolicy: Record<string, string[]> };
/** Document Library per insured: folders, which folder each document is in, document labels and who/when edited. */
export type DocFolder = { id: string; name: string; created_at: string; created_by: string | null; modified_at: string | null };
export type DocLibraryEntry = { folders: DocFolder[]; placement: Record<string, string>; labels: Record<string, string[]>; meta: Record<string, { created_by?: string | null; modified_at?: string | null; share?: boolean; share_envelope?: boolean }> };
export type DocLibraryConfig = { byAccount: Record<string, DocLibraryEntry> };
/** EZLynx policy fields with no database column (Change Policy form, policy editor), per policy. */
export type ServiceTeamMember = { staff: string; percent: number };
export type AdditionalInterest = { id: string; type: string; name: string; address: string; loan_number: string };
export type PolicyExtras = {
  writing_company?: string; rating_state?: string; department?: string; original_producer_code?: string; producer_code_override?: string; agency_code?: string;
  service_team?: ServiceTeamMember[]; override_rule?: boolean; body_styles?: Record<string, string>; vehicle_drivers?: Record<string, string>;
  interests?: AdditionalInterest[]; underwriting?: Record<string, string>; policy_payor?: string;
  last_change?: { date: string; description: string; premium_change: number; at: string };
};
export type PolicyDetailsConfig = { byPolicy: Record<string, PolicyExtras> };
/** Lead Info → Sold Policy Information (manual entries, as in EZLynx), per account. */
export type SoldPolicy = { carrier: string; sold_date: string; policy_number: string; premium: string; term: string; renewal_date: string };
export type LeadDetails = { package_policy: boolean; auto: SoldPolicy; home: SoldPolicy; contact_me: boolean };
export type LeadDetailsConfig = { byAccount: Record<string, LeadDetails> };
/** Certificate masters: a saved certificate setup (form, policies, holder, remarks) to issue certificates from. */
export type CertificateMaster = { id: string; name: string; form: string; policy_ids: string[]; holder: string; remarks: string; created_at: string; created_by: string | null };
export type CertificateMastersConfig = { byAccount: Record<string, CertificateMaster[]> };
/** Carrier downloads (simulated IVANS feed): every policy / claim transaction received, matched or waiting. */
/** Community association (HOA / condo) underwriting profile, per commercial account. */
export type AssociationDetailsConfig = {
  byAccount: Record<string, import('@/modules/accounts/association').AssociationProfile>;
  /** Set once the association program carrier/lines were added to this agency's carriers. */
  program_installed?: boolean;
};
/** One-time setup steps already applied to this agency database (so removed items are not re-added). */
export type PracticeSetupConfig = { workflows?: boolean };
export type CarrierDownloadsConfig = { items: import('@/lib/downloads').DownloadTxn[]; last_run: string | null };

export type ConfigMap = {
  activity: ActivityConfig;
  certificates: CertificateConfig;
  plugins: PluginsConfig;
  email_subscriptions: EmailSubscriptionsConfig;
  lines: LinesConfig;
  goals: GoalsConfig;
  acord_files: AcordFilesConfig;
  policy_labels: PolicyLabelsConfig;
  doc_library: DocLibraryConfig;
  policy_details: PolicyDetailsConfig;
  lead_details: LeadDetailsConfig;
  certificate_masters: CertificateMastersConfig;
  carrier_downloads: CarrierDownloadsConfig;
  association_details: AssociationDetailsConfig;
  practice_setup: PracticeSetupConfig;
};
export type ConfigKey = keyof ConfigMap;

const SIX_MONTH_LINES = ['Personal Auto', 'Motorcycle'];

export const CONFIG_DEFAULTS: { [K in ConfigKey]: ConfigMap[K] } = {
  activity: { default_priority: 'Normal', due_in_days: 1, assignee_rule: 'me', enabled_types: [...ALL_ACTIVITY_TYPES], renewal_review_days: 45 },
  certificates: {
    holder_name: '', holder_address: '', remarks: '', authorized_rep: '', include_ai_wording: false,
    ai_wording: 'The certificate holder is included as additional insured where required by written contract, subject to the policy terms, conditions and exclusions.',
  },
  plugins: { enabled: {} },
  email_subscriptions: { subscriptions: {} },
  goals: { monthly_new_policies: 10, monthly_new_premium: 15000, quote_close_pct: 35, tasks_on_time_pct: 85 },
  acord_files: { forms: {} },
  policy_labels: { byPolicy: {} },
  doc_library: { byAccount: {} },
  policy_details: { byPolicy: {} },
  lead_details: { byAccount: {} },
  certificate_masters: { byAccount: {} },
  carrier_downloads: { items: [], last_run: null },
  association_details: { byAccount: {} },
  practice_setup: {},
  lines: Object.fromEntries(LINES_OF_BUSINESS.map((l) => [l, { enabled: true, default_term: SIX_MONTH_LINES.includes(l) ? 6 : 12 }])) as LinesConfig,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Merge a stored value over the defaults for its key. */
export function mergeConfig<K extends ConfigKey>(key: K, value: unknown): ConfigMap[K] {
  const base = CONFIG_DEFAULTS[key];
  if (!isObj(value)) return structuredClone(base);
  if (key === 'lines') {
    const out: LinesConfig = structuredClone(CONFIG_DEFAULTS.lines);
    for (const [line, s] of Object.entries(value)) {
      if (!isObj(s)) continue;
      out[line] = { enabled: s.enabled !== false, default_term: Number(s.default_term) === 6 ? 6 : 12 };
    }
    return out as ConfigMap[K];
  }
  return { ...structuredClone(base), ...value } as ConfigMap[K];
}

/** Live, merged config value for one key. */
export function useAppConfig<K extends ConfigKey>(key: K) {
  const rows = useTable('app_config', { eq: { key } });
  const row = rows.data[0] ?? null;
  const value = useMemo(() => mergeConfig(key, row?.value), [key, row]);
  return { value, row, loading: rows.loading, error: rows.error };
}

export async function getAppConfig<K extends ConfigKey>(key: K): Promise<ConfigMap[K]> {
  const [row] = await db.list('app_config', { eq: { key } });
  return mergeConfig(key, row?.value);
}

// Serialize writes per key so two quick saves can't both insert a row for the same key.
const writeChain = new Map<string, Promise<unknown>>();

export function saveAppConfig<K extends ConfigKey>(key: K, value: ConfigMap[K]) {
  const prev = writeChain.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const [row] = await db.list('app_config', { eq: { key } });
    const v = value as unknown as Record<string, unknown>;
    return row ? db.update('app_config', row.id, { value: v }) : db.insert('app_config', { key, value: v });
  });
  writeChain.set(key, next);
  return next;
}
