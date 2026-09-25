import { FileCheck2, FileText, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountPicker } from '@/components/pickers';
import { Badge, Button, Checkbox, ErrorBanner, Field, Input, Modal, Panel, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtBytes, fmtDate, fmtDateTime, today } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import type { Policy } from '@/lib/types';
import { saveAppConfig, useAppConfig, type AcordFileRef } from '@/modules/admin/config';
import { useCertificateSettings } from '@/modules/admin/integration';
import { openDocumentFile } from '@/modules/documents/shared';
import { acordOf, useMySettings } from '@/modules/usersettings/data';
import { AcordPdfError, acord25Values, certSection, fillAcordPdf, inspectAcordPdf, type CertFlags } from './acord-pdf';

/* Licensed ACORD PDFs (uploaded by the agency) and the ACORD 25 certificate generator that fills them. */

const MAX_FORM_BYTES = 1_400_000;

export function useAcordFile(code: string) {
  const { value, loading } = useAppConfig('acord_files');
  return { file: value.forms[code] ?? null, all: value, loading };
}

async function fileBytes(ref: AcordFileRef): Promise<ArrayBuffer> {
  const url = await db.fileUrl(ref);
  if (!url) throw new Error('The uploaded form file is missing. Upload it again in the ACORD Library.');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the form file (HTTP ${res.status}).`);
  return res.arrayBuffer();
}

/** ACORD Library panel: upload / replace / remove the agency's fillable ACORD 25. */
export function LicensedFormsPanel() {
  const { file, all } = useAcordFile('25');
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.type && f.type !== 'application/pdf') { toast('Choose a PDF file.', 'error'); return; }
    if (f.size > MAX_FORM_BYTES) { toast('Form files must be under 1.4 MB.', 'error'); return; }
    setBusy(true);
    try {
      const info = await inspectAcordPdf(await f.arrayBuffer(), '25');
      if (!info.recognized) throw new AcordPdfError('This PDF’s fields don’t match the ACORD 25 fillable form (e.g. NamedInsured_FullName_A). Upload the standard fillable ACORD 25.');
      const meta = await db.uploadFile(new File([f], f.name, { type: 'application/pdf' }));
      const ref: AcordFileRef = {
        name: f.name, storage_path: meta.storage_path, data_url: meta.data_url, size_bytes: f.size, field_count: info.fields.length,
        edition: info.edition, uploaded_at: new Date().toISOString(), uploaded_by: me?.name ?? null,
      };
      const old = file;
      await saveAppConfig('acord_files', { forms: { ...all.forms, '25': ref } });
      if (old?.storage_path) await db.removeFiles([old]).catch(() => {});
      toast(`ACORD 25 uploaded: ${info.fields.length} fillable fields found`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!file || !(await confirm({ title: 'Remove the ACORD 25 form file?', message: 'Certificates already generated stay in Documents. New ACORD 25s will fall back to the data sheet until a form is uploaded again.', confirmLabel: 'Remove', danger: true }))) return;
    const forms = { ...all.forms };
    delete forms['25'];
    await saveAppConfig('acord_files', { forms });
    if (file.storage_path) await db.removeFiles([file]).catch(() => {});
    toast('Form file removed');
  };

  return (
    <Panel title="Your licensed ACORD forms" className="mb-4" bodyClassName="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0 text-[13px] font-bold">25</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink-900 flex items-center gap-2">
            ACORD 25 — Certificate of Liability Insurance
            {file ? <Badge tone="green">Fillable PDF ready</Badge> : <Badge>Not uploaded</Badge>}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {file
              ? <>{file.name} · {fmtBytes(file.size_bytes)} · {file.field_count} fields{file.edition ? ` · ${file.edition}` : ''} · uploaded {fmtDateTime(file.uploaded_at)}{file.uploaded_by ? ` by ${file.uploaded_by}` : ''}</>
              : <>Upload your agency’s fillable ACORD 25 to generate filled certificates as PDF. Until then, ACORD 25 produces a data sheet.</>}
          </div>
        </div>
        <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        <Button icon={<Upload size={14} />} loading={busy} onClick={() => input.current?.click()}>{file ? 'Replace' : 'Upload PDF'}</Button>
        {file && <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove()}>Remove</Button>}
      </div>
      <p className="text-[11px] text-ink-400 mt-3">
        ACORD forms are copyrighted by ACORD. Upload only forms your agency is licensed to use; the file is stored with your agency’s data and is never bundled with the app.
        Password-protected or flattened copies can’t be filled.
      </p>
    </Panel>
  );
}

// ── Certificate generator ──

const inForce = (p: Policy) => p.status === 'Active' && p.effective_date <= today() && p.expiration_date >= today();
const SECTION_LABEL = { gl: 'General liability', auto: 'Automobile liability', umbrella: 'Umbrella / excess', wc: 'Workers comp', other: 'Other' } as const;

export function Acord25PdfModal({ file, onClose, onDataSheet }: { file: AcordFileRef; onClose: () => void; onDataSheet: () => void }) {
  const { toast } = useFeedback();
  const { settings, carriers, me } = useAppData();
  const mine = useMySettings().row;
  const cert = useCertificateSettings();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [flags, setFlags] = useState<Record<string, CertFlags>>({});
  const [holder, setHolder] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rep, setRep] = useState('');
  const [revision, setRevision] = useState('');
  const [flatten, setFlatten] = useState(true);
  const [openAfter, setOpenAfter] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const policies = useTable('policies', accountId ? { eq: { account_id: accountId }, order: { column: 'effective_date', ascending: false } } : null);
  const list = useMemo(() => (showAll ? policies.data : policies.data.filter(inForce)), [policies.data, showAll]);

  // Defaults from Settings → Certificate Settings and the user's signature.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !cert.loaded) return;
    prefilled.current = true;
    setHolder([cert.config.holder_name, cert.config.holder_address].map((s) => s.trim()).filter(Boolean).join('\n'));
    setRemarks([cert.config.remarks, cert.config.include_ai_wording ? cert.config.ai_wording : ''].map((s) => s.trim()).filter(Boolean).join('\n\n'));
    setRep(cert.config.authorized_rep || acordOf(mine).signature_text || me?.name || '');
  }, [cert.loaded, cert.config, mine, me]);

  // Pick one in-force policy per certificate row by default.
  useEffect(() => {
    const seen = new Set<string>();
    setPicked(policies.data.filter(inForce).filter((p) => { const s = certSection(p); if (seen.has(s)) return false; seen.add(s); return true; }).map((p) => p.id));
  }, [policies.data]);

  const setFlag = (id: string, k: keyof CertFlags, on: boolean) => setFlags((f) => ({ ...f, [id]: { ...(f[id] ?? { additionalInsured: false, waiverOfSubrogation: false }), [k]: on } }));

  const submit = async () => {
    setError(null);
    if (!accountId) return setError('Choose the named insured.');
    const chosen = policies.data.filter((p) => picked.includes(p.id));
    if (!chosen.length) return setError('Select at least one policy to show on the certificate.');
    const dead = chosen.filter((p) => !inForce(p));
    if (dead.length) return setError(`${dead.map((p) => p.policy_number).join(', ')} ${dead.length > 1 ? 'are' : 'is'} not in force today; a certificate can only evidence current coverage.`);
    if (!holder.trim()) return setError('Enter the certificate holder.');
    if (!rep.trim()) return setError('Enter the authorized representative.');
    setBusy(true);
    const win = openAfter ? window.open('', '_blank') : null;
    try {
      const account = await db.get('accounts', accountId);
      if (!account) throw new Error('Account not found');
      const prior = (await db.list('documents', { eq: { account_id: account.id } })).filter((d) => d.name.startsWith('ACORD 25 Certificate')).length;
      const certificateNumber = `${today().replace(/-/g, '')}-${String(prior + 1).padStart(3, '0')}`;
      const { values, notes: n } = acord25Values({
        account, policies: chosen, carriers, agency: settings,
        producerContact: { name: mine ? `${mine.first_name ?? ''} ${mine.last_name ?? ''}`.trim() || me?.name || '' : me?.name ?? '', phone: mine?.phone ?? null, email: mine?.email ?? me?.email ?? null },
        holder, remarks, authorizedRep: rep.trim(), certificateNumber, revision: revision.trim(), flags, issueDate: today(),
      });
      setNotes(n);
      const { bytes } = await fillAcordPdf(await fileBytes(file), values, { flatten });
      const holderName = holder.split(/\r?\n/)[0].trim();
      const name = `ACORD 25 Certificate - ${accountName(account)} - ${holderName} - ${certificateNumber}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
      const meta = await db.uploadFile(new File([bytes], name, { type: 'application/pdf' }));
      const doc = await db.insert('documents', {
        ...meta, name, category: 'Proof of Insurance', account_id: account.id, policy_id: chosen[0].id,
        esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
      });
      await logActivity({ account_id: account.id, policy_id: chosen[0].id, assigned_to: me?.name ?? null, subject: `Issued certificate of liability insurance to ${holderName}`, description: `Certificate ${certificateNumber}: ${chosen.map((p) => `${p.line_of_business} ${p.policy_number}`).join(', ')}` }).catch(() => {});
      toast(`Certificate ${certificateNumber} saved to documents`);
      if (win) await openDocumentFile(doc, false, win).catch((e: Error) => { win.close(); toast(e.message, 'error'); });
      if (!n.length) onClose();
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Fill ACORD 25" subtitle="Certificate of Liability Insurance · your licensed PDF" size="lg" onClose={onClose} footer={<>
      <button type="button" className="mr-auto text-[13px] text-brand-700 hover:underline" onClick={onDataSheet}>Generate a data sheet instead</button>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
      <Button variant="primary" icon={<FileCheck2 size={14} />} loading={busy} onClick={() => void submit()}>Generate certificate</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {notes.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 text-[12.5px] px-3 py-2">
            <div className="font-semibold mb-0.5">Certificate generated. Please review:</div>
            <ul className="list-disc pl-5">{notes.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        <Field label="Named insured" required>
          <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setFlags({}); setError(null); setNotes([]); }} />
        </Field>
        {accountId && (
          <Field label="Policies on the certificate" required hint="One policy per row of the form (GL, auto, umbrella, workers comp, other). ADDL INSD / SUBR WVD mark additional insured and waiver of subrogation.">
            <div className="border border-ink-200 rounded divide-y divide-ink-100 max-h-60 overflow-y-auto">
              {policies.loading && !policies.data.length && <div className="px-3 py-2 text-[12px] text-ink-400">Loading policies…</div>}
              {!policies.loading && !list.length && <div className="px-3 py-2 text-[12px] text-ink-500">No policies in force on this account.</div>}
              {list.map((p) => {
                const on = picked.includes(p.id);
                const f = flags[p.id] ?? { additionalInsured: false, waiverOfSubrogation: false };
                return (
                  <div key={p.id} className={cx('flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]', !inForce(p) && 'opacity-60')}>
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#b91c1c]" checked={on} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} />
                      <span className="truncate"><b>{p.line_of_business}</b> · {p.policy_number} · {p.carrier}</span>
                      <span className="text-[11px] text-ink-400 whitespace-nowrap">{SECTION_LABEL[certSection(p)]} · {fmtDate(p.effective_date)}–{fmtDate(p.expiration_date)}{!inForce(p) ? ` · ${p.status}` : ''}</span>
                    </label>
                    {on && <>
                      <label className="flex items-center gap-1 text-[11.5px] text-ink-700"><input type="checkbox" className="w-3.5 h-3.5 accent-[#b91c1c]" checked={f.additionalInsured} onChange={(e) => setFlag(p.id, 'additionalInsured', e.target.checked)} /> ADDL INSD</label>
                      <label className="flex items-center gap-1 text-[11.5px] text-ink-700"><input type="checkbox" className="w-3.5 h-3.5 accent-[#b91c1c]" checked={f.waiverOfSubrogation} onChange={(e) => setFlag(p.id, 'waiverOfSubrogation', e.target.checked)} /> SUBR WVD</label>
                    </>}
                  </div>
                );
              })}
            </div>
            {policies.data.length > list.length && <div className="mt-1"><Checkbox label="Show policies not in force" checked={showAll} onChange={setShowAll} /></div>}
          </Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Certificate holder" required hint='Name, street, then "City, ST ZIP" on the last line'>
            <Textarea rows={4} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={'Name\nStreet address\nCity, ST ZIP'} />
          </Field>
          <Field label="Description of operations / locations / vehicles">
            <Textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <Field label="Authorized representative" required><Input value={rep} onChange={(e) => setRep(e.target.value)} maxLength={60} /></Field>
          <Field label="Revision number" hint="Leave blank for a first issue"><Input value={revision} onChange={(e) => setRevision(e.target.value)} maxLength={10} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Checkbox label="Lock fields (flatten) so the certificate can't be edited" checked={flatten} onChange={setFlatten} />
          <Checkbox label="Open after generating" checked={openAfter} onChange={setOpenAfter} />
        </div>
        <div className="text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2 flex gap-2">
          <FileText size={14} className="shrink-0 mt-0.5" />
          Fills <b>{file.name}</b> with the agency, insured, insurers (with NAIC numbers), policy numbers, dates and limits on file. Saved as a PDF under Proof of Insurance in the account’s documents.
        </div>
      </div>
    </Modal>
  );
}
