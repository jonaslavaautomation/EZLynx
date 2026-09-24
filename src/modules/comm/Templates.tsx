import { Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  Button, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, PageHeader, Panel, SearchInput, Tabs, cx, useFeedback, type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { setParam, useRoute } from '@/lib/router';
import type { Account, MessageTemplate } from '@/lib/types';
import { smsInfo } from '@/modules/messages/shared';
import { COMM_CRUMB, MergeFieldBar, RefInput, RefTextarea, useSubmit } from './parts';
import { mergeFields } from './shared';

type Channel = MessageTemplate['channel'];

const SAMPLE = { id: 'sample', first_name: 'Sarah', last_name: 'Mitchell', account_type: 'Personal', business_name: null, email: 'sarah@example.com' } as unknown as Account;

function smsHint(body: string) {
  const s = smsInfo(body);
  return `${s.units}/${s.limit} characters${s.unicode ? ' (Unicode)' : ''} · ${s.segments} segment${s.segments === 1 ? '' : 's'}`;
}

export function TemplatesPage() {
  const { params } = useRoute();
  const channel: Channel = params.get('channel') === 'Email' ? 'Email' : 'SMS';
  const { toast, confirm } = useFeedback();
  const all = useTable('message_templates', { order: { column: 'name' } });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MessageTemplate | 'new' | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.data.filter((m) => m.channel === channel && (!t || `${m.name} ${m.subject ?? ''} ${m.body}`.toLowerCase().includes(t)));
  }, [all.data, channel, q]);

  const duplicate = async (m: MessageTemplate) => {
    try { await db.insert('message_templates', { channel: m.channel, name: `${m.name} (copy)`, subject: m.subject, body: m.body }); toast('Template duplicated'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (m: MessageTemplate) => {
    const ok = await confirm({ title: 'Delete template?', message: `“${m.name}” will be removed from the template pickers.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('message_templates', m.id); toast('Template deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<MessageTemplate>[] = [
    { key: 'name', header: 'Template', sortValue: (m) => m.name.toLowerCase(), render: (m) => <span className="font-semibold text-ink-900">{m.name}</span> },
    ...(channel === 'Email' ? [{ key: 'subject', header: 'Subject', className: 'hidden sm:table-cell', render: (m: MessageTemplate) => <span className="truncate block max-w-[240px]">{m.subject || '—'}</span> }] : []),
    { key: 'body', header: 'Message', className: 'hidden md:table-cell', render: (m) => <span className="text-ink-500 text-xs line-clamp-2 max-w-[420px] block">{m.body}</span> },
    ...(channel === 'SMS' ? [{ key: 'seg', header: 'Segments', align: 'right' as const, sortValue: (m: MessageTemplate) => smsInfo(m.body).segments, render: (m: MessageTemplate) => { const s = smsInfo(m.body); return <span className={cx('tabular-nums', s.segments > 1 && 'text-amber-600 font-semibold')}>{s.segments}</span>; } }] : []),
    { key: 'created', header: 'Created', className: 'hidden lg:table-cell', sortValue: (m) => m.created_at, render: (m) => fmtDate(m.created_at) },
    {
      key: 'menu', header: '', align: 'right', render: (m) => (
        <Menu items={[
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(m) },
          { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(m) },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(m) },
        ]} />
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Text Templates"
        icon={<FileText size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle="Reusable text and email messages with merge fields — available in the Messages composer and campaign builder"
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New {channel === 'SMS' ? 'text' : 'email'} template</Button>}
      />
      <Tabs<Channel>
        className="mb-3"
        value={channel}
        onChange={(v) => { setParam('channel', v); setQ(''); }}
        tabs={[
          { value: 'SMS', label: 'SMS', count: all.data.filter((m) => m.channel === 'SMS').length },
          { value: 'Email', label: 'Email', count: all.data.filter((m) => m.channel === 'Email').length },
        ]}
      />
      <ErrorBanner message={all.error} />
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100"><SearchInput value={q} onChange={setQ} placeholder="Search templates…" className="max-w-sm" /></div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={all.loading}
          onRowClick={(m) => setEditing(m)}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<FileText size={22} />} title={q ? 'No matching templates' : `No ${channel === 'SMS' ? 'text' : 'email'} templates yet`} action={!q && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New template</Button>} />}
        />
      </Panel>
      {editing && <TemplateModal channel={editing === 'new' ? channel : editing.channel} template={editing === 'new' ? null : editing} others={all.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateModal({ channel, template, others, onClose }: { channel: Channel; template: MessageTemplate | null; others: MessageTemplate[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const { settings, me } = useAppData();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = 'Name is required';
    else if (others.some((o) => o.id !== template?.id && o.channel === channel && o.name.trim().toLowerCase() === n.toLowerCase())) e.name = `A ${channel} template with this name already exists`;
    if (channel === 'Email' && !subject.trim()) e.subject = 'Subject is required for email templates';
    if (!body.trim()) e.body = 'Message is required';
    else if (channel === 'SMS' && smsInfo(body).segments > 6) e.body = 'Keep texts to 6 segments or fewer';
    setErrors(e);
    if (Object.keys(e).length) return;
    const values = { channel, name: n, subject: channel === 'Email' ? subject.trim() : null, body: body.trim() };
    void submit(async () => {
      if (template) await db.update('message_templates', template.id, values);
      else await db.insert('message_templates', values);
      toast(template ? 'Template updated' : 'Template created');
      onClose();
    });
  };

  const preview = mergeFields(body, SAMPLE, settings, me?.name);

  return (
    <Modal title={`${template ? 'Edit' : 'New'} ${channel === 'SMS' ? 'text' : 'email'} template`} size="lg" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>{template ? 'Save changes' : 'Create template'}</Button>
    </>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="space-y-3 min-w-0">
          <ErrorBanner message={error} />
          <Field label="Template name" required error={errors.name}>
            <Input value={name} autoFocus onChange={(e) => { setName(e.target.value); setErrors({}); }} placeholder="e.g. Payment reminder" />
          </Field>
          {channel === 'Email' && (
            <>
              <Field label="Subject" required error={errors.subject}>
                <RefInput ref={subjectRef} value={subject} onChange={(e) => { setSubject(e.target.value); setErrors({}); }} />
              </Field>
              <MergeFieldBar target={subjectRef} value={subject} onChange={setSubject} />
            </>
          )}
          <Field label="Message" required error={errors.body} hint={channel === 'SMS' ? smsHint(body) : `${body.length} characters`}>
            <RefTextarea ref={bodyRef} value={body} onChange={(e) => { setBody(e.target.value); setErrors({}); }} rows={channel === 'SMS' ? 5 : 10} />
          </Field>
          <MergeFieldBar target={bodyRef} value={body} onChange={setBody} />
          {channel === 'SMS' && smsInfo(body).unicode && <p className="text-[11px] text-amber-600">Contains characters outside the GSM-7 set (emoji, smart quotes, em dashes…), so each segment holds only 70 characters.</p>}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Preview (sample client)</div>
          {channel === 'SMS' ? (
            <div className="bg-ink-50 border border-ink-100 rounded p-3 min-h-[140px]">
              <div className="ml-auto max-w-[90%] w-fit rounded-2xl rounded-br-sm bg-brand-500 text-white text-[13px] px-3.5 py-2 whitespace-pre-wrap break-words">{preview || <span className="opacity-60">Your text…</span>}</div>
              <div className="text-right text-[10px] text-ink-400 mt-1">{smsHint(preview)} after merge</div>
            </div>
          ) : (
            <div className="border border-ink-100 rounded text-[13px]">
              <div className="bg-ink-50 border-b border-ink-100 px-3 py-2 text-xs font-semibold text-ink-900 truncate">{mergeFields(subject, SAMPLE, settings, me?.name) || 'No subject'}</div>
              <div className="px-3 py-3 whitespace-pre-wrap break-words text-ink-800 min-h-[120px]">{preview || <span className="text-ink-300">Your message…</span>}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
