import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input, Modal, Pills, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import type { ReportSchedule, SavedReport } from '@/lib/types';
import type { ReportDef } from './registry';
import { SCHEDULES, nextRun } from './saved-lib';

// ── Modals ──

/** Name prompt used by "Save as…" and "Rename". */
export function NameModal({ title, subtitle, initial, confirmLabel, onClose, onSubmit }: { title: string; subtitle?: string; initial: string; confirmLabel: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const v = name.trim();
    if (!v) { setError('Enter a name'); return; }
    setBusy(true);
    try { await onSubmit(v); } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={() => submit()} loading={busy}>{confirmLabel}</Button>
    </>}>
      <form onSubmit={submit}>
        <Field label="Report name" required error={error}>
          <Input autoFocus value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
      </form>
    </Modal>
  );
}

/** Daily / Weekly / Monthly / None + delivery email. Creates a saved report when `saved` is null. */
export function ScheduleModal({ saved, def, onClose, onSaved }: { saved: SavedReport | null; def: ReportDef | null; onClose: () => void; onSaved?: (row: SavedReport) => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [name, setName] = useState(saved?.name ?? (def ? `${def.title} (scheduled)` : ''));
  const [freq, setFreq] = useState<ReportSchedule | 'None'>(saved?.schedule ?? 'Weekly');
  const [email, setEmail] = useState(saved?.schedule_email ?? me?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = freq === 'None' ? null : nextRun({ schedule: freq, created_at: saved?.created_at ?? new Date().toISOString() });

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!saved && !name.trim()) { setError('Enter a name'); return; }
    if (freq !== 'None' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid delivery email'); return; }
    if (!saved && freq === 'None') { setError('Pick how often the report should run'); return; }
    setBusy(true);
    try {
      const patch = { schedule: freq === 'None' ? null : freq, schedule_email: freq === 'None' ? null : email.trim() };
      const row = saved
        ? await db.update('saved_reports', saved.id, patch)
        : await db.insert('saved_reports', { name: name.trim(), report_key: def?.key ?? '', owner: me?.name ?? null, favorite: false, shared: false, ...patch });
      toast(patch.schedule ? `Scheduled ${patch.schedule.toLowerCase()} delivery to ${patch.schedule_email}` : 'Schedule removed');
      onSaved?.(row);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Schedule report" subtitle={saved ? saved.name : def?.title} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={() => submit()} loading={busy}>Save schedule</Button>
    </>}>
      <form onSubmit={submit} className="space-y-3">
        {!saved && (
          <Field label="Saved report name" required hint="Scheduling saves this report to your Saved Reports.">
            <Input value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setError(null); }} />
          </Field>
        )}
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Frequency</span>
          <Pills value={freq} onChange={(v) => { setFreq(v); setError(null); }} options={[...SCHEDULES.map((s) => ({ value: s as ReportSchedule | 'None', label: s })), ...(saved ? [{ value: 'None' as const, label: 'None' }] : [])]} />
        </div>
        {freq !== 'None' && (
          <Field label="Deliver to" required>
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="name@agency.com" />
          </Field>
        )}
        {preview && <div className="text-[13px] text-ink-600">Next run: <span className="font-semibold">{fmtDate(preview)}</span></div>}
        {error && <div className="text-[12px] text-red-600">{error}</div>}
        <div className="rounded border border-amber-200 bg-amber-50 text-amber-800 text-[12px] px-3 py-2">Scheduled delivery is simulated — no email is sent from this training system. Use <b>Run now</b> on the saved report card to generate it on demand.</div>
      </form>
    </Modal>
  );
}

/** Pick staff to share with. Only a boolean is stored; the UI calls it "Shared with agency". */
export function ShareModal({ saved, onClose }: { saved: SavedReport; onClose: () => void }) {
  const { activeStaff, me } = useAppData();
  const { toast } = useFeedback();
  const others = activeStaff.filter((s) => s.name !== me?.name);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(saved.shared ? others.map((s) => s.id) : []));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shared = picked.size > 0;
      await db.update('saved_reports', saved.id, { shared });
      toast(shared ? `Shared with ${picked.size} user${picked.size === 1 ? '' : 's'}` : 'Report is no longer shared');
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal title="Share with" subtitle={saved.name} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={save} loading={busy}>{picked.size ? `Share with ${picked.size}` : 'Save'}</Button>
    </>}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-ink-500">{picked.size} of {others.length} selected</span>
        <button type="button" className="text-[12px] font-semibold text-brand-600 hover:underline bg-transparent" onClick={() => setPicked(picked.size === others.length ? new Set() : new Set(others.map((s) => s.id)))}>
          {picked.size === others.length ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-ink-50 border border-ink-100 rounded">
        {others.length ? others.map((s) => (
          <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
            <Checkbox label={s.name} checked={picked.has(s.id)} onChange={(v) => toggle(s.id, v)} />
            <span className="text-[11px] text-ink-400">{s.role}</span>
          </div>
        )) : <div className="px-3 py-4 text-[13px] text-ink-400">No other active users in the agency.</div>}
      </div>
      <p className="text-[11px] text-ink-400 mt-2">Shared reports appear under Shared Reports for everyone in the agency.</p>
    </Modal>
  );
}
