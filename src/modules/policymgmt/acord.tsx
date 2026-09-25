import { ExternalLink, FileText, Library } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, IconButton, Modal, PageHeader, Panel, SearchInput, Select, Textarea, useFeedback, type Column } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtBytes, fmtDateTime } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { DocumentRow } from '@/lib/types';
import { openDocumentFile } from '@/modules/documents/shared';
import { acordUserContext, useMySettings } from '@/modules/usersettings/data';
import { useCertificateSettings, useFormTemplates } from '@/modules/admin/integration';
import { fieldLabel } from '@/modules/admin/templates';
import { ACORD_FORMS, acordDocTitle, buildAcordHtml, type AcordForm } from './acord-html';
import { Acord25PdfModal, LicensedFormsPanel, useAcordFile } from './acord25';

export function AcordPage() {
  const { toast } = useFeedback();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<AcordForm | null>(null);
  // With the agency's fillable ACORD 25 uploaded, ACORD 25 fills the real PDF; the data sheet stays available.
  const acord25 = useAcordFile('25').file;
  const [dataSheet, setDataSheet] = useState(false);
  const docs = useTable('documents', { order: { column: 'created_at', ascending: false } });
  const accounts = useTable('accounts');
  const am = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const recent = useMemo(() => docs.data.filter((d) => d.name.toUpperCase().startsWith('ACORD')).slice(0, 50), [docs.data]);
  const close = () => { setForm(null); setDataSheet(false); };

  const forms = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ACORD_FORMS.filter((f) => !t || `acord ${f.code} ${f.title} ${f.purpose} ${f.lines.join(' ')}`.toLowerCase().includes(t));
  }, [q]);

  const open = async (d: DocumentRow) => {
    const win = window.open('', '_blank');
    try {
      const ok = await openDocumentFile(d, false, win);
      if (!ok) toast('This document has no file attached', 'error');
    } catch (e) {
      win?.close();
      toast((e as Error).message, 'error');
    }
  };

  const columns: Column<DocumentRow>[] = [
    { key: 'name', header: 'Document', sortValue: (d) => d.name, render: (d) => <button type="button" onClick={(e) => { e.stopPropagation(); void open(d); }} className="font-semibold text-brand-600 hover:underline bg-transparent text-left">{d.name}</button> },
    { key: 'account', header: 'Account', sortValue: (d) => accountName(am.get(d.account_id ?? '')), render: (d) => (d.account_id && am.get(d.account_id) ? <a href={href(`/accounts/${d.account_id}`)} className="hover:text-brand-600 hover:underline whitespace-nowrap">{accountName(am.get(d.account_id))}</a> : '—') },
    { key: 'category', header: 'Category', sortValue: (d) => d.category, render: (d) => <Badge>{d.category}</Badge> },
    { key: 'size', header: 'Size', align: 'right', sortValue: (d) => d.size_bytes, render: (d) => <span className="whitespace-nowrap">{fmtBytes(d.size_bytes)}</span> },
    { key: 'created', header: 'Generated', sortValue: (d) => d.created_at, render: (d) => <span className="whitespace-nowrap">{fmtDateTime(d.created_at)}</span> },
    { key: 'open', header: '', align: 'right', render: (d) => <IconButton label="Open" onClick={(e) => { e.stopPropagation(); void open(d); }}><ExternalLink size={14} /></IconButton> },
  ];

  return (
    <div>
      <PageHeader title="ACORD Library" subtitle="Pre-fill ACORD form data from the account and policy on file" icon={<Library size={20} />} actions={<SearchInput value={q} onChange={setQ} placeholder="Search forms…" className="w-full sm:w-64" />} />
      <LicensedFormsPanel />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        {forms.map((f) => (
          <div key={f.code} className="bg-white border border-[#e3e3e3] rounded shadow-card p-4 flex flex-col min-w-0">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0 text-[13px] font-bold">{f.code}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink-900">ACORD {f.code} — {f.title}</div>
                <div className="text-xs text-ink-500 mt-0.5">{f.purpose}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {f.lines.slice(0, 5).map((l) => <Badge key={l}>{l}</Badge>)}
              {f.lines.length > 5 && <Badge>+{f.lines.length - 5} more</Badge>}
            </div>
            <div className="mt-auto pt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-400">{f.category}</span>
              <Button size="sm" variant="primary" icon={<FileText size={13} />} onClick={() => setForm(f)}>Fill form</Button>
            </div>
          </div>
        ))}
        {!forms.length && <div className="sm:col-span-2 xl:col-span-3"><EmptyState title="No forms match" message="Try a form number (e.g. 25) or a line of business." /></div>}
      </div>
      <Panel title="Recently generated" bodyClassName="p-3">
        <ErrorBanner message={docs.error} />
        <DataTable columns={columns} rows={recent} loading={docs.loading} dense pageSize={10} initialSort={{ key: 'created', dir: 'desc' }}
          empty={<EmptyState icon={<FileText size={22} />} title="No ACORD data sheets yet" message="Choose a form above and fill it from an account to create one. It is saved to the account’s documents." />} />
      </Panel>
      {form && form.code === '25' && acord25 && !dataSheet
        ? <Acord25PdfModal file={acord25} onClose={close} onDataSheet={() => setDataSheet(true)} />
        : form && <FillModal form={form} onClose={close} />}
    </div>
  );
}

function FillModal({ form, onClose }: { form: AcordForm; onClose: () => void }) {
  const { toast } = useFeedback();
  const { settings, carriers, me } = useAppData();
  const mine = useMySettings().row;
  const [accountId, setAccountId] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [holder, setHolder] = useState('');
  const [remarks, setRemarks] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [openAfter, setOpenAfter] = useState(true);
  // Settings → Certificate Settings pre-fill the holder and remarks; a chosen form template overrides them.
  const cert = useCertificateSettings();
  const templates = useFormTemplates(`ACORD ${form.code}`);
  const template = templates.find((t) => t.id === templateId) ?? null;
  const certDefaults = useMemo(() => ({
    holder: [cert.config.holder_name, cert.config.holder_address].map((s) => s.trim()).filter(Boolean).join('\n'),
    remarks: [cert.config.remarks, cert.config.include_ai_wording ? cert.config.ai_wording : ''].map((s) => s.trim()).filter(Boolean).join('\n\n'),
  }), [cert.config]);
  const prefilled = useRef(false);
  useEffect(() => {
    if (!form.certificate || prefilled.current || !cert.loaded) return;
    prefilled.current = true;
    setHolder((h) => h || certDefaults.holder);
    setRemarks((r) => r || certDefaults.remarks);
  }, [form.certificate, cert.loaded, certDefaults]);
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) { setHolder(certDefaults.holder); setRemarks(certDefaults.remarks); return; }
    if (t.fields.certificate_holder) setHolder(t.fields.certificate_holder);
    if (t.fields.remarks) setRemarks(t.fields.remarks);
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const policies = useTable('policies', accountId ? { eq: { account_id: accountId }, order: { column: 'effective_date', ascending: false } } : null);
  const applicable = policies.data.filter((p) => form.lines.includes(p.line_of_business));
  const list = showAll ? policies.data : applicable;
  const needsPolicy = !!form.certificate;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!accountId) return setError('Choose the applicant / insured account.');
    if (needsPolicy && !policyId) return setError(`ACORD ${form.code} is evidence of existing coverage — choose the policy.`);
    if (form.certificate && !holder.trim()) return setError(form.code === '27' ? 'Enter the additional interest / mortgagee.' : 'Enter the certificate holder.');
    setBusy(true);
    const win = openAfter ? window.open('', '_blank') : null;
    try {
      const [account, policy] = await Promise.all([db.get('accounts', accountId), policyId ? db.get('policies', policyId) : Promise.resolve(null)]);
      if (!account) throw new Error('Account not found');
      if (policyId && !policy) throw new Error('Policy not found');
      const wantsAuto = form.sections.includes('auto');
      const wantsProp = form.sections.includes('property');
      const [drivers, vehicles, properties] = await Promise.all([
        wantsAuto ? db.list('drivers', { eq: { account_id: account.id } }) : Promise.resolve([]),
        wantsAuto ? db.list('vehicles', { eq: { account_id: account.id } }) : Promise.resolve([]),
        wantsProp ? db.list('properties', { eq: { account_id: account.id } }) : Promise.resolve([]),
      ]);
      const html = buildAcordHtml({
        form, account, policy, drivers, vehicles, properties, settings, holder, preparedBy: me?.name ?? null,
        remarks, authorizedRep: template?.fields.authorized_representative || cert.config.authorized_rep || null,
        templateFields: template ? Object.entries(template.fields).filter(([k, val]) => val && !['certificate_holder', 'remarks', 'authorized_representative'].includes(k)).map(([k, val]) => [fieldLabel(k), val] as [string, string]) : undefined,
        carrier: policy ? carriers.find((c) => c.name === policy.carrier) : undefined,
        ...acordUserContext(mine, me),
      });
      const name = `ACORD ${form.code} data - ${accountName(account)}${policy ? ` - ${policy.policy_number}` : ''}.html`;
      const meta = await db.uploadFile(new File([html], name.replace(/[\\/:*?"<>|]/g, '_'), { type: 'text/html' }));
      const doc = await db.insert('documents', {
        ...meta, name, category: form.category, account_id: account.id, policy_id: policy?.id ?? null,
        esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
      });
      await logActivity({ account_id: account.id, policy_id: policy?.id ?? null, assigned_to: me?.name ?? null, subject: `Generated ${acordDocTitle(form)}`, description: name }).catch(() => {});
      toast(`ACORD ${form.code} data sheet saved to documents`);
      onClose();
      if (win) await openDocumentFile(doc, false, win).catch((e: Error) => { win.close(); toast(e.message, 'error'); });
    } catch (e) {
      win?.close();
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Fill ACORD ${form.code}`} subtitle={form.title} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" icon={<FileText size={14} />} loading={busy} onClick={() => void submit()}>Generate data sheet</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {templates.length > 0 && (
          <Field label="Template" hint={template ? `Pre-fills ${Object.keys(template.fields).map(fieldLabel).join(', ').toLowerCase()}` : 'Optional — saved defaults from Settings → Manage Form Templates'}>
            <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)} placeholder="No template" options={templates.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        )}
        <Field label={form.certificate ? 'Named insured' : 'Applicant'} required>
          <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setPolicyId(''); setError(null); }} />
        </Field>
        <Field label="Policy" required={needsPolicy} hint={accountId && !policies.loading ? (applicable.length ? `${applicable.length} ${form.lines.length > 3 ? 'applicable' : form.lines.join(' / ')} polic${applicable.length === 1 ? 'y' : 'ies'}` : `No ${form.lines.length > 3 ? 'applicable' : form.lines.join(' / ')} policies on this account`) : undefined}>
          <Select value={policyId} disabled={!accountId} onChange={(e) => setPolicyId(e.target.value)}
            placeholder={!accountId ? 'Choose an account first' : needsPolicy ? 'Select a policy' : 'No policy (new business application)'}
            options={list.map((p) => ({ value: p.id, label: `${p.policy_number} · ${p.line_of_business} · ${p.carrier} · ${p.status}` }))} />
        </Field>
        {accountId && policies.data.length > applicable.length && <Checkbox label="Show all of this account’s policies" checked={showAll} onChange={(v) => { setShowAll(v); if (!v && policyId && !applicable.some((p) => p.id === policyId)) setPolicyId(''); }} />}
        {form.certificate && (
          <Field label={form.code === '27' ? 'Additional interest / mortgagee' : 'Certificate holder'} required>
            <Textarea rows={3} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={'Name\nStreet address\nCity, State ZIP'} />
          </Field>
        )}
        {form.certificate && (
          <Field label={form.code === '27' ? 'Remarks' : 'Description of operations / remarks'} hint="Defaults come from Settings → Certificate Settings.">
            <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        )}
        <div className="text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2">
          Produces a printable data summary pre-filled from the account{form.sections.includes('auto') ? ', drivers, vehicles' : ''}{form.sections.includes('property') ? ', properties' : ''}, policy, coverages and agency settings, for transfer to the official ACORD form. Saved as <b>{form.category}</b> in the account’s documents.
        </div>
        <Checkbox label="Open after generating" checked={openAfter} onChange={setOpenAfter} />
      </div>
    </Modal>
  );
}
