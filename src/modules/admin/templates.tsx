import { FileSpreadsheet, FileStack, FileText, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Menu, Modal, Panel, Pills, Select, Textarea, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtDate, fmtMoney, fmtPhone, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import type { Account, AgencySettings, FormTemplate, Policy, ProposalTemplate } from '@/lib/types';
import { mergeFields } from '@/modules/comm/shared';
import { openDocumentFile } from '@/modules/documents/shared';
import { ACORD_FORMS } from '@/modules/policymgmt/acord-html';
import { esc } from '@/modules/policymgmt/shared';
import { AdminHeader } from './shared';

// ── Manage Form Templates ──

export const FORM_TYPES = ACORD_FORMS.map((f) => `ACORD ${f.code}`);
export const FIELD_SUGGESTIONS: { key: string; label: string }[] = [
  { key: 'certificate_holder', label: 'Certificate holder / additional interest' },
  { key: 'remarks', label: 'Remarks / description of operations' },
  { key: 'producer_contact', label: 'Producer contact name' },
  { key: 'producer_phone', label: 'Producer phone' },
  { key: 'producer_email', label: 'Producer email' },
  { key: 'authorized_representative', label: 'Authorized representative' },
];
export const fieldLabel = (key: string) => FIELD_SUGGESTIONS.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ');

export function FormTemplatesPage() {
  const { toast, confirm } = useFeedback();
  const rows = useTable('form_templates', { order: { column: 'name' } });
  const [type, setType] = useState('all');
  const [editing, setEditing] = useState<FormTemplate | 'new' | null>(null);
  const shown = rows.data.filter((t) => type === 'all' || t.form_type === type);

  const remove = async (t: FormTemplate) => {
    const ok = await confirm({ title: `Delete “${t.name}”?`, message: 'The template is removed from the ACORD fill form. Documents already generated are not affected.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('form_templates', t.id); toast('Template deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<FormTemplate>[] = [
    { key: 'name', header: 'Template', sortValue: (t) => t.name.toLowerCase(), render: (t) => <span className="font-semibold text-ink-900">{t.name}</span> },
    { key: 'type', header: 'Form', sortValue: (t) => t.form_type, render: (t) => <Badge tone="blue">{t.form_type}</Badge> },
    { key: 'fields', header: 'Default fields', render: (t) => <div className="flex flex-wrap gap-1">{Object.keys(t.fields ?? {}).map((k) => <Badge key={k}>{fieldLabel(k)}</Badge>)}{!Object.keys(t.fields ?? {}).length && <span className="text-ink-300">—</span>}</div> },
    { key: 'actions', header: '', align: 'right', render: (t) => <Menu items={[{ label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(t) }, 'divider', { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(t) }]} /> },
  ];

  const used = [...new Set(rows.data.map((t) => t.form_type))];
  return (
    <div className="max-w-5xl">
      <AdminHeader title="Manage Form Templates" subtitle="Saved default values for ACORD forms — choose a template in the ACORD Library to pre-fill" icon={<FileSpreadsheet size={20} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add template</Button>} />
      <Panel bodyClassName="p-0">
        {used.length > 1 && <div className="p-3 border-b border-ink-100"><Pills value={type} onChange={setType} options={[{ value: 'all', label: 'All', count: rows.data.length }, ...used.sort().map((u) => ({ value: u, label: u, count: rows.data.filter((t) => t.form_type === u).length }))]} /></div>}
        <ErrorBanner message={rows.error} />
        <DataTable columns={columns} rows={shown} loading={rows.loading} onRowClick={(t) => setEditing(t)} initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon={<FileSpreadsheet size={22} />} title="No form templates yet" message="Save a certificate holder and remarks you use often, e.g. a landlord’s lease requirements." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add template</Button>} />} />
      </Panel>
      {editing && <FormTemplateModal template={editing === 'new' ? null : editing} all={rows.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

type FieldRow = { k: string; v: string };

function FormTemplateModal({ template, all, onClose }: { template: FormTemplate | null; all: FormTemplate[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(template?.name ?? '');
  const [formType, setFormType] = useState(template?.form_type ?? 'ACORD 25');
  const [fields, setFields] = useState<FieldRow[]>(() => {
    const e = Object.entries(template?.fields ?? {}).map(([k, v]) => ({ k, v }));
    return e.length ? e : [{ k: 'certificate_holder', v: '' }, { k: 'remarks', v: '' }];
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setRow = (i: number, patch: Partial<FieldRow>) => setFields((f) => f.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unusedSuggestions = FIELD_SUGGESTIONS.filter((s) => !fields.some((f) => f.k === s.key));

  const save = async () => {
    if (busy) return;
    const n = name.trim();
    if (!n) return setErr('Name is required');
    if (all.some((t) => t.id !== template?.id && t.name.toLowerCase() === n.toLowerCase() && t.form_type === formType)) return setErr(`A ${formType} template with this name already exists`);
    const clean = fields.map((f) => ({ k: f.k.trim().toLowerCase().replace(/\s+/g, '_'), v: f.v.trim() })).filter((f) => f.k || f.v);
    if (clean.some((f) => !f.k)) return setErr('Every value needs a field name');
    if (clean.some((f) => !/^[a-z][a-z0-9_]*$/.test(f.k))) return setErr('Field names may use letters, numbers and underscores');
    if (new Set(clean.map((f) => f.k)).size !== clean.length) return setErr('Each field can appear only once');
    if (!clean.some((f) => f.v)) return setErr('Enter at least one default value');
    setBusy(true);
    setErr(null);
    try {
      const values = { name: n, form_type: formType, fields: Object.fromEntries(clean.filter((f) => f.v).map((f) => [f.k, f.v])) };
      if (template) await db.update('form_templates', template.id, values); else await db.insert('form_templates', values);
      toast(template ? 'Template updated' : 'Template added');
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={template ? 'Edit form template' : 'Add form template'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{template ? 'Save changes' : 'Add template'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Template name" required className="sm:col-span-2"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Form" required><Select value={formType} onChange={(e) => setFormType(e.target.value)} options={FORM_TYPES.includes(formType) ? FORM_TYPES : [formType, ...FORM_TYPES]} /></Field>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Default field values</span>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-start">
                <Input value={f.k} onChange={(e) => setRow(i, { k: e.target.value })} placeholder="field_name" list="ns-form-fields" />
                <Textarea rows={f.k === 'certificate_holder' || f.k === 'remarks' ? 3 : 1} className="min-h-[36px]" value={f.v} onChange={(e) => setRow(i, { v: e.target.value })} placeholder={fieldLabel(f.k || 'value')} />
                <IconButton label="Remove field" onClick={() => setFields((x) => x.filter((_, j) => j !== i))}><X size={14} /></IconButton>
              </div>
            ))}
          </div>
          <datalist id="ns-form-fields">{FIELD_SUGGESTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</datalist>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {unusedSuggestions.map((s) => <Button key={s.key} size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setFields((x) => [...x, { k: s.key, v: '' }])}>{s.label}</Button>)}
            <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setFields((x) => [...x, { k: '', v: '' }])}>Custom field</Button>
          </div>
          <p className="text-[11px] text-ink-400 mt-2"><b>certificate_holder</b> and <b>remarks</b> fill those boxes on the fill form; other fields print in a “Template defaults” section of the data sheet.</p>
        </div>
      </div>
    </Modal>
  );
}

// ── Proposal / SOI Templates ──

export function ProposalTemplatesPage() {
  const { toast, confirm } = useFeedback();
  const rows = useTable('proposal_templates', { order: { column: 'name' } });
  const [type, setType] = useState<'all' | 'Proposal' | 'SOI'>('all');
  const [editing, setEditing] = useState<ProposalTemplate | 'new' | null>(null);
  const [soi, setSoi] = useState(false);
  const shown = rows.data.filter((t) => type === 'all' || t.template_type === type);

  const makeDefault = async (t: ProposalTemplate) => {
    try { await setDefault(t, rows.data); toast(`“${t.name}” is now the default ${t.template_type === 'SOI' ? 'SOI' : 'proposal'} template`); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (t: ProposalTemplate) => {
    const ok = await confirm({ title: `Delete “${t.name}”?`, message: t.is_default ? 'This is the default template — proposals will use the built-in wording until another default is chosen.' : 'The template will be removed.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await db.remove('proposal_templates', t.id); toast('Template deleted'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<ProposalTemplate>[] = [
    { key: 'name', header: 'Template', sortValue: (t) => t.name.toLowerCase(), render: (t) => <div className="flex items-center gap-2"><span className="font-semibold text-ink-900">{t.name}</span>{t.is_default && <Badge tone="teal"><Star size={10} /> Default</Badge>}</div> },
    { key: 'type', header: 'Type', sortValue: (t) => t.template_type, render: (t) => <Badge tone={t.template_type === 'SOI' ? 'purple' : 'blue'}>{t.template_type === 'SOI' ? 'Summary of Insurance' : 'Proposal'}</Badge> },
    { key: 'intro', header: 'Intro', className: 'max-w-[340px]', render: (t) => <span className="text-xs text-ink-500 line-clamp-2">{t.intro || '—'}</span> },
    { key: 'incl', header: 'Includes', render: (t) => <div className="flex gap-1">{t.include_premium && <Badge>Premium</Badge>}{t.include_coverages && <Badge>Coverages</Badge>}</div> },
    {
      key: 'actions', header: '', align: 'right', render: (t) => <Menu items={[
        { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(t) },
        { label: 'Make default', icon: <Star size={14} />, disabled: t.is_default, onClick: () => void makeDefault(t) },
        'divider',
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(t) },
      ]} />,
    },
  ];

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Proposal / SOI Templates" subtitle="Wording for quote proposals and client Summaries of Insurance" icon={<FileStack size={20} />}
        actions={<>
          <Button icon={<FileText size={15} />} onClick={() => setSoi(true)}>Generate SOI</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add template</Button>
        </>} />
      <Panel bodyClassName="p-0">
        <div className="p-3 border-b border-ink-100">
          <Pills value={type} onChange={setType} options={[
            { value: 'all', label: 'All', count: rows.data.length },
            { value: 'Proposal', label: 'Proposal', count: rows.data.filter((t) => t.template_type === 'Proposal').length },
            { value: 'SOI', label: 'Summary of Insurance', count: rows.data.filter((t) => t.template_type === 'SOI').length },
          ]} />
        </div>
        <ErrorBanner message={rows.error} />
        <DataTable columns={columns} rows={shown} loading={rows.loading} onRowClick={(t) => setEditing(t)} initialSort={{ key: 'type', dir: 'asc' }}
          empty={<EmptyState icon={<FileStack size={22} />} title="No templates yet" action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add template</Button>} />} />
      </Panel>
      <p className="text-[11px] text-ink-400 mt-2">The default Proposal template supplies the intro, closing and disclaimer on a quote’s printable proposal. Merge fields: {'{first_name} {last_name} {full_name} {agency} {agent}'}.</p>
      {editing && <ProposalTemplateModal template={editing === 'new' ? null : editing} all={rows.data} onClose={() => setEditing(null)} />}
      {soi && <GenerateSoiModal templates={rows.data.filter((t) => t.template_type === 'SOI')} onClose={() => setSoi(false)} />}
    </div>
  );
}

/** Marks `t` default and clears the flag on other templates of the same type. */
async function setDefault(t: Pick<ProposalTemplate, 'id' | 'template_type'>, all: ProposalTemplate[]) {
  for (const o of all.filter((x) => x.template_type === t.template_type && x.is_default && x.id !== t.id)) await db.update('proposal_templates', o.id, { is_default: false });
  await db.update('proposal_templates', t.id, { is_default: true });
}

function ProposalTemplateModal({ template, all, onClose }: { template: ProposalTemplate | null; all: ProposalTemplate[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [v, setV] = useState({
    name: template?.name ?? '', template_type: template?.template_type ?? ('Proposal' as ProposalTemplate['template_type']),
    intro: template?.intro ?? '', closing: template?.closing ?? '', disclaimer: template?.disclaimer ?? '',
    include_coverages: template?.include_coverages ?? true, include_premium: template?.include_premium ?? true, is_default: template?.is_default ?? false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const noDefaultYet = !all.some((t) => t.template_type === v.template_type && t.is_default && t.id !== template?.id);

  const save = async () => {
    if (busy) return;
    const n = v.name.trim();
    if (!n) return setErr('Name is required');
    if (all.some((t) => t.id !== template?.id && t.name.toLowerCase() === n.toLowerCase())) return setErr('A template with this name already exists');
    if (!v.intro.trim() && !v.closing.trim() && !v.disclaimer.trim()) return setErr('Enter an intro, closing or disclaimer');
    setBusy(true);
    setErr(null);
    try {
      const values = { ...v, name: n, intro: v.intro.trim() || null, closing: v.closing.trim() || null, disclaimer: v.disclaimer.trim() || null, is_default: false };
      const saved = template ? await db.update('proposal_templates', template.id, values) : await db.insert('proposal_templates', values);
      if (v.is_default) await setDefault(saved, all);
      toast(template ? 'Template updated' : 'Template added');
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={template ? 'Edit template' : 'Add template'} size="lg" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{template ? 'Save changes' : 'Add template'}</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name" required className="sm:col-span-2"><Input autoFocus value={v.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <Field label="Type"><Select value={v.template_type} onChange={(e) => set('template_type')(e.target.value as ProposalTemplate['template_type'])} options={[{ value: 'Proposal', label: 'Proposal' }, { value: 'SOI', label: 'Summary of Insurance (SOI)' }]} /></Field>
        </div>
        <Field label="Intro" hint="Opening paragraph. Merge fields like {first_name} and {agency} are filled in."><Textarea rows={3} value={v.intro} onChange={(e) => set('intro')(e.target.value)} /></Field>
        <Field label="Closing"><Textarea rows={2} value={v.closing} onChange={(e) => set('closing')(e.target.value)} /></Field>
        <Field label="Disclaimer"><Textarea rows={2} value={v.disclaimer} onChange={(e) => set('disclaimer')(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label="Include premiums" checked={v.include_premium} onChange={set('include_premium')} />
          <Checkbox label="Include coverages" checked={v.include_coverages} onChange={set('include_coverages')} />
          <Checkbox label={`Default ${v.template_type === 'SOI' ? 'SOI' : 'proposal'} template${noDefaultYet ? ' (none set yet)' : ''}`} checked={v.is_default} onChange={set('is_default')} />
        </div>
      </div>
    </Modal>
  );
}

// ── Summary of Insurance ──

const SOI_CSS = `*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#231f1f;margin:0;background:#f7f3f3;font-size:13px}
.page{max-width:860px;margin:24px auto;background:#fff;padding:36px;border:1px solid #e8e0e0}.bar{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #dc2626;padding-bottom:12px;margin-bottom:16px}
.agency{font-size:18px;font-weight:700;color:#b91c1c}.muted{color:#7d6f6f;font-size:11.5px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;margin-top:4px}th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #efe9e9;vertical-align:top}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#7d6f6f;background:#faf8f8}
.pol{border:1px solid #efe9e9;border-radius:4px;padding:12px 14px;margin-top:10px}.right{text-align:right}.total{font-weight:700;font-size:14px;text-align:right;margin-top:12px}
.disc{margin-top:22px;border-top:1px solid #efe9e9;padding-top:10px;color:#7d6f6f;font-size:11px}.print{position:fixed;top:14px;right:14px;background:#dc2626;color:#fff;border:0;border-radius:4px;padding:8px 14px;font-weight:600;cursor:pointer}
@media(max-width:640px){.page{padding:18px;margin:0}}@media print{body{background:#fff}.page{border:0;margin:0;max-width:none;padding:0}.print{display:none}}`;

export function buildSoiHtml(o: { account: Account; policies: Policy[]; template: ProposalTemplate | null; settings: AgencySettings | null; agent: string | null }) {
  const { account: a, policies, template: t, settings: s } = o;
  const incPrem = t ? t.include_premium : true;
  const incCov = t ? t.include_coverages : true;
  const m = (x: string | null | undefined) => (x ? esc(mergeFields(x, a, s, o.agent)).replace(/\n/g, '<br>') : '');
  const city = (x: { city: string | null; state: string | null; zip: string | null }) => [x.city, [x.state, x.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const total = policies.reduce((sum, p) => sum + Number(p.premium), 0);
  const body = policies.length ? policies.map((p) => `<div class="pol">
    <table><tr><th>Line</th><th>Carrier</th><th>Policy #</th><th>Term</th>${incPrem ? '<th class="right">Premium</th>' : ''}</tr>
    <tr><td><b>${esc(p.line_of_business)}</b></td><td>${esc(p.carrier)}</td><td>${esc(p.policy_number)}</td><td>${esc(fmtDate(p.effective_date))} – ${esc(fmtDate(p.expiration_date))} (${p.term_months} mo)</td>${incPrem ? `<td class="right">${esc(fmtMoney(p.premium, true))}</td>` : ''}</tr></table>
    ${incCov ? ((p.coverages ?? []).length ? `<table><tr><th>Coverage</th><th>Limit</th><th>Deductible</th></tr>${p.coverages.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.limit)}</td><td>${esc(c.deductible || '—')}</td></tr>`).join('')}</table>` : '<p class="muted">Coverage schedule not on file — see your declarations page.</p>') : ''}
  </div>`).join('') : '<p class="muted">No active policies are on file for this account.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Summary of Insurance — ${esc(accountName(a))}</title><style>${SOI_CSS}</style></head><body>
<button class="print" onclick="window.print()">Print</button><div class="page">
<div class="bar"><div><div class="agency">${esc(s?.name || 'Insurance Agency')}</div><div class="muted">${esc([s?.address, s ? city(s) : ''].filter(Boolean).join(' · '))}${s?.phone ? ` · ${esc(fmtPhone(s.phone))}` : ''}</div></div>
<div style="text-align:right"><h1>Summary of Insurance</h1><div class="muted">Prepared ${esc(fmtDate(today()))}${o.agent ? ` by ${esc(o.agent)}` : ''}</div></div></div>
<div><b>${esc(accountName(a))}</b><div class="muted">${esc([a.address, city(a)].filter(Boolean).join(', '))}</div></div>
${t?.intro ? `<p>${m(t.intro)}</p>` : ''}
<h2>Policies in force (${policies.length})</h2>${body}
${incPrem && policies.length ? `<div class="total">Total annualized premium: ${esc(fmtMoney(total, true))}</div>` : ''}
${t?.closing ? `<p>${m(t.closing)}</p>` : ''}
<div class="disc">${t?.disclaimer ? m(t.disclaimer) : 'This summary is provided for convenience only and does not amend, extend or alter the coverage afforded by your policies.'}</div>
</div></body></html>`;
}

function GenerateSoiModal({ templates, onClose }: { templates: ProposalTemplate[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const { settings, me } = useAppData();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? '');
  const [openAfter, setOpenAfter] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const policies = useTable('policies', accountId ? { eq: { account_id: accountId, status: 'Active' } } : null);

  const generate = async () => {
    if (busy) return;
    if (!accountId) return setErr('Choose the applicant');
    setBusy(true);
    setErr(null);
    const win = openAfter ? window.open('', '_blank') : null;
    try {
      const account = await db.get('accounts', accountId);
      if (!account) throw new Error('Account not found');
      const active = (await db.list('policies', { eq: { account_id: accountId, status: 'Active' } })).sort((x, y) => x.line_of_business.localeCompare(y.line_of_business));
      const template = templates.find((t) => t.id === templateId) ?? null;
      const agent = account.producer ?? me?.name ?? null;
      const html = buildSoiHtml({ account, policies: active, template, settings, agent });
      const name = `Summary of Insurance - ${accountName(account)} - ${today()}.html`;
      const meta = await db.uploadFile(new File([html], name.replace(/[\\/:*?"<>|]/g, '_'), { type: 'text/html' }));
      const doc = await db.insert('documents', {
        ...meta, name, category: 'Correspondence', account_id: account.id, policy_id: null,
        esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
      });
      await logActivity({ account_id: account.id, assigned_to: me?.name ?? null, subject: 'Generated Summary of Insurance', description: `${active.length} active polic${active.length === 1 ? 'y' : 'ies'}${template ? ` · template “${template.name}”` : ''}` }).catch(() => {});
      toast('Summary of Insurance saved to documents');
      onClose();
      if (win) await openDocumentFile(doc, false, win).catch((e: Error) => { win.close(); toast(e.message, 'error'); });
    } catch (e) {
      win?.close();
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Generate Summary of Insurance" subtitle="A printable list of the applicant’s active policies, saved to their documents" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon={<FileText size={14} />} loading={busy} onClick={() => void generate()}>Generate SOI</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <Field label="Applicant" required hint={accountId && !policies.loading ? `${policies.data.length} active polic${policies.data.length === 1 ? 'y' : 'ies'}` : undefined}>
          <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setErr(null); }} />
        </Field>
        <Field label="Template" hint={templates.length ? undefined : 'No SOI templates yet — the built-in wording is used.'}>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="Built-in wording" options={templates.map((t) => ({ value: t.id, label: `${t.name}${t.is_default ? ' (default)' : ''}` }))} />
        </Field>
        <Checkbox label="Open after generating" checked={openAfter} onChange={setOpenAfter} />
      </div>
    </Modal>
  );
}
