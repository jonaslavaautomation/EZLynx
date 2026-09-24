import { AlertTriangle, BellRing, CalendarCog, FileBadge, Layers, Puzzle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, ErrorBanner, Field, Input, LoadingBlock, Panel, Select, Textarea, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { useTable } from '@/lib/hooks';
import { COMMERCIAL_LINES, PERSONAL_LINES, type ActivityType, type LineOfBusiness, type Priority } from '@/lib/types';
import { ALL_ACTIVITY_TYPES, type AssigneeRule, type LinesConfig } from './config';
import { AdminHeader, SaveBar, Toggle, useConfigDraft } from './shared';

// ── Activity Settings ──

export function ActivitySettingsPage() {
  const c = useConfigDraft('activity', 'Activity settings saved');
  const [err, setErr] = useState<string | null>(null);
  const d = c.draft;
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => c.setDraft((x) => ({ ...x, [k]: v }));
  const toggleType = (t: ActivityType, on: boolean) => set('enabled_types', ALL_ACTIVITY_TYPES.filter((x) => (x === t ? on : d.enabled_types.includes(x))));

  const save = () => {
    setErr(null);
    if (!Number.isInteger(d.due_in_days) || d.due_in_days < 0 || d.due_in_days > 365) return setErr('Default due-in days must be a whole number from 0 to 365.');
    if (!Number.isInteger(d.renewal_review_days) || d.renewal_review_days < 1 || d.renewal_review_days > 180) return setErr('Renewal review lead time must be 1–180 days.');
    if (!d.enabled_types.length) return setErr('Enable at least one activity type.');
    void c.save();
  };

  return (
    <div className="max-w-4xl">
      <AdminHeader title="Activity Settings" subtitle="Defaults applied when staff create a new activity or task" icon={<CalendarCog size={20} />} />
      {c.loading ? <LoadingBlock /> : (
        <>
          <ErrorBanner message={err ?? c.error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Panel title="New activity defaults">
              <div className="space-y-3">
                <Field label="Default priority">
                  <Select value={d.default_priority} onChange={(e) => set('default_priority', e.target.value as Priority)} options={['Low', 'Normal', 'High']} />
                </Field>
                <Field label="Due in (days)" hint="0 = due today. Applied to the due date of new activities.">
                  <Input type="number" min={0} max={365} value={Number.isNaN(d.due_in_days) ? "" : String(d.due_in_days)} onChange={(e) => set('due_in_days', e.target.value === '' ? NaN : Number(e.target.value))} />
                </Field>
                <Field label="Default assignee" hint="Account CSR / producer apply when the activity is created for an account.">
                  <Select value={d.assignee_rule} onChange={(e) => set('assignee_rule', e.target.value as AssigneeRule)} options={[
                    { value: 'me', label: 'Me (the signed-in user)' }, { value: 'csr', label: 'The account’s CSR / account manager' }, { value: 'producer', label: 'The account’s producer' },
                  ]} />
                </Field>
                <Field label="Renewal review lead time (days)" hint="How far ahead of expiration renewal reviews should be worked.">
                  <Input type="number" min={1} max={180} value={Number.isNaN(d.renewal_review_days) ? "" : String(d.renewal_review_days)} onChange={(e) => set('renewal_review_days', e.target.value === '' ? NaN : Number(e.target.value))} />
                </Field>
              </div>
            </Panel>
            <Panel title="Activity types enabled" actions={<span className="text-xs text-ink-400">{d.enabled_types.length} of {ALL_ACTIVITY_TYPES.length}</span>}>
              <div className="space-y-2">
                {ALL_ACTIVITY_TYPES.map((t) => <div key={t}><Checkbox label={t} checked={d.enabled_types.includes(t)} onChange={(on) => toggleType(t, on)} /></div>)}
              </div>
              <p className="text-[11px] text-ink-400 mt-3">Disabled types are hidden from the New Activity form. Existing activities keep their type, and system-logged notes are unaffected.</p>
            </Panel>
          </div>
          <SaveBar dirty={c.dirty} saving={c.saving} onSave={save} onReset={() => { setErr(null); c.reset(); }} />
        </>
      )}
    </div>
  );
}

// ── Certificate Settings ──

export function CertificateSettingsPage() {
  const c = useConfigDraft('certificates', 'Certificate settings saved');
  const d = c.draft;
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => c.setDraft((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    setErr(null);
    if (d.holder_address.trim() && !d.holder_name.trim()) return setErr('Enter the default certificate holder’s name, or clear the address.');
    if (d.include_ai_wording && !d.ai_wording.trim()) return setErr('Enter the additional insured wording or turn it off.');
    void c.save({ ...d, holder_name: d.holder_name.trim(), holder_address: d.holder_address.trim(), remarks: d.remarks.trim(), authorized_rep: d.authorized_rep.trim(), ai_wording: d.ai_wording.trim() });
  };
  return (
    <div className="max-w-4xl">
      <AdminHeader title="Certificate Settings" subtitle="Master certificate defaults so certificates don’t need re-creating at every renewal" icon={<FileBadge size={20} />} />
      {c.loading ? <LoadingBlock /> : (
        <>
          <ErrorBanner message={err ?? c.error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Panel title="Default certificate holder">
              <div className="space-y-3">
                <Field label="Holder name"><Input value={d.holder_name} maxLength={120} onChange={(e) => set('holder_name', e.target.value)} placeholder="e.g. Riverside Commercial Properties LLC" /></Field>
                <Field label="Holder address"><Textarea rows={3} value={d.holder_address} onChange={(e) => set('holder_address', e.target.value)} placeholder={'Street address\nCity, State ZIP'} /></Field>
                <Field label="Authorized representative" hint="Printed as the authorized representative on generated certificates."><Input value={d.authorized_rep} onChange={(e) => set('authorized_rep', e.target.value)} /></Field>
              </div>
            </Panel>
            <Panel title="Description of operations / remarks">
              <div className="space-y-3">
                <Field label="Master remarks"><Textarea rows={5} value={d.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Description of operations / locations / vehicles…" /></Field>
                <Checkbox label="Include additional insured wording" checked={d.include_ai_wording} onChange={(v) => set('include_ai_wording', v)} />
                {d.include_ai_wording && <Textarea rows={3} value={d.ai_wording} onChange={(e) => set('ai_wording', e.target.value)} />}
              </div>
            </Panel>
          </div>
          <Panel title="Preview" className="mt-4">
            <div className="text-[13px] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><div className="text-[11px] uppercase tracking-wide font-semibold text-ink-400 mb-1">Certificate holder</div><div className="whitespace-pre-wrap">{[d.holder_name, d.holder_address].filter((s) => s.trim()).join('\n') || <span className="text-ink-300">Entered per certificate</span>}</div></div>
              <div><div className="text-[11px] uppercase tracking-wide font-semibold text-ink-400 mb-1">Remarks</div><div className="whitespace-pre-wrap">{[d.remarks, d.include_ai_wording ? d.ai_wording : ''].filter((s) => s.trim()).join('\n\n') || <span className="text-ink-300">None</span>}</div></div>
            </div>
            <p className="text-[11px] text-ink-400 mt-3">These defaults pre-fill ACORD 25 and ACORD 27 in Policy Management → ACORD Library. A form template chosen there overrides them.</p>
          </Panel>
          <SaveBar dirty={c.dirty} saving={c.saving} onSave={save} onReset={() => { setErr(null); c.reset(); }} />
        </>
      )}
    </div>
  );
}

// ── Plugins ──

export const PLUGINS: { key: string; name: string; kind: 'Browser extension' | 'Desktop' | 'Add-in'; description: string; install: string }[] = [
  { key: 'carrier-login', name: 'Carrier Login Extension', kind: 'Browser extension', description: 'One-click sign-in to carrier portals using the logins saved under Carrier Quoting Setup.', install: '1. Open the Chrome or Edge extension store.\n2. Search for the agency’s Carrier Login extension and click Add.\n3. Pin the extension, then sign in with your agency user.\n4. Carrier portal links in policies will open already signed in.' },
  { key: 'quote-capture', name: 'Quote Capture', kind: 'Browser extension', description: 'Captures premiums from carrier websites and saves them to the matching quote as a carrier result.', install: '1. Install the Quote Capture extension from the browser store.\n2. Start a quote in the rater and open the carrier site from the Results step.\n3. Click the Quote Capture icon on the carrier’s summary page to send the premium back.' },
  { key: 'email-addin', name: 'Email (Outlook) Add-in', kind: 'Add-in', description: 'Files emails and attachments from Outlook to the applicant’s record and creates follow-up activities.', install: '1. In Outlook, open Get Add-ins → My add-ins → Add a custom add-in.\n2. Choose “From URL” and paste the manifest link from your administrator.\n3. Open any email and click the agency icon to attach it to an applicant.' },
  { key: 'doc-scanner', name: 'Document Scanner', kind: 'Desktop', description: 'Scans paper applications and mail straight into an applicant’s documents.', install: '1. Download the Document Scanner installer for Windows.\n2. Run it with administrator rights and select your TWAIN scanner.\n3. Choose Scan → Send to applicant, search the name and pick a category.' },
  { key: 'click-to-call', name: 'Click-to-Call', kind: 'Desktop', description: 'Dials phone numbers from the applicant screen through your desk phone and logs a Call activity.', install: '1. Install the softphone connector for your phone system.\n2. Sign in with your extension.\n3. Click any phone number in an applicant record to dial.' },
];

export function PluginsPage() {
  const c = useConfigDraft('plugins', 'Plugin settings saved');
  const [open, setOpen] = useState<string | null>(null);
  const enabled = c.draft.enabled ?? {};
  return (
    <div className="max-w-4xl">
      <AdminHeader title="Plugins" subtitle="Browser and desktop tools available to agency staff" icon={<Puzzle size={20} />} />
      <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[13px] px-3 py-2 mb-3">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span>Plugins are <b>simulated</b> in this training system: enabling one records the agency’s choice and shows staff the install steps, but nothing is downloaded or installed.</span>
      </div>
      {c.loading ? <LoadingBlock /> : (
        <>
          <div className="space-y-2">
            {PLUGINS.map((p) => {
              const on = !!enabled[p.key];
              return (
                <div key={p.key} className="bg-white border border-[#e3e3e3] rounded shadow-card">
                  <div className="flex items-start gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0"><Puzzle size={17} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold text-ink-900">{p.name}</span><Badge>{p.kind}</Badge>{on && <Badge tone="green">Enabled</Badge>}</div>
                      <div className="text-xs text-ink-500 mt-0.5">{p.description}</div>
                      <button type="button" className="text-xs text-brand-600 bg-transparent hover:underline mt-1.5" onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? 'Hide install instructions' : 'Install instructions'}</button>
                    </div>
                    <Toggle label={on ? `Disable ${p.name}` : `Enable ${p.name}`} checked={on} onChange={(v) => c.setDraft((x) => ({ ...x, enabled: { ...x.enabled, [p.key]: v } }))} />
                  </div>
                  {open === p.key && <pre className="mx-4 mb-4 whitespace-pre-wrap font-sans text-xs text-ink-600 bg-ink-50 border border-ink-100 rounded p-3">{p.install}</pre>}
                </div>
              );
            })}
          </div>
          <SaveBar dirty={c.dirty} saving={c.saving} onSave={() => void c.save()} onReset={c.reset} />
        </>
      )}
    </div>
  );
}

// ── Manage Email Subscriptions ──

export const NOTIFICATION_TYPES: { key: string; label: string; hint: string }[] = [
  { key: 'task_digest', label: 'Daily task digest', hint: 'Open and overdue activities each morning' },
  { key: 'renewal_alerts', label: 'Renewal alerts', hint: 'Policies approaching expiration' },
  { key: 'new_lead', label: 'New lead assigned', hint: 'A new applicant is assigned to you' },
  { key: 'claim_updates', label: 'Claim updates', hint: 'Status changes on your clients’ claims' },
  { key: 'esign_completed', label: 'eSignature completed', hint: 'A client finished signing' },
  { key: 'weekly_production', label: 'Weekly production summary', hint: 'New business and premium written' },
];

export function EmailSubscriptionsPage() {
  const { activeStaff } = useAppData();
  const c = useConfigDraft('email_subscriptions', 'Email subscriptions saved');
  const subs = c.draft.subscriptions ?? {};
  const has = (staff: string, key: string) => (subs[staff] ?? []).includes(key);
  const setOne = (staff: string, key: string, on: boolean) => c.setDraft((x) => {
    const cur = x.subscriptions?.[staff] ?? [];
    return { ...x, subscriptions: { ...x.subscriptions, [staff]: on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key) } };
  });
  const setColumn = (key: string, on: boolean) => c.setDraft((x) => {
    const next = { ...x.subscriptions };
    activeStaff.forEach((s) => { const cur = next[s.name] ?? []; next[s.name] = on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key); });
    return { ...x, subscriptions: next };
  });
  return (
    <div className="max-w-6xl">
      <AdminHeader title="Manage Email Subscriptions" subtitle="Choose which notification emails each staff member receives" icon={<BellRing size={20} />} />
      {c.loading ? <LoadingBlock /> : (
        <>
          <Panel bodyClassName="p-0">
            {!activeStaff.length ? <div className="p-6 text-[13px] text-ink-400">No active staff. Add users under Settings → Users.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50/60">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">Staff member</th>
                      {NOTIFICATION_TYPES.map((n) => {
                        const all = activeStaff.every((s) => has(s.name, n.key));
                        return (
                          <th key={n.key} className="px-2 py-2 text-center align-bottom min-w-[110px]" title={n.hint}>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 leading-tight">{n.label}</div>
                            <button type="button" className="text-[11px] text-brand-600 bg-transparent hover:underline mt-1" onClick={() => setColumn(n.key, !all)}>{all ? 'None' : 'All'}</button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {activeStaff.map((s) => (
                      <tr key={s.id} className="border-b border-ink-50 last:border-0">
                        <td className="px-3 py-2"><div className="font-semibold text-ink-900">{s.name}</div><div className="text-xs text-ink-400">{s.role} · {s.email}</div></td>
                        {NOTIFICATION_TYPES.map((n) => (
                          <td key={n.key} className="px-2 py-2 text-center">
                            <input type="checkbox" aria-label={`${n.label} for ${s.name}`} className="w-4 h-4 accent-[#dc2626] cursor-pointer" checked={has(s.name, n.key)} onChange={(e) => setOne(s.name, n.key, e.target.checked)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p className="text-[11px] text-ink-400 mt-2">Notification emails are simulated in this training system; subscriptions are saved per staff member.</p>
          <SaveBar dirty={c.dirty} saving={c.saving} onSave={() => void c.save()} onReset={c.reset} />
        </>
      )}
    </div>
  );
}

// ── Manage Lines of Business ──

export function LinesPage() {
  const { confirm } = useFeedback();
  const c = useConfigDraft('lines', 'Lines of business saved');
  const policies = useTable('policies', { eq: { status: 'Active' } });
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    policies.data.forEach((p) => m.set(p.line_of_business, (m.get(p.line_of_business) ?? 0) + 1));
    return m;
  }, [policies.data]);
  const lines: LinesConfig = c.draft;

  const setLine = (l: LineOfBusiness, patch: Partial<LinesConfig[string]>) => c.setDraft((x) => ({ ...x, [l]: { ...x[l], ...patch } }));
  const toggle = async (l: LineOfBusiness, on: boolean) => {
    const n = counts.get(l) ?? 0;
    if (!on && n > 0) {
      const ok = await confirm({ title: `Disable ${l}?`, message: `${n} active ${l} polic${n === 1 ? 'y is' : 'ies are'} on the books. They are not changed, but ${l} will no longer be offered when adding policies or starting quotes.`, confirmLabel: 'Disable line' });
      if (!ok) return;
    }
    setLine(l, { enabled: on });
  };

  const group = (title: string, list: LineOfBusiness[]) => (
    <Panel title={title} bodyClassName="p-0" actions={<span className="text-xs text-ink-400">{list.filter((l) => lines[l]?.enabled !== false).length} of {list.length} enabled</span>}>
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <th className="px-3 py-2 text-left">Line</th><th className="px-3 py-2 text-right">Active policies</th><th className="px-3 py-2 text-left">Default term</th><th className="px-3 py-2 text-center">Enabled</th>
        </tr></thead>
        <tbody>
          {list.map((l) => {
            const s = lines[l] ?? { enabled: true, default_term: 12 };
            return (
              <tr key={l} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-2"><span className={s.enabled ? 'font-semibold text-ink-900' : 'text-ink-400'}>{l}</span>{!s.enabled && (counts.get(l) ?? 0) > 0 && <Badge tone="amber" className="ml-2">Disabled with active policies</Badge>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{counts.get(l) ?? 0}</td>
                <td className="px-3 py-2"><Select className="w-32 h-8" value={String(s.default_term)} onChange={(e) => setLine(l, { default_term: Number(e.target.value) === 6 ? 6 : 12 })} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} /></td>
                <td className="px-3 py-2 text-center"><Toggle label={s.enabled ? `Disable ${l}` : `Enable ${l}`} checked={s.enabled} onChange={(v) => void toggle(l, v)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );

  return (
    <div className="max-w-5xl">
      <AdminHeader title="Manage Lines of Business" subtitle="Lines offered in policy entry and the rater, with their default policy term" icon={<Layers size={20} />}
        actions={<Button size="sm" onClick={() => c.setDraft((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, enabled: true }])))}>Enable all</Button>} />
      {c.loading ? <LoadingBlock /> : (
        <>
          <ErrorBanner message={c.error ?? policies.error} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {group('Personal lines', PERSONAL_LINES)}
            {group('Commercial lines', COMMERCIAL_LINES)}
          </div>
          <p className="text-[11px] text-ink-400 mt-2">Disabled lines are hidden from the Add Policy form and the quote wizard (a record already using the line keeps it). The default term pre-fills new policies.</p>
          <SaveBar dirty={c.dirty} saving={c.saving} onSave={() => void c.save()} onReset={c.reset} />
        </>
      )}
    </div>
  );
}
