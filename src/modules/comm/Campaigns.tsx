import { CalendarClock, Check, Copy, Eye, FilePen, Info, Mail, MailX, Pencil, Plus, Send, Trash2, Undo2, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button, DataTable, DescriptionList, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Menu, PageHeader, Panel, Pills, SearchInput, Select,
  StatCard, cx, useFeedback, type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, fmtDateTime, fmtNumber } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import type { Account, AgencySettings, CampaignStatus, EmailCampaign, Message } from '@/lib/types';
import { ListEditorModal, useRecipientData } from './Lists';
import { COMM_CRUMB, CampaignStatusBadge, MergeFieldBar, RefInput, RefTextarea, useScheduledRunner, useSubmit } from './parts';
import {
  SIMULATED_NOTE, UNSUBSCRIBE_LINE, campaignMessages, describeFilters, footerOf, fromLocalInput, matchRecipients, mergeFields,
  partitionRecipients, sendCampaign, toLocalInput,
} from './shared';
import { suppressionKey } from './suppression';

const CAMPAIGNS_CRUMB = { label: 'Campaigns', href: href('/comm/campaigns') };

export const campaignDate = (c: EmailCampaign) => (c.status === 'Sent' ? c.sent_at : c.status === 'Scheduled' ? c.scheduled_at : c.created_at);

// ── Row actions shared by the dashboard, list and detail ──

export function useCampaignActions() {
  const { toast, confirm } = useFeedback();
  const { settings, me } = useAppData();
  const sending = useRef(false);

  const duplicate = async (c: EmailCampaign) => {
    try {
      const copy = await db.insert('email_campaigns', {
        name: `${c.name} (copy)`, subject: c.subject, body: c.body, recipient_list_id: c.recipient_list_id,
        status: 'Draft', scheduled_at: null, sent_at: null, sent_count: 0, suppressed_count: 0,
      });
      toast('Campaign duplicated as a draft');
      navigate(`/comm/campaigns/${copy.id}/edit`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const cancelSchedule = async (c: EmailCampaign) => {
    const ok = await confirm({ title: 'Cancel scheduled send?', message: `“${c.name}” will move back to Drafts and won't be sent.`, confirmLabel: 'Cancel schedule' });
    if (!ok) return;
    try {
      const cur = await db.get('email_campaigns', c.id);
      if (cur?.status !== 'Scheduled') throw new Error('This campaign is no longer scheduled');
      await db.update('email_campaigns', c.id, { status: 'Draft', scheduled_at: null });
      toast('Schedule canceled — campaign moved to Drafts');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const remove = async (c: EmailCampaign, after?: () => void) => {
    const ok = await confirm({
      title: 'Delete campaign?',
      message: <>“{c.name}” will be permanently deleted.{c.status === 'Sent' ? ' Emails already delivered stay in each client’s message history.' : ''}</>,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await db.remove('email_campaigns', c.id); toast('Campaign deleted'); after?.(); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const sendNow = async (c: EmailCampaign) => {
    if (sending.current) return;
    const ok = await confirm({ title: 'Send campaign now?', message: `“${c.name}” will be emailed to its recipient list right away. Suppressed addresses are skipped.`, confirmLabel: 'Send now' });
    if (!ok) return;
    sending.current = true;
    try {
      const r = await sendCampaign(c.id, settings, me?.name);
      toast(`Campaign sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'}${r.suppressed ? ` · ${r.suppressed} suppressed` : ''}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { sending.current = false; }
  };

  const items = (c: EmailCampaign, opts: { detail?: boolean; afterDelete?: () => void } = {}) => [
    ...(opts.detail ? [] : [{ label: 'Open', icon: <Eye size={14} />, onClick: () => navigate(`/comm/campaigns/${c.id}`) }]),
    ...(c.status !== 'Sent' ? [{ label: 'Edit', icon: <Pencil size={14} />, onClick: () => navigate(`/comm/campaigns/${c.id}/edit`) }] : []),
    { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(c) },
    ...(c.status === 'Scheduled' ? [{ label: 'Cancel schedule', icon: <Undo2 size={14} />, onClick: () => void cancelSchedule(c) }] : []),
    'divider' as const,
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(c, opts.afterDelete) },
  ];

  return { duplicate, cancelSchedule, remove, sendNow, items };
}

export function CampaignsTable({ rows, loading, listName, compact, empty }: { rows: EmailCampaign[]; loading?: boolean; listName: (id: string | null) => string; compact?: boolean; empty?: ReactNode }) {
  const actions = useCampaignActions();
  const columns: Column<EmailCampaign>[] = [
    {
      key: 'name', header: 'Campaign', sortValue: (c) => c.name.toLowerCase(), render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-ink-900 truncate max-w-[260px]">{c.name}</div>
          <div className="text-xs text-ink-400 truncate max-w-[260px]">{c.subject || 'No subject'}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <CampaignStatusBadge status={c.status} /> },
    { key: 'list', header: 'Recipient list', className: 'hidden md:table-cell', sortValue: (c) => listName(c.recipient_list_id), render: (c) => <span className="text-ink-500">{listName(c.recipient_list_id)}</span> },
    { key: 'date', header: 'Date', className: compact ? 'hidden sm:table-cell' : undefined, sortValue: (c) => campaignDate(c) ?? '', render: (c) => <span className="whitespace-nowrap text-ink-500">{c.status === 'Draft' ? 'Created ' : ''}{fmtDateTime(campaignDate(c))}</span> },
    { key: 'sent', header: 'Delivered', align: 'right', sortValue: (c) => c.sent_count, render: (c) => (c.status === 'Sent' ? <span className="tabular-nums font-semibold">{fmtNumber(c.sent_count)}</span> : <span className="text-ink-300">—</span>) },
    { key: 'supp', header: 'Suppressed', align: 'right', className: 'hidden sm:table-cell', sortValue: (c) => c.suppressed_count, render: (c) => (c.status === 'Sent' ? <span className="tabular-nums">{fmtNumber(c.suppressed_count)}</span> : <span className="text-ink-300">—</span>) },
    { key: 'menu', header: '', align: 'right', render: (c) => <Menu items={actions.items(c)} /> },
  ];
  return <DataTable columns={columns} rows={rows} loading={loading} onRowClick={(c) => navigate(`/comm/campaigns/${c.id}`)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={compact ? 6 : 25} empty={empty} />;
}

// ── List ──

type Tab = 'All' | CampaignStatus;

export function CampaignsPage() {
  const campaigns = useTable('email_campaigns', { order: { column: 'created_at', ascending: false } });
  const lists = useTable('recipient_lists');
  useScheduledRunner(campaigns.data);
  const { params } = useRoute();
  const raw = params.get('status');
  const tab: Tab = raw === 'Sent' || raw === 'Scheduled' || raw === 'Draft' ? raw : 'All';
  const [q, setQ] = useState('');
  const listName = (id: string | null) => (id ? lists.data.find((l) => l.id === id)?.name ?? 'Deleted list' : 'No list');

  const base = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? campaigns.data.filter((c) => `${c.name} ${c.subject}`.toLowerCase().includes(t)) : campaigns.data;
  }, [campaigns.data, q]);
  const rows = tab === 'All' ? base : base.filter((c) => c.status === tab);
  const count = (s: CampaignStatus) => base.filter((c) => c.status === s).length;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Email Campaigns"
        icon={<Mail size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle="Bulk emails to a saved recipient list — send now, schedule, or keep as a draft"
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/comm/campaigns/new')}>New campaign</Button>}
      />
      <ErrorBanner message={campaigns.error} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills<Tab>
            value={tab}
            onChange={(v) => setParam('status', v === 'All' ? null : v)}
            options={[
              { value: 'Sent', label: 'Sent', count: count('Sent') },
              { value: 'Scheduled', label: 'Scheduled', count: count('Scheduled') },
              { value: 'Draft', label: 'Drafts', count: count('Draft') },
              { value: 'All', label: 'All', count: base.length },
            ]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Search name or subject…" className="w-full sm:w-64 sm:ml-auto" />
        </div>
        <CampaignsTable
          rows={rows}
          loading={campaigns.loading}
          listName={listName}
          empty={<EmptyState icon={<Mail size={22} />} title={campaigns.data.length ? 'No campaigns here' : 'No campaigns yet'} message="Create a campaign, pick a recipient list and write your message." action={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/comm/campaigns/new')}>New campaign</Button>} />}
        />
      </Panel>
    </div>
  );
}

// ── Preview ──

export function EmailPreview({ subject, body, account, settings, agent, placeholder }: { subject: string; body: string; account: Account | null; settings: AgencySettings | null; agent: string | null | undefined; placeholder?: string }) {
  const from = settings?.email_from_name?.trim() || settings?.name || 'Your agency';
  const reply = settings?.email_reply_to?.trim() || settings?.email || '';
  const footer = footerOf(settings);
  return (
    <div className="border border-ink-100 rounded overflow-hidden text-[13px]">
      <div className="bg-ink-50 border-b border-ink-100 px-3 py-2 space-y-0.5 text-xs">
        <div className="truncate"><span className="text-ink-400 w-14 inline-block">From</span><span className="text-ink-800 font-semibold">{from}</span>{reply && <span className="text-ink-400"> &lt;{reply}&gt;</span>}</div>
        <div className="truncate"><span className="text-ink-400 w-14 inline-block">To</span><span className="text-ink-800">{account ? `${accountName(account)} <${account.email}>` : placeholder ?? 'First recipient'}</span></div>
        <div className="truncate"><span className="text-ink-400 w-14 inline-block">Subject</span><span className="text-ink-900 font-semibold">{subject.trim() ? mergeFields(subject, account, settings, agent) : <span className="text-ink-300 font-normal">No subject</span>}</span></div>
      </div>
      <div className="px-4 py-4 bg-white">
        <div className="whitespace-pre-wrap break-words text-ink-800 min-h-[60px]">{body.trim() ? mergeFields(body, account, settings, agent) : <span className="text-ink-300">Your message will appear here.</span>}</div>
        <div className="mt-5 pt-3 border-t border-ink-100 text-[11px] text-ink-400 text-center space-y-1.5">
          {footer && <div className="whitespace-pre-line">{footer}</div>}
          <div><span className="underline text-brand-600">Unsubscribe</span> · {UNSUBSCRIBE_LINE.replace(/^Unsubscribe — /, '')}</div>
        </div>
      </div>
    </div>
  );
}

// ── Builder ──

type When = 'now' | 'schedule' | 'draft';
const STEPS = ['Recipients', 'Content', 'Send'];

export function CampaignBuilder({ id, initialListId }: { id: string | null; initialListId: string | null }) {
  const { toast, confirm } = useFeedback();
  const { settings, me } = useAppData();
  const existing = useRow('email_campaigns', id);
  const lists = useTable('recipient_lists', { order: { column: 'name' } });
  const templates = useTable('message_templates', { eq: { channel: 'Email' }, order: { column: 'name' } });
  const suppressions = useTable('suppressions', { eq: { channel: 'Email' } });
  const data = useRecipientData();
  const { busy, error, setError, submit } = useSubmit();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [listId, setListId] = useState<string>(initialListId ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [scheduled, setScheduled] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newList, setNewList] = useState(false);
  const savedId = useRef<string | null>(id);
  const loaded = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Load an existing campaign into the form once.
  useEffect(() => {
    const c = existing.data;
    if (!c || loaded.current) return;
    loaded.current = true;
    setName(c.name);
    setListId(c.recipient_list_id ?? '');
    setSubject(c.subject);
    setBody(c.body);
    if (c.status === 'Scheduled') { setWhen('schedule'); setScheduled(toLocalInput(c.scheduled_at)); }
  }, [existing.data]);

  const list = lists.data.find((l) => l.id === listId) ?? null;
  const suppressedSet = useMemo(() => new Set(suppressions.data.map((s) => suppressionKey('Email', s.address))), [suppressions.data]);
  const audience = useMemo(() => {
    if (!list) return { send: [] as Account[], suppressedCount: 0 };
    return partitionRecipients(matchRecipients(list.filters ?? {}, data.accounts, data.policies), suppressedSet);
  }, [list, data.accounts, data.policies, suppressedSet]);
  const first = audience.send[0] ?? null;

  if (id && existing.loading && !existing.data) return <LoadingBlock />;
  if (id && !existing.data) return <EmptyState title="Campaign not found" message="It may have been deleted." action={<Button size="sm" onClick={() => navigate('/comm/campaigns')}>Back to campaigns</Button>} />;
  if (existing.data?.status === 'Sent') {
    return <EmptyState icon={<Check size={22} />} title="This campaign was already sent" message="Sent campaigns can't be edited. Duplicate it to send a new version." action={<Button size="sm" onClick={() => navigate(`/comm/campaigns/${existing.data!.id}`)}>View campaign</Button>} />;
  }

  const validate = (upTo: number) => {
    const e: Record<string, string> = {};
    if (upTo >= 0) {
      if (!name.trim()) e.name = 'Campaign name is required';
      if (!listId) e.list = 'Choose a recipient list';
    }
    if (upTo >= 1) {
      if (!subject.trim()) e.subject = 'Subject is required';
      if (!body.trim()) e.body = 'Message body is required';
    }
    setErrors(e);
    if (Object.keys(e).length) { setStep(e.name || e.list ? 0 : 1); return false; }
    return true;
  };

  const persist = async (status: CampaignStatus, scheduled_at: string | null) => {
    const values = { name: name.trim(), recipient_list_id: listId || null, subject: subject.trim(), body: body.trimEnd(), status, scheduled_at };
    if (savedId.current) {
      const cur = await db.get('email_campaigns', savedId.current);
      if (cur?.status === 'Sent') throw new Error('This campaign has already been sent');
      await db.update('email_campaigns', savedId.current, values);
    } else {
      const row = await db.insert('email_campaigns', { ...values, sent_at: null, sent_count: 0, suppressed_count: 0 });
      savedId.current = row.id;
    }
    return savedId.current!;
  };

  const saveDraft = () => {
    if (!name.trim()) { setErrors({ name: 'Give the draft a name' }); setStep(0); return; }
    void submit(async () => {
      const cid = await persist('Draft', null);
      toast('Draft saved');
      navigate(`/comm/campaigns/${cid}`);
    });
  };

  const finish = async () => {
    if (when === 'draft') { saveDraft(); return; }
    if (!validate(1)) return;
    if (when === 'schedule') {
      const iso = fromLocalInput(scheduled);
      if (!iso) { setErrors({ scheduled: 'Choose a date and time' }); return; }
      if (new Date(iso).getTime() <= Date.now() + 30000) { setErrors({ scheduled: 'Pick a time in the future' }); return; }
      void submit(async () => {
        const cid = await persist('Scheduled', iso);
        toast(`Scheduled for ${fmtDateTime(iso)}`);
        navigate(`/comm/campaigns/${cid}`);
      });
      return;
    }
    if (!audience.send.length) { setError('No one on this list can be emailed (no valid addresses, or all are suppressed).'); return; }
    const ok = await confirm({
      title: 'Send campaign now?',
      message: <>This emails <b>{audience.send.length}</b> recipient{audience.send.length === 1 ? '' : 's'} on “{list?.name}”.{audience.suppressedCount ? ` ${audience.suppressedCount} suppressed address${audience.suppressedCount === 1 ? ' is' : 'es are'} skipped.` : ''} Delivery is simulated.</>,
      confirmLabel: 'Send now',
    });
    if (!ok) return;
    void submit(async () => {
      const cid = await persist('Draft', null);
      const r = await sendCampaign(cid, settings, me?.name);
      toast(`Campaign sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'}${r.suppressed ? ` · ${r.suppressed} suppressed` : ''}`);
      navigate(`/comm/campaigns/${cid}`);
    });
  };

  const applyTemplate = (tid: string) => {
    const t = templates.data.find((x) => x.id === tid);
    if (!t) return;
    if (t.subject) setSubject(t.subject);
    setBody(t.body);
    setErrors({});
  };

  const next = () => { if (validate(step)) setStep(step + 1); };
  const goTo = (i: number) => { if (i <= step || validate(i - 1)) setStep(i); };
  const minLocal = toLocalInput(new Date(Date.now() + 60000).toISOString());

  const preview = (
    <Panel title="Preview" actions={<span className="text-[11px] text-ink-400">{first ? 'First recipient' : 'Sample'}</span>}>
      <EmailPreview subject={subject} body={body} account={first} settings={settings} agent={me?.name} placeholder={list ? 'No eligible recipients' : 'Choose a recipient list'} />
    </Panel>
  );

  return (
    <div className="min-w-0">
      <PageHeader
        title={id ? `Edit campaign` : 'New campaign'}
        subtitle={existing.data ? <span className="inline-flex items-center gap-2">{existing.data.name} <CampaignStatusBadge status={existing.data.status} /></span> : 'Bulk email to a saved recipient list'}
        icon={<FilePen size={20} />}
        breadcrumb={[COMM_CRUMB, CAMPAIGNS_CRUMB]}
        actions={<Button onClick={saveDraft} loading={busy && when === 'draft'} disabled={busy}>Save draft</Button>}
      />

      {/* Stepper */}
      <ol className="flex items-center gap-2 mb-4 overflow-x-auto">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 shrink-0">
            {i > 0 && <span className="w-6 sm:w-10 h-px bg-ink-200" />}
            <button type="button" onClick={() => goTo(i)} className={cx('flex items-center gap-2 bg-transparent text-[13px] font-semibold', i === step ? 'text-brand-600' : i < step ? 'text-ink-700' : 'text-ink-400')}>
              <span className={cx('w-6 h-6 rounded-full grid place-items-center text-[11px] border', i === step ? 'bg-brand-500 border-brand-500 text-white' : i < step ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-ink-200')}>{i < step ? <Check size={12} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <ErrorBanner message={error || lists.error || data.error} />

      <div className={cx('grid gap-4 mt-3', step > 0 && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
        {step === 0 && (
          <Panel title="Name and recipients">
            <div className="space-y-4 max-w-2xl">
              <Field label="Campaign name" required error={errors.name} hint="Internal name — recipients don't see it.">
                <Input value={name} autoFocus onChange={(e) => { setName(e.target.value); setErrors({}); }} placeholder="e.g. October renewal reminder" />
              </Field>
              <Field label="Recipient list" required error={errors.list}>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={listId} onChange={(e) => { setListId(e.target.value); setErrors({}); }} placeholder={lists.loading ? 'Loading lists…' : 'Choose a saved list'} options={lists.data.map((l) => ({ value: l.id, label: l.name }))} />
                  <Button icon={<Plus size={14} />} onClick={() => setNewList(true)} className="shrink-0">Create list</Button>
                </div>
              </Field>
              {list && (
                <div className="border border-ink-100 rounded p-3 bg-ink-50/50 space-y-2">
                  <div className="text-xs text-ink-500">{describeFilters(list.filters ?? {})}</div>
                  <div className="flex flex-wrap gap-4">
                    <div><div className="text-xl font-semibold text-ink-900 tabular-nums">{data.loading ? '…' : audience.send.length}</div><div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">Will receive</div></div>
                    <div><div className="text-xl font-semibold text-ink-900 tabular-nums">{data.loading ? '…' : audience.suppressedCount}</div><div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">Suppressed</div></div>
                  </div>
                  {audience.send.length > 0 && (
                    <div className="text-xs text-ink-500">
                      e.g. {audience.send.slice(0, 5).map((a) => accountName(a)).join(', ')}{audience.send.length > 5 ? ` and ${audience.send.length - 5} more` : ''}
                    </div>
                  )}
                  <a href={href('/comm/lists')} className="text-xs font-semibold text-brand-600 hover:underline">Manage recipient lists</a>
                </div>
              )}
              {!lists.loading && !lists.data.length && <p className="text-xs text-ink-500">You have no saved lists yet — create one to choose your audience.</p>}
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel title="Content">
            <div className="space-y-3">
              {templates.data.length > 0 && (
                <Field label="Start from a template">
                  <Select value="" onChange={(e) => applyTemplate(e.target.value)} placeholder="Choose an email template…" options={templates.data.map((t) => ({ value: t.id, label: t.name }))} />
                </Field>
              )}
              <Field label="Subject" required error={errors.subject}>
                <RefInput ref={subjectRef} value={subject} onChange={(e) => { setSubject(e.target.value); setErrors({}); }} placeholder="e.g. Time to review your coverage, {first_name}" />
              </Field>
              <MergeFieldBar target={subjectRef} value={subject} onChange={setSubject} />
              <Field label="Message" required error={errors.body}>
                <RefTextarea ref={bodyRef} value={body} onChange={(e) => { setBody(e.target.value); setErrors({}); }} rows={12} placeholder={'Hi {first_name},\n\n…\n\n{agent}\n{agency}'} />
              </Field>
              <MergeFieldBar target={bodyRef} value={body} onChange={setBody} />
              <p className="text-[11px] text-ink-400">The agency email footer and an Unsubscribe line are added automatically. Edit them in <a className="text-brand-600 hover:underline" href={href('/comm/settings')}>Email settings</a>.</p>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel title="Send">
            <div className="space-y-3">
              <DescriptionList columns={2} items={[
                { label: 'Campaign', value: name },
                { label: 'Recipient list', value: list?.name },
                { label: 'Will receive', value: data.loading ? '…' : fmtNumber(audience.send.length) },
                { label: 'Suppressed (skipped)', value: data.loading ? '…' : fmtNumber(audience.suppressedCount) },
              ]} />
              <div className="space-y-2 pt-2">
                {([
                  ['now', 'Send now', 'Email every eligible recipient immediately.', <Send key="i" size={15} />],
                  ['schedule', 'Schedule', 'Send automatically at a future date and time.', <CalendarClock key="i" size={15} />],
                  ['draft', 'Save as draft', 'Keep working on it later.', <FilePen key="i" size={15} />],
                ] as [When, string, string, ReactNode][]).map(([v, label, hint, icon]) => (
                  <label key={v} className={cx('flex items-start gap-3 border rounded px-3 py-2.5 cursor-pointer', when === v ? 'border-brand-300 bg-brand-50/50' : 'border-ink-200 hover:border-ink-300')}>
                    <input type="radio" name="when" className="mt-1 accent-[#dc2626]" checked={when === v} onChange={() => { setWhen(v); setErrors({}); }} />
                    <span className="text-ink-500 mt-0.5">{icon}</span>
                    <span><span className="block text-[13px] font-semibold text-ink-900">{label}</span><span className="block text-xs text-ink-400">{hint}</span></span>
                  </label>
                ))}
              </div>
              {when === 'schedule' && (
                <Field label="Send at" required error={errors.scheduled}>
                  <Input type="datetime-local" value={scheduled} min={minLocal} onChange={(e) => { setScheduled(e.target.value); setErrors({}); }} />
                </Field>
              )}
              <div className="flex items-start gap-2 text-xs text-ink-500 bg-amber-50 border border-amber-200 rounded px-3 py-2"><Info size={13} className="text-amber-600 shrink-0 mt-0.5" /> {SIMULATED_NOTE}</div>
            </div>
          </Panel>
        )}

        {step > 0 && preview}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate('/comm/campaigns') : setStep(step - 1))} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 2
          ? <Button variant="primary" onClick={next}>Next: {STEPS[step + 1]}</Button>
          : <Button variant="primary" loading={busy} icon={when === 'now' ? <Send size={14} /> : when === 'schedule' ? <CalendarClock size={14} /> : <FilePen size={14} />} onClick={() => void finish()}>
              {when === 'now' ? `Send to ${audience.send.length}` : when === 'schedule' ? 'Schedule campaign' : 'Save draft'}
            </Button>}
      </div>

      {newList && <ListEditorModal list={null} onClose={() => setNewList(false)} onSaved={(l) => { setListId(l.id); setErrors({}); }} />}
    </div>
  );
}

// ── Detail ──

export function CampaignDetail({ id }: { id: string }) {
  const { settings, me } = useAppData();
  const campaign = useRow('email_campaigns', id);
  const c = campaign.data;
  const lists = useTable('recipient_lists');
  const all = useMemo(() => (c ? [c] : []), [c]);
  useScheduledRunner(all);
  const messages = useTable('messages', c?.status === 'Sent' ? { eq: { channel: 'Email', direction: 'Outbound' } } : null);
  const rows = useMemo(() => (c ? campaignMessages(c, messages.data) : []), [c, messages.data]);
  const ids = useMemo(() => [...new Set(rows.map((m) => m.account_id))], [rows]);
  const accounts = useTable('accounts', ids.length ? { in: { column: 'id', values: ids } } : null);
  const byId = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const data = useRecipientData();
  const suppressions = useTable('suppressions', { eq: { channel: 'Email' } });
  const actions = useCampaignActions();

  const list = c?.recipient_list_id ? lists.data.find((l) => l.id === c.recipient_list_id) ?? null : null;
  const audience = useMemo(() => {
    if (!list) return null;
    const supp = new Set(suppressions.data.map((s) => suppressionKey('Email', s.address)));
    return partitionRecipients(matchRecipients(list.filters ?? {}, data.accounts, data.policies), supp);
  }, [list, data.accounts, data.policies, suppressions.data]);

  if (campaign.loading && !c) return <LoadingBlock />;
  if (!c) return <EmptyState title="Campaign not found" message="It may have been deleted." action={<Button size="sm" onClick={() => navigate('/comm/campaigns')}>Back to campaigns</Button>} />;

  const sampleAccount = rows[0] ? byId.get(rows[0].account_id) ?? null : audience?.send[0] ?? null;

  const cols: Column<Message>[] = [
    {
      key: 'name', header: 'Recipient', sortValue: (m) => accountName(byId.get(m.account_id)), render: (m) => {
        const a = byId.get(m.account_id);
        return a ? <a href={href(`/accounts/${a.id}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-600 hover:underline">{accountName(a)}</a> : <span className="text-ink-400">Deleted account</span>;
      },
    },
    { key: 'to', header: 'Email', sortValue: (m) => m.to_address ?? '', render: (m) => <span className="text-ink-500 break-all">{m.to_address}</span> },
    { key: 'subject', header: 'Subject', className: 'hidden md:table-cell', render: (m) => <span className="truncate block max-w-[260px]">{m.subject}</span> },
    { key: 'status', header: 'Status', render: (m) => <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><Check size={12} />{m.status}</span> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={c.name}
        icon={<Mail size={20} />}
        breadcrumb={[COMM_CRUMB, CAMPAIGNS_CRUMB]}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><CampaignStatusBadge status={c.status} />{c.status === 'Sent' ? `Sent ${fmtDateTime(c.sent_at)}` : c.status === 'Scheduled' ? `Sends ${fmtDateTime(c.scheduled_at)}` : `Created ${fmtDateTime(c.created_at)}`}</span>}
        actions={<>
          {c.status !== 'Sent' && <Button icon={<Pencil size={14} />} onClick={() => navigate(`/comm/campaigns/${c.id}/edit`)}>Edit</Button>}
          {c.status === 'Scheduled' && <Button icon={<Undo2 size={14} />} onClick={() => void actions.cancelSchedule(c)}>Cancel schedule</Button>}
          {c.status !== 'Sent' && <Button variant="primary" icon={<Send size={14} />} onClick={() => void actions.sendNow(c)} disabled={!c.recipient_list_id}>Send now</Button>}
          <Menu items={actions.items(c, { detail: true, afterDelete: () => navigate('/comm/campaigns') })} />
        </>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label={c.status === 'Sent' ? 'Delivered' : 'Will receive'} value={c.status === 'Sent' ? fmtNumber(c.sent_count) : audience ? fmtNumber(audience.send.length) : '—'} icon={<Send size={17} />} tone="green" />
        <StatCard label="Suppressed" value={c.status === 'Sent' ? fmtNumber(c.suppressed_count) : audience ? fmtNumber(audience.suppressedCount) : '—'} icon={<MailX size={17} />} tone="amber" hint="Skipped: unsubscribed / bounced" />
        <StatCard label="Recipient list" value={<span className="text-[15px] truncate block">{list?.name ?? (c.recipient_list_id ? 'Deleted list' : 'None')}</span>} icon={<Users size={17} />} tone="blue" hint={list ? describeFilters(list.filters ?? {}) : undefined} onClick={() => navigate('/comm/lists')} />
        <StatCard label={c.status === 'Scheduled' ? 'Scheduled for' : c.status === 'Sent' ? 'Sent' : 'Status'} value={<span className="text-[15px]">{c.status === 'Draft' ? 'Draft' : fmtDateTime(campaignDate(c))}</span>} icon={<CalendarClock size={17} />} tone="purple" />
      </div>
      {!c.recipient_list_id && c.status !== 'Sent' && <div className="mb-4"><ErrorBanner message="This campaign has no recipient list. Edit it and choose one before sending." /></div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Content">
          <EmailPreview subject={c.subject} body={c.body} account={sampleAccount} settings={settings} agent={me?.name} placeholder="Sample recipient" />
        </Panel>
        <Panel title={c.status === 'Sent' ? `Recipients (${rows.length})` : 'Recipients'} bodyClassName="p-0">
          {c.status !== 'Sent' ? (
            <EmptyState icon={<Users size={22} />} title="Not sent yet" message={audience ? `${audience.send.length} recipient${audience.send.length === 1 ? '' : 's'} currently match “${list?.name}”. The list is re-evaluated at send time.` : 'Choose a recipient list to see who will receive it.'} />
          ) : (
            <DataTable
              columns={cols}
              rows={rows}
              loading={messages.loading}
              dense
              pageSize={15}
              empty={<EmptyState icon={<Mail size={22} />} title="No delivery records found" message={`No Email messages matching this campaign were found in client histories${c.sent_count ? ` (${c.sent_count} were reported sent — sample campaigns only store summary counts)` : ''}.`} />}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
