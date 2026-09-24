import { Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, ErrorBanner, Modal, Select, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Account } from '@/lib/types';
import { useAppConfig, type AssigneeRule } from './config';
import { enqueueAutomation } from './automation-engine';
import { LabelChip } from './shared';

/**
 * Hooks and small components other modules use to honor Settings administration choices
 * (lead sources, lines of business, carrier quoting setup, activity defaults, labels, templates).
 */

// ── Lead sources ──

/** Visible lead source names for pickers; falls back to `fallback` when none are set up. Keeps `current`. */
export function useLeadSourceOptions(current: string | null | undefined, fallback: string[]) {
  const rows = useTable('lead_sources', { order: { column: 'created_at' } });
  return useMemo(() => {
    const names = rows.data.length ? rows.data.filter((r) => !r.hidden).map((r) => r.name) : [...fallback];
    if (current && !names.includes(current)) names.push(current);
    return names;
  }, [rows.data, current, fallback]);
}

// ── Lines of business ──

export function useLineSettings() {
  const { value, loading } = useAppConfig('lines');
  return useMemo(() => ({
    loading,
    isEnabled: (line: string) => value[line]?.enabled !== false,
    defaultTerm: (line: string) => value[line]?.default_term ?? 12,
    /** `lines` without disabled ones, keeping `keep` (a currently selected value). */
    filter: <T extends string>(lines: T[], keep?: string | null) => lines.filter((l) => value[l]?.enabled !== false || l === keep),
  }), [value, loading]);
}

// ── Carrier Quoting Setup ──

export type QuotingStatus = 'Ready' | 'Login required' | 'Disabled' | 'Line not enabled' | 'Not set up';

export function useCarrierQuoting() {
  const rows = useTable('carrier_rating_setup');
  return useMemo(() => {
    const map = new Map(rows.data.map((r) => [r.carrier, r]));
    const statusOf = (carrier: string, line?: string | null): QuotingStatus => {
      const r = map.get(carrier);
      if (!r) return 'Not set up';
      if (!r.active) return 'Disabled';
      if (!r.login_set) return 'Login required';
      if (line && !r.enabled_lines.includes(line)) return 'Line not enabled';
      return 'Ready';
    };
    return {
      loading: rows.loading,
      /** When no carrier has been set up, every appointed carrier rates (legacy behavior). */
      active: rows.data.length > 0,
      statusOf,
      isReady: (carrier: string, line?: string | null) => rows.data.length === 0 || statusOf(carrier, line) === 'Ready',
    };
  }, [rows.data, rows.loading]);
}

// ── Activity Settings ──

export function useActivitySettings() {
  const { value, loading } = useAppConfig('activity');
  return { config: value, loaded: !loading };
}

/** Default assignee for a new activity per the Activity Settings rule. */
export async function defaultAssignee(rule: AssigneeRule, accountId: string | null, me: string | null): Promise<string | null> {
  if (rule === 'me' || !accountId) return me;
  const a = await db.get('accounts', accountId);
  if (!a) return me;
  return (rule === 'csr' ? a.csr : a.producer) ?? me;
}

// ── Certificates & templates ──

export function useCertificateSettings() {
  const { value, loading } = useAppConfig('certificates');
  return { config: value, loaded: !loading };
}

export function useFormTemplates(formType: string) {
  const rows = useTable('form_templates', { eq: { form_type: formType }, order: { column: 'name' } });
  return rows.data;
}

export function useDefaultProposalTemplate(type: 'Proposal' | 'SOI') {
  const rows = useTable('proposal_templates', { eq: { template_type: type } });
  return rows.data.find((t) => t.is_default) ?? null;
}

// ── Labels ──

export function useLabels() {
  return useTable('labels', { order: { column: 'name' } });
}

/** Label filter dropdown for lists. `value` is a label id. */
export function LabelFilterSelect({ value, onChange, className }: { value: string | null; onChange: (id: string | null) => void; className?: string }) {
  const labels = useLabels();
  if (!labels.data.length) return null;
  return <Select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder="Any label" options={labels.data.map((l) => ({ value: l.id, label: l.name }))} />;
}

/** Label chips + "Edit labels" for an account header. */
export function AccountLabels({ account }: { account: Account }) {
  const labels = useLabels();
  const [editing, setEditing] = useState(false);
  const byId = new Map(labels.data.map((l) => [l.id, l]));
  const current = (account.labels ?? []).map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {current.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 bg-transparent hover:underline">
        <Tag size={12} />{current.length ? 'Edit labels' : 'Add labels'}
      </button>
      {editing && <EditLabelsModal account={account} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditLabelsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const { toast } = useFeedback();
  const labels = useLabels();
  const [selected, setSelected] = useState<string[]>(account.labels ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await db.get('accounts', account.id);
      const before = fresh?.labels ?? account.labels ?? [];
      const valid = new Set(labels.data.map((l) => l.id));
      // Keep ids of labels this modal doesn't know about (e.g. created meanwhile), apply the user's choices for the rest.
      const next = [...before.filter((id) => !valid.has(id)), ...selected.filter((id) => valid.has(id))];
      await db.update('accounts', account.id, { labels: [...new Set(next)] });
      const added = selected.filter((id) => !before.includes(id));
      for (const label_id of added) {
        try { await enqueueAutomation('Label Added', { account_id: account.id, label_id }); } catch { /* automations never block saving */ }
      }
      toast('Labels updated');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit labels" subtitle="Labels drive list filters and Automation Center triggers" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()} disabled={!labels.data.length}>Save labels</Button></>}>
      <ErrorBanner message={error ?? labels.error} />
      {labels.data.length === 0 && !labels.loading ? (
        <EmptyState icon={<Tag size={22} />} title="No labels yet" message={<>Create labels under <a className="text-brand-600 hover:underline" href={href('/admin/labels')}>Settings → Manage Labels</a>.</>} />
      ) : (
        <div className="space-y-2">
          {labels.data.map((l) => (
            <div key={l.id} className="flex items-start gap-2">
              <Checkbox label={<LabelChip name={l.name} color={l.color} />} checked={selected.includes(l.id)} onChange={(on) => setSelected((s) => (on ? [...s, l.id] : s.filter((x) => x !== l.id)))} />
              {l.description && <span className="text-[11px] text-ink-400 mt-0.5">{l.description}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
