import { RotateCcw, Save, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, ErrorBanner, Field, Input, LoadingBlock, PageHeader, Panel, Textarea, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { href } from '@/lib/router';
import { COMM_CRUMB, useSubmit } from './parts';
import { UNSUBSCRIBE_LINE, defaultFooter } from './shared';
import { EMAIL_RE } from './suppression';

export function EmailSettingsPage() {
  const { settings, loading } = useAppData();
  const { toast } = useFeedback();
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [footer, setFooter] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (!settings || loadedId.current === settings.id) return;
    loadedId.current = settings.id;
    setFromName(settings.email_from_name ?? settings.name ?? '');
    setReplyTo(settings.email_reply_to ?? settings.email ?? '');
    setFooter(settings.email_footer ?? defaultFooter(settings));
  }, [settings]);

  if (loading && !settings) return <LoadingBlock />;
  if (!settings) return <EmptyState title="Agency settings not found" message="Set up your agency profile first." action={<a className="text-sm font-semibold text-brand-600 hover:underline" href={href('/settings')}>Open Settings</a>} />;

  const save = () => {
    const e: Record<string, string> = {};
    if (!fromName.trim()) e.fromName = 'From name is required';
    else if (fromName.trim().length > 80) e.fromName = 'Keep the from name under 80 characters';
    if (!EMAIL_RE.test(replyTo.trim())) e.replyTo = 'Enter a valid reply-to email address';
    if (footer.length > 1000) e.footer = 'Footer must be 1,000 characters or fewer';
    setErrors(e);
    if (Object.keys(e).length) return;
    void submit(async () => {
      await db.update('agency_settings', settings.id, { email_from_name: fromName.trim(), email_reply_to: replyTo.trim(), email_footer: footer.trim() || null });
      toast('Email settings saved');
    });
  };

  return (
    <div className="min-w-0">
      <PageHeader title="Email Settings" icon={<Settings2 size={20} />} breadcrumb={[COMM_CRUMB]} subtitle="Sender details and footer used on every campaign email" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Sender">
          <div className="space-y-3">
            <ErrorBanner message={error} />
            <Field label="From name" required error={errors.fromName} hint="Shown as the sender in the client's inbox.">
              <Input value={fromName} onChange={(e) => { setFromName(e.target.value); setErrors({}); }} />
            </Field>
            <Field label="Reply-to address" required error={errors.replyTo} hint="Client replies go to this address.">
              <Input type="email" value={replyTo} onChange={(e) => { setReplyTo(e.target.value); setErrors({}); }} placeholder="service@youragency.com" />
            </Field>
            <Field label="Email footer" error={errors.footer} hint="Your agency name and mailing address — required on marketing email. Leave blank to use the agency profile.">
              <Textarea value={footer} onChange={(e) => { setFooter(e.target.value); setErrors({}); }} rows={5} />
            </Field>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button icon={<RotateCcw size={14} />} onClick={() => setFooter(defaultFooter(settings))}>Reset footer</Button>
              <Button variant="primary" icon={<Save size={14} />} loading={busy} onClick={save}>Save settings</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Footer preview">
          <div className="border border-ink-100 rounded overflow-hidden text-[13px]">
            <div className="bg-ink-50 border-b border-ink-100 px-3 py-2 text-xs truncate">
              <span className="text-ink-400">From </span><span className="font-semibold text-ink-800">{fromName.trim() || settings.name}</span>
              {replyTo.trim() && <span className="text-ink-400"> &lt;{replyTo.trim()}&gt;</span>}
            </div>
            <div className="px-4 py-4">
              <div className="text-ink-300 italic">…campaign message…</div>
              <div className="mt-5 pt-3 border-t border-ink-100 text-[11px] text-ink-400 text-center space-y-1.5">
                <div className="whitespace-pre-line">{footer.trim() || defaultFooter(settings)}</div>
                <div><span className="underline text-brand-600">Unsubscribe</span> · {UNSUBSCRIBE_LINE.replace(/^Unsubscribe — /, '')}</div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-ink-400 mt-2">Clients who unsubscribe are added to the Email suppression list automatically and never emailed again.</p>
        </Panel>
      </div>
    </div>
  );
}
