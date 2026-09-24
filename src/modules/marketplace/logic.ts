import {
  Banknote, Bot, Calculator, CloudDownload, FileSignature, FolderOpen, Globe, Mail, MessageSquareText, ScanLine, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import type { Integration } from '@/lib/types';
import { secretFlag, type CatalogItem, type Category } from './catalog';

export const DISCLAIMER = 'Listings are examples for training. Activating one records the setup in this system; it does not connect to the vendor.';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  eSignature: FileSignature,
  'Texting & Voice': MessageSquareText,
  'Email Marketing': Mail,
  'Payments & Premium Finance': Banknote,
  'Data Prefill & Intake': ScanLine,
  Automation: Bot,
  Accounting: Calculator,
  'Carrier Downloads': CloudDownload,
  'Document Management': FolderOpen,
  'Websites & Lead Capture': Globe,
};

// ── Config helpers ──

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Required fields (secrets count when flagged configured) that are still missing. */
export function missingFields(item: CatalogItem, config: Record<string, string>) {
  return item.fields.filter((f) => f.required && !(f.secret ? config[secretFlag(f.key)] === 'true' : (config[f.key] ?? '').trim()));
}

export function isSetupComplete(item: CatalogItem, config: Record<string, string>) {
  return missingFields(item, config).length === 0;
}

/** Human-readable config lines; secrets only ever show "Configured". */
export function configSummary(item: CatalogItem, config: Record<string, string>) {
  return item.fields.map((f) => ({
    label: f.label,
    value: f.secret ? (config[secretFlag(f.key)] === 'true' ? '•••••• Configured' : 'Not set') : (config[f.key] || '—'),
  }));
}


// ── Row actions shared by the detail page and My Integrations ──

export function useIntegrationActions() {
  const { toast, confirm } = useFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);

  const guard = async (id: string, fn: () => Promise<void>) => {
    if (busyId) return false;
    setBusyId(id);
    try { await fn(); return true; } catch (e) { toast((e as Error).message, 'error'); return false; } finally { setBusyId(null); }
  };

  const togglePause = (item: CatalogItem, row: Integration) => guard(row.id, async () => {
    const next = row.status === 'Paused' ? 'Active' : 'Paused';
    if (next === 'Active' && !isSetupComplete(item, row.config)) throw new Error('Finish the required setup fields before resuming');
    await db.update('integrations', row.id, { status: next });
    toast(next === 'Paused' ? `${item.name} paused` : `${item.name} resumed`);
  });

  const remove = async (item: CatalogItem, row: Integration) => {
    const ok = await confirm({
      title: `Remove ${item.name}?`,
      message: 'The integration and its saved setup will be deleted. You can add it again from the Marketplace later.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return false;
    return guard(row.id, async () => {
      await db.remove('integrations', row.id);
      toast(`${item.name} removed`);
    });
  };

  return { busyId, togglePause, remove };
}
