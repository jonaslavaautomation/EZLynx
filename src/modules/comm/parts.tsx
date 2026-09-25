import { Check } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type RefObject, type TextareaHTMLAttributes } from 'react';
import { Badge, cx, useFeedback, type Tone } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import type { CampaignStatus, EmailCampaign } from '@/lib/types';
import { href } from '@/lib/router';
import { MERGE_FIELDS, sendCampaign } from './shared';

// The UI kit's Input/Textarea don't forward refs; these match their styling and do, so merge fields can
// be inserted at the cursor.
const controlCls = 'w-full h-9 rounded border border-ink-200 bg-white px-2.5 text-[13px] text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400';
export const RefInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function RefInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(controlCls, className)} {...rest} />;
});
export const RefTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function RefTextarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(controlCls, 'h-auto min-h-[80px] py-2 resize-y', className)} {...rest} />;
});

export const COMM_CRUMB = { label: 'Communication Center', href: href('/comm') };

const CAMPAIGN_TONES: Record<CampaignStatus, Tone> = { Sent: 'green', Scheduled: 'blue', Draft: 'gray' };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONES[status] ?? 'gray'}>{status}</Badge>;
}

const REASON_TONES: Record<string, Tone> = { Unsubscribed: 'amber', Bounced: 'red', Manual: 'gray', 'STOP reply': 'purple' };
export function ReasonBadge({ reason }: { reason: string }) {
  return <Badge tone={REASON_TONES[reason] ?? 'gray'}>{reason}</Badge>;
}

/** Toggle chips for a multi-select filter. */
export function ChipMulti({ options, value, onChange, empty = 'Any' }: { options: string[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onChange([])} className={cx('h-7 px-2.5 rounded-full border text-xs font-semibold', value.length === 0 ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300')}>{empty}</button>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on} className={cx('h-7 px-2.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1', on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-200 text-ink-700 hover:border-brand-200')}>
            {on && <Check size={11} />}{o}
          </button>
        );
      })}
    </div>
  );
}

/** Inserts `token` at the textarea/input cursor and returns the new value via `onChange`. */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, token: string, onChange: (v: string) => void) {
  if (!el) { onChange(value + token); return; }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  onChange(value.slice(0, start) + token + value.slice(end));
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
}

export function MergeFieldBar({ target, value, onChange }: { target: RefObject<HTMLTextAreaElement | HTMLInputElement>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-ink-400 mr-1">Insert:</span>
      {MERGE_FIELDS.map((f) => (
        <button key={f} type="button" onClick={() => insertAtCursor(target.current, value, f, onChange)} className="h-6 px-1.5 rounded border border-ink-200 bg-white text-[11px] font-mono text-ink-600 hover:border-brand-300 hover:text-brand-700">
          {f}
        </button>
      ))}
    </div>
  );
}

/** Async submit with busy state and a ref guard so double clicks never submit twice. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const submit = useCallback(async (fn: () => Promise<unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await fn(); return true; } catch (e) { setError((e as Error).message); return false; } finally { lock.current = false; setBusy(false); }
  }, []);
  return { busy, error, setError, submit };
}

/**
 * Sends Scheduled campaigns whose time has come. Runs when `campaigns` loads/changes and every 30s while
 * mounted; `sendCampaign` atomically claims the campaign first, so another tab running this same scheduler
 * can't send it twice (the loser's "already sent" error is not toasted).
 */
export function useScheduledRunner(campaigns: EmailCampaign[]) {
  const { settings, me, loading } = useAppData();
  const { toast } = useFeedback();
  const attempted = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (loading) return; // wait for agency settings so merge fields and the footer are filled in
    const now = Date.now();
    const due = campaigns.filter((c) => c.status === 'Scheduled' && c.scheduled_at && new Date(c.scheduled_at).getTime() <= now && !attempted.current.has(c.id));
    for (const c of due) {
      attempted.current.add(c.id);
      sendCampaign(c.id, settings, me?.name)
        .then((r) => toast(`Scheduled campaign “${c.name}” sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'}${r.suppressed ? ` (${r.suppressed} suppressed)` : ''}`))
        .catch((e: Error) => { if (!/already/.test(e.message)) toast(`Scheduled campaign “${c.name}” failed: ${e.message}`, 'error'); });
    }
  }, [campaigns, tick, settings, me?.name, toast, loading]);
}
