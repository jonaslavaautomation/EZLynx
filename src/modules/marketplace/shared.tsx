import { Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, Input, Select, cx, useFeedback } from '@/components/ui';
import { db } from '@/lib/db';
import type { Integration } from '@/lib/types';
import { ACTIVATED_AT, secretFlag, type CatalogItem } from './catalog';
import { DISCLAIMER, EMAIL_PATTERN, isUrl } from './logic';

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800', className)}>
      <Info size={14} className="shrink-0 mt-0.5" /> {DISCLAIMER}
    </div>
  );
}

/** Monogram tile standing in for a vendor logo. */
export function AppTile({ item, size = 44 }: { item: CatalogItem; size?: number }) {
  const letters = item.name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="inline-grid place-items-center rounded-lg text-white font-bold shrink-0" style={{ width: size, height: size, background: item.color, fontSize: size * 0.34 }} aria-hidden>
      {letters}
    </span>
  );
}

export function IntegrationStatus({ row }: { row: Integration | undefined }) {
  if (!row) return <Badge tone="gray">Not added</Badge>;
  const tone = row.status === 'Active' ? 'green' : row.status === 'Paused' ? 'blue' : 'amber';
  return <Badge tone={tone}>{row.status}</Badge>;
}

// ── Setup form ──

type Mode = 'setup' | 'edit';

/**
 * Setup form built from the catalog's fields. Secret fields are password inputs whose values are dropped
 * on save; only `<key>__configured` is written. `mode: 'setup'` offers Save + Activate; `edit` just saves.
 */
export function SetupForm({ item, row, mode, onDone, onCancel }: {
  item: CatalogItem; row: Integration; mode: Mode; onDone?: () => void; onCancel?: () => void;
}) {
  const { toast } = useFeedback();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    item.fields.forEach((f) => { v[f.key] = f.secret ? '' : (row.config[f.key] ?? ''); });
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'save' | 'activate'>(null);

  const validate = (strictRequired: boolean) => {
    const errs: Record<string, string> = {};
    for (const f of item.fields) {
      const v = (values[f.key] ?? '').trim();
      const alreadySet = f.secret && row.config[secretFlag(f.key)] === 'true';
      if (!v) {
        if (f.required && strictRequired && !alreadySet) errs[f.key] = `${f.label} is required`;
        continue;
      }
      if (f.type === 'email' && !EMAIL_PATTERN.test(v)) errs[f.key] = 'Enter a valid email address';
      if (f.type === 'url' && !isUrl(v)) errs[f.key] = 'Enter a full URL starting with https://';
      if (f.type === 'select' && f.options && !f.options.includes(v)) errs[f.key] = 'Choose an option';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildConfig = () => {
    const next: Record<string, string> = { ...row.config };
    for (const f of item.fields) {
      const v = (values[f.key] ?? '').trim();
      if (f.secret) {
        delete next[f.key]; // never persist a secret value, even one saved by older data
        if (v) next[secretFlag(f.key)] = 'true';
      } else if (v) next[f.key] = v;
      else delete next[f.key];
    }
    return next;
  };

  const save = async (activate: boolean) => {
    if (busy) return;
    // Activation (and editing an active integration) needs every required field; a draft save only checks formats.
    const strict = activate || mode === 'edit' && row.status !== 'Setup Required';
    if (!validate(strict)) { toast('Fix the highlighted fields', 'error'); return; }
    setBusy(activate ? 'activate' : 'save');
    try {
      const config = buildConfig();
      const patch: Partial<Integration> = { config };
      if (activate) { patch.status = 'Active'; config[ACTIVATED_AT] = new Date().toISOString(); }
      await db.update('integrations', row.id, patch);
      toast(activate ? `${item.name} is active` : `${item.name} setup saved`);
      setValues((v) => { const c = { ...v }; item.fields.forEach((f) => { if (f.secret) c[f.key] = ''; }); return c; });
      onDone?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save(mode === 'setup'); };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {item.fields.map((f) => {
          const configured = f.secret && row.config[secretFlag(f.key)] === 'true';
          const set = (v: string) => { setValues((s) => ({ ...s, [f.key]: v })); if (errors[f.key]) setErrors((er) => { const c = { ...er }; delete c[f.key]; return c; }); };
          return (
            <Field key={f.key} label={f.label} required={f.required} error={errors[f.key]}
              hint={configured ? 'Configured — leave blank to keep the current value.' : f.hint ?? (f.secret ? 'Not stored — only recorded as configured.' : undefined)}>
              {f.type === 'select' ? (
                <Select value={values[f.key]} onChange={(e) => set(e.target.value)} options={f.options ?? []} placeholder="Select…" />
              ) : (
                <Input
                  type={f.secret ? 'password' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
                  autoComplete={f.secret ? 'new-password' : 'off'}
                  value={values[f.key]}
                  placeholder={configured ? '••••••••' : f.placeholder}
                  onChange={(e) => set(e.target.value)}
                />
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={!!busy}>Cancel</Button>}
        {mode === 'setup' ? (
          <>
            <Button onClick={() => void save(false)} loading={busy === 'save'} disabled={!!busy}>Save draft</Button>
            <Button type="submit" variant="primary" loading={busy === 'activate'} disabled={!!busy}>Activate</Button>
          </>
        ) : (
          <Button type="submit" variant="primary" loading={busy === 'save'} disabled={!!busy}>Save changes</Button>
        )}
      </div>
    </form>
  );
}

