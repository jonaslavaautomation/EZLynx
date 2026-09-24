import { Copy, PenLine, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Badge, Button, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, PageHeader, Panel, SearchInput, Select, Textarea, useFeedback, type Column,
} from '@/components/ui';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { ESignTemplate } from '@/lib/types';
import { DOC_CATEGORIES } from '@/modules/documents/shared';
import { COMM_CRUMB, useSubmit } from './parts';

export function ESignTemplatesPage() {
  const { toast, confirm } = useFeedback();
  const all = useTable('esign_templates', { order: { column: 'name' } });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ESignTemplate | 'new' | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? all.data.filter((x) => `${x.name} ${x.description ?? ''} ${x.category}`.toLowerCase().includes(t)) : all.data;
  }, [all.data, q]);

  const duplicate = async (t: ESignTemplate) => {
    try { await db.insert('esign_templates', { name: `${t.name} (copy)`, description: t.description, category: t.category, message: t.message }); toast('Template duplicated'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (t: ESignTemplate) => {
    const ok = await confirm({ title: 'Delete eSignature template?', message: `“${t.name}” will no longer be offered when sending documents for signature.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('esign_templates', t.id); toast('Template deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<ESignTemplate>[] = [
    {
      key: 'name', header: 'Template', sortValue: (t) => t.name.toLowerCase(), render: (t) => (
        <div className="min-w-0"><div className="font-semibold text-ink-900">{t.name}</div>{t.description && <div className="text-xs text-ink-400 truncate max-w-[300px]">{t.description}</div>}</div>
      ),
    },
    { key: 'cat', header: 'Document category', sortValue: (t) => t.category, render: (t) => <Badge tone="blue">{t.category}</Badge> },
    { key: 'msg', header: 'Message to signer', className: 'hidden md:table-cell', render: (t) => <span className="text-ink-500 text-xs line-clamp-2 max-w-[380px] block">{t.message || '—'}</span> },
    { key: 'created', header: 'Created', className: 'hidden lg:table-cell', sortValue: (t) => t.created_at, render: (t) => fmtDate(t.created_at) },
    {
      key: 'menu', header: '', align: 'right', render: (t) => (
        <Menu items={[
          { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(t) },
          { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(t) },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(t) },
        ]} />
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="eSignature Templates"
        icon={<PenLine size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle={<>Reusable signature request settings. Pick one under <a className="text-brand-600 hover:underline" href={href('/documents')}>Documents</a> → Send for eSignature.</>}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>New template</Button>}
      />
      <ErrorBanner message={all.error} />
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100"><SearchInput value={q} onChange={setQ} placeholder="Search templates…" className="max-w-sm" /></div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={all.loading}
          onRowClick={(t) => setEditing(t)}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<PenLine size={22} />} title={q ? 'No matching templates' : 'No eSignature templates yet'} action={!q && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing('new')}>New template</Button>} />}
        />
      </Panel>
      {editing && <ESignTemplateModal template={editing === 'new' ? null : editing} others={all.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ESignTemplateModal({ template, others, onClose }: { template: ESignTemplate | null; others: ESignTemplate[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [category, setCategory] = useState(template?.category ?? 'Application');
  const [message, setMessage] = useState(template?.message ?? 'Please review and sign “{document}”. Let us know if you have any questions.');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();

  const save = () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = 'Name is required';
    else if (others.some((o) => o.id !== template?.id && o.name.trim().toLowerCase() === n.toLowerCase())) e.name = 'A template with this name already exists';
    if (!message.trim()) e.message = 'A default message to the signer is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    const values = { name: n, description: description.trim() || null, category, message: message.trim() };
    void submit(async () => {
      if (template) await db.update('esign_templates', template.id, values);
      else await db.insert('esign_templates', values);
      toast(template ? 'Template updated' : 'Template created');
      onClose();
    });
  };

  const categories = DOC_CATEGORIES.includes(category) ? DOC_CATEGORIES : [category, ...DOC_CATEGORIES];
  return (
    <Modal title={template ? 'Edit eSignature template' : 'New eSignature template'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>{template ? 'Save changes' : 'Create template'}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Template name" required error={errors.name}><Input value={name} autoFocus onChange={(e) => { setName(e.target.value); setErrors({}); }} placeholder="e.g. Auto application" /></Field>
          <Field label="Default document category"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={categories} /></Field>
        </div>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use this template" /></Field>
        <Field label="Default message to signer" required error={errors.message} hint="{document} is replaced with the document name when sending.">
          <Textarea value={message} onChange={(e) => { setMessage(e.target.value); setErrors({}); }} rows={5} />
        </Field>
      </div>
    </Modal>
  );
}
