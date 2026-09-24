import { RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, PageHeader, useFeedback } from '@/components/ui';
import { href } from '@/lib/router';
import { saveAppConfig, useAppConfig, type ConfigKey, type ConfigMap } from './config';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Page header for a Settings administration page (breadcrumb back to the Settings index). */
export function AdminHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return <PageHeader title={title} subtitle={subtitle} icon={icon} actions={actions} breadcrumb={[{ label: 'Settings', href: href('/admin') }]} />;
}

/**
 * Editable draft of an app_config value. The draft follows the stored value until the user edits it;
 * `save()` writes the whole draft and clears the dirty flag.
 */
export function useConfigDraft<K extends ConfigKey>(key: K, successMessage = 'Settings saved') {
  const { toast } = useFeedback();
  const cfg = useAppConfig(key);
  const [draft, setDraftState] = useState<ConfigMap[K]>(cfg.value);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const dirtyRef = useRef(false);

  // Follow the stored value only while there are no local edits (runs when the stored value changes).
  useEffect(() => { if (!dirtyRef.current) setDraftState(cfg.value); }, [cfg.value]);

  const setDraft = useCallback((fn: (d: ConfigMap[K]) => ConfigMap[K]) => { setDraftState((d) => fn(d)); dirtyRef.current = true; setDirty(true); }, []);
  const reset = useCallback(() => { setDraftState(cfg.value); dirtyRef.current = false; setDirty(false); }, [cfg.value]);

  const save = useCallback(async (value?: ConfigMap[K]) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      await saveAppConfig(key, value ?? draft);
      dirtyRef.current = false;
      setDirty(false);
      toast(successMessage);
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [key, draft, toast, successMessage]);

  return { draft, setDraft, dirty, saving, save, reset, loading: cfg.loading, error: cfg.error, stored: cfg.value, row: cfg.row };
}

/** Sticky save / discard bar for config forms. */
export function SaveBar({ dirty, saving, onSave, onReset, extra }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; extra?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-4 -mx-1 px-1">
      <div className="flex flex-wrap items-center justify-end gap-2 bg-white/95 backdrop-blur border border-[#e3e3e3] rounded shadow-card px-3 py-2">
        {extra}
        <span className="mr-auto text-xs text-ink-400">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} disabled={!dirty || saving} onClick={onReset}>Discard</Button>
        <Button variant="primary" size="sm" icon={<Save size={13} />} disabled={!dirty} loading={saving} onClick={onSave}>Save changes</Button>
      </div>
    </div>
  );
}

/** Small on/off switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand-500' : 'bg-ink-200'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export const LABEL_COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#db2777', '#57534e', '#0f766e'];

/** Colored label chip. */
export function LabelChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap" style={{ color, borderColor: `${color}55`, background: `${color}14` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {name}
      {onRemove && <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="bg-transparent leading-none opacity-70 hover:opacity-100">×</button>}
    </span>
  );
}
