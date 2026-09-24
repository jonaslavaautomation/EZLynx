import { uuid } from '@/lib/db';
import { addDays, today } from '@/lib/format';
import type { Integration, Staff } from '@/lib/types';
import { ACTIVATED_AT, CATALOG_BY_KEY, secretFlag } from './catalog';

/** Local timestamp `days` from today at `hour`:00, as ISO. */
function at(days: number, hour: number) {
  const [y, m, d] = addDays(today(), days).split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0).toISOString();
}

/**
 * Deterministic Marketplace demo data: two active integrations and one awaiting setup.
 * Secret fields only carry a "configured" flag — no secret values are ever seeded.
 */
export function buildMarketplaceSample(d: { staff: Staff[] }): { integrations: Integration[] } {
  const owner = d.staff.find((s) => s.role === 'Agency Owner')?.name ?? d.staff[0]?.name ?? null;
  const other = d.staff.find((s) => s.name !== owner)?.name ?? owner;

  const defs: [key: string, status: Integration['status'], by: string | null, days: number, config: Record<string, string>][] = [
    ['docusign', 'Active', owner, -120, {
      account_email: 'admin@northstar-agency.example', account_id: '4471902', environment: 'Production',
      [secretFlag('api_key')]: 'true', [ACTIVATED_AT]: at(-119, 10),
    }],
    ['ivans-download', 'Active', other, -90, {
      account_number: 'NS-20418', mailbox: 'MBX-77310', contact_email: 'downloads@northstar-agency.example', [ACTIVATED_AT]: at(-88, 14),
    }],
    ['quickbooks-online', 'Setup Required', other, -6, { company: 'Northstar Insurance Agency LLC' }],
  ];

  const integrations: Integration[] = defs
    .filter(([key]) => CATALOG_BY_KEY.has(key))
    .map(([integration_key, status, activated_by, days, config]) => ({ id: uuid(), created_at: at(days, 9), integration_key, status, activated_by, config }));
  return { integrations };
}
