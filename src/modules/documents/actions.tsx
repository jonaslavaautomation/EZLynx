import { Ban, CheckCircle2, Download, Eye, FileOutput, FolderInput, PenLine, RotateCw, Tag, Trash2, Type, UserCheck, UserX, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccountPicker, PolicySelect } from '@/components/pickers';
import { Button, Checkbox, ErrorBanner, Field, Input, Modal, Select, Textarea, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, getDbMode } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtBytes, fmtDate, today } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import type { DocumentRow, Policy, PolicyTransaction } from '@/lib/types';
import { priorTerm } from '@/modules/policies/shared';
import { AUTO_LINES, DOC_CATEGORIES, GEN_TEMPLATES, buildDocumentHtml, effectiveStatus, hasFile, openDocumentFile, type GenTemplate } from './shared';

type MenuItem = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'divider';
type ModalState = { kind: 'rename' | 'category' | 'move' | 'esign'; doc: DocumentRow } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Row actions (menu items + the modals they open) shared by every document table. */
export function useDocumentActions() {
  const { toast, confirm } = useFeedback();
  const { me } = useAppData();
  const [modal, setModal] = useState<ModalState>(null);
  const close = () => setModal(null);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try { await fn(); toast(success); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const log = (doc: DocumentRow, subject: string, description: string | null = null, type: 'Note' | 'Email' = 'Note') =>
    logActivity({ account_id: doc.account_id, policy_id: doc.policy_id, subject, description, type, assigned_to: me?.name ?? null }).catch(() => {});

  const view = async (doc: DocumentRow, download = false) => {
    if (!hasFile(doc)) { toast('No file attached (demo record)', 'info'); return; }
    const win = download ? null : window.open('', '_blank');
    try {
      const ok = await openDocumentFile(doc, download, win);
      if (!ok) toast('No file attached (demo record)', 'info');
    } catch (e) {
      win?.close();
      toast((e as Error).message, 'error');
    }
  };

  const resend = async (doc: DocumentRow) => {
    if (!doc.esign_signer_email) { setModal({ kind: 'esign', doc }); return; }
    await run(async () => {
      await db.update('documents', doc.id, { esign_status: 'Pending', esign_sent_at: new Date().toISOString(), esign_completed_at: null });
      await log(doc, `eSignature request resent: ${doc.name}`, `Resent to ${doc.esign_signer_email}`, 'Email');
    }, `Signature request resent to ${doc.esign_signer_email}`);
  };

  const voidRequest = async (doc: DocumentRow) => {
    const ok = await confirm({ title: 'Void signature request?', message: `The signer will no longer be able to sign “${doc.name}”.`, confirmLabel: 'Void request', danger: true });
    if (!ok) return;
    await run(async () => {
      await db.update('documents', doc.id, { esign_status: 'Canceled' });
      await log(doc, `eSignature request voided: ${doc.name}`);
    }, 'Signature request voided');
  };

  const complete = (doc: DocumentRow, how: 'simulated' | 'manual') => run(async () => {
    await db.update('documents', doc.id, { esign_status: 'Completed', esign_completed_at: new Date().toISOString() });
    await log(doc, `Document signed: ${doc.name}`, how === 'manual' ? 'Marked as signed manually' : `Signed by ${doc.esign_signer_email ?? 'signer'} (simulated)`);
  }, 'Document marked as signed');

  const decline = (doc: DocumentRow) => run(async () => {
    await db.update('documents', doc.id, { esign_status: 'Declined', esign_completed_at: null });
    await log(doc, `eSignature declined: ${doc.name}`, `Declined by ${doc.esign_signer_email ?? 'signer'} (simulated)`);
  }, 'Signer declined the request');

  const remove = async (doc: DocumentRow) => {
    const pending = effectiveStatus(doc) === 'Pending';
    const ok = await confirm({
      title: 'Delete document?',
      message: <>“{doc.name}” will be permanently deleted{pending ? ' and its open signature request canceled' : ''}. This cannot be undone.</>,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    await run(async () => {
      // Row first: if it can't be deleted, the file must stay so the row doesn't point at nothing.
      await db.remove('documents', doc.id);
      await db.removeFile(doc).catch(() => {});
    }, 'Document deleted');
  };

  const items = (doc: DocumentRow): MenuItem[] => {
    const st = effectiveStatus(doc);
    const list: MenuItem[] = [
      { label: 'View', icon: <Eye size={14} />, onClick: () => void view(doc) },
      { label: 'Download', icon: <Download size={14} />, onClick: () => void view(doc, true) },
      'divider',
      { label: 'Rename', icon: <Type size={14} />, onClick: () => setModal({ kind: 'rename', doc }) },
      { label: 'Change category', icon: <Tag size={14} />, onClick: () => setModal({ kind: 'category', doc }) },
      { label: 'Move to policy', icon: <FolderInput size={14} />, onClick: () => setModal({ kind: 'move', doc }), disabled: !doc.account_id },
      'divider',
    ];
    if (st === 'Pending') {
      list.push(
        { label: 'Simulate signer: Sign', icon: <UserCheck size={14} />, onClick: () => void complete(doc, 'simulated') },
        { label: 'Simulate signer: Decline', icon: <UserX size={14} />, onClick: () => void decline(doc) },
        { label: 'Resend', icon: <RotateCw size={14} />, onClick: () => void resend(doc) },
        { label: 'Void request', icon: <Ban size={14} />, onClick: () => void voidRequest(doc) },
      );
    } else if (st === 'Completed') {
      list.push({ label: 'Send for eSignature again', icon: <PenLine size={14} />, onClick: () => setModal({ kind: 'esign', doc }) });
    } else if (st) {
      list.push(
        { label: 'Resend', icon: <RotateCw size={14} />, onClick: () => void resend(doc) },
        { label: 'Send for eSignature', icon: <PenLine size={14} />, onClick: () => setModal({ kind: 'esign', doc }) },
      );
    } else {
      list.push({ label: 'Send for eSignature', icon: <PenLine size={14} />, onClick: () => setModal({ kind: 'esign', doc }) });
    }
    if (st !== 'Completed') list.push({ label: 'Mark as signed', icon: <CheckCircle2 size={14} />, onClick: () => void complete(doc, 'manual') });
    list.push('divider', { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(doc) });
    return list;
  };

  const modals = modal && (
    modal.kind === 'rename' ? <RenameModal doc={modal.doc} onClose={close} />
      : modal.kind === 'category' ? <CategoryModal doc={modal.doc} onClose={close} />
        : modal.kind === 'move' ? <MoveModal doc={modal.doc} onClose={close} />
          : <ESignModal doc={modal.doc} onClose={close} />
  );

  return { items, modals, view, resend, voidRequest, complete, decline };
}

// ── Row modals ──

function useSave(onClose: () => void) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    try { await fn(); toast(success); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return { busy, error, setError, save };
}

function RenameModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [name, setName] = useState(doc.name);
  const { busy, error, setError, save } = useSave(onClose);
  const submit = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    void save(() => db.update('documents', doc.id, { name: name.trim() }), 'Document renamed');
  };
  return (
    <Modal title="Rename document" size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save</Button></>}>
      <Field label="Name" required error={error}>
        <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      </Field>
    </Modal>
  );
}

function CategoryModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [category, setCategory] = useState(doc.category || 'Other');
  const { busy, error, save } = useSave(onClose);
  const options = DOC_CATEGORIES.includes(category) ? DOC_CATEGORIES : [category, ...DOC_CATEGORIES];
  return (
    <Modal title="Change category" subtitle={doc.name} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save(() => db.update('documents', doc.id, { category }), 'Category updated')}>Save</Button></>}>
      <ErrorBanner message={error} />
      <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={options} /></Field>
    </Modal>
  );
}

function MoveModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [policyId, setPolicyId] = useState<string | null>(doc.policy_id);
  const { busy, error, save } = useSave(onClose);
  return (
    <Modal title="Move to policy" subtitle={doc.name} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save(() => db.update('documents', doc.id, { policy_id: policyId }), policyId ? 'Document moved to policy' : 'Document detached from policy')}>Move</Button></>}>
      <ErrorBanner message={error} />
      <Field label="Policy" hint="Choose “No policy” to keep the document on the account only.">
        <PolicySelect accountId={doc.account_id} value={policyId} onChange={setPolicyId} />
      </Field>
    </Modal>
  );
}

function ESignModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const account = useRow('accounts', doc.account_id);
  const { me } = useAppData();
  const a = account.data;
  const [touched, setTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(doc.esign_signer_email ?? '');
  const [message, setMessage] = useState(`Please review and sign “${doc.name}”. Let us know if you have any questions.`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, save } = useSave(onClose);
  const templates = useTable('esign_templates', { order: { column: 'name' } });
  const [templateId, setTemplateId] = useState('');
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.data.find((x) => x.id === id);
    if (t?.message) setMessage(t.message.replace(/\{document\}/g, () => doc.name));
  };

  // Prefill signer from the account once it loads.
  if (a && !touched) {
    setTouched(true);
    setName(accountName(a));
    if (!doc.esign_signer_email) setEmail(a.email ?? '');
  }

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Signer name is required';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address';
    setErrors(e);
    if (Object.keys(e).length) return;
    void save(async () => {
      await db.update('documents', doc.id, { esign_status: 'Pending', esign_signer_email: email.trim(), esign_sent_at: new Date().toISOString(), esign_completed_at: null });
      await logActivity({
        account_id: doc.account_id, policy_id: doc.policy_id, type: 'Email', assigned_to: me?.name ?? null,
        subject: `eSignature request sent: ${doc.name}`, description: `To ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
      }).catch(() => {});
    }, `Sent for signature to ${email.trim()}`);
  };

  return (
    <Modal title="Send for eSignature" subtitle={doc.name} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<PenLine size={14} />} loading={busy} onClick={submit}>Send request</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Signer name" required error={errors.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Signer email" required error={errors.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        {templates.data.length > 0 && (
          <Field label="Template" hint="Pre-fills the message to the signer. Manage under Communication Center → eSignature Templates.">
            <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)} placeholder="No template" options={templates.data.map((t) => ({ value: t.id, label: `${t.name} (${t.category})` }))} />
          </Field>
        )}
        <Field label="Message to signer"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} /></Field>
        <p className="text-[11px] text-ink-400">Requests expire after 30 days. Signing is simulated — connect an eSignature provider to send for real; use “Simulate signer” on the envelope to record the result.</p>
      </div>
    </Modal>
  );
}

// ── Upload ──

export function UploadModal({ files: initial, accountId: fixedAccount, policyId: fixedPolicy, onClose }: { files: File[]; accountId: string | null; policyId: string | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [files, setFiles] = useState<File[]>(initial);
  const [accountId, setAccountId] = useState<string | null>(fixedAccount);
  const [policyId, setPolicyId] = useState<string | null>(fixedPolicy);
  const [category, setCategory] = useState('Other');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const local = getDbMode() === 'local';
  const LIMIT = 1.5 * 1024 * 1024;

  const addMore = (list: FileList | null) => { if (list?.length) setFiles((f) => [...f, ...Array.from(list)]); };

  // Files dropped on the page while this modal is open are appended to `initial` by the parent.
  const seen = useRef(initial.length);
  useEffect(() => {
    if (busy || initial.length <= seen.current) return;
    const added = initial.slice(seen.current);
    seen.current = initial.length;
    setFiles((f) => [...f, ...added]);
  }, [initial, busy]);

  const submit = async () => {
    if (!accountId) { setError('Choose the client these documents belong to'); return; }
    if (!files.length) { setError('Add at least one file'); return; }
    if (local && files.some((f) => f.size > LIMIT)) { setError('In browser-storage mode each file must be under 1.5 MB. Remove the larger files or connect Supabase.'); return; }
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    const uploaded = new Set<File>();
    for (const [i, file] of files.entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const meta = await db.uploadFile(file);
        try {
          await db.insert('documents', {
            ...meta, name: file.name, category, account_id: accountId, policy_id: policyId,
            esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
          });
        } catch (e) {
          await db.removeFile(meta).catch(() => {}); // don't orphan the storage object
          throw e;
        }
        uploaded.add(file);
      } catch (e) {
        failed.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    const done = uploaded.size;
    setBusy(false);
    setProgress('');
    if (done) toast(`${done} document${done === 1 ? '' : 's'} uploaded`);
    // Keep only what wasn't uploaded (failures, plus anything dropped in while uploading).
    const remaining = files.length - done + (initial.length - seen.current);
    setFiles((f) => f.filter((x) => !uploaded.has(x)));
    if (failed.length) setError(failed.join('\n'));
    else if (!remaining) onClose();
  };

  return (
    <Modal title="Upload documents" onClose={onClose} footer={<>
      {progress && <span className="mr-auto self-center text-xs text-ink-400">{progress}</span>}
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()} disabled={!files.length}>Upload {files.length || ''}</Button>
    </>}>
      <div className="space-y-3">
        {error && <div className="whitespace-pre-line"><ErrorBanner message={error} /></div>}
        {!fixedAccount && (
          <Field label="Client" required>
            <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setPolicyId(null); setError(null); }} />
          </Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={DOC_CATEGORIES} /></Field>
          {!fixedPolicy && <Field label="Policy"><PolicySelect accountId={accountId} value={policyId} onChange={setPolicyId} /></Field>}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Files</div>
          <ul className="border border-ink-100 rounded divide-y divide-ink-50">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                <span className="truncate flex-1 text-ink-800">{f.name}</span>
                <span className={local && f.size > LIMIT ? 'text-red-600 text-xs' : 'text-ink-400 text-xs'}>{fmtBytes(f.size)}{local && f.size > LIMIT ? ' · too large' : ''}</span>
                <button className="bg-transparent text-ink-400 hover:text-red-600" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={14} /></button>
              </li>
            ))}
            {!files.length && <li className="px-3 py-3 text-[13px] text-ink-400">No files selected</li>}
          </ul>
          <label className="inline-flex mt-2 text-xs font-semibold text-brand-600 hover:underline cursor-pointer">
            + Add more files
            <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => { addMore(e.target.files); e.target.value = ''; }} />
          </label>
          {local && <p className="text-[11px] text-ink-400 mt-1">Browser-storage mode: files up to 1.5 MB each.</p>}
        </div>
      </div>
    </Modal>
  );
}

// ── Generate ──

/**
 * Why proof of insurance / ID cards can't be issued for this policy, or null when it is in force today.
 * An early-renewed policy (row already on the future renewal term) is in force on its prior term.
 */
function notInForce(p: Policy, txns: PolicyTransaction[]) {
  const t = today();
  if (p.status !== 'Active') return `This policy is ${p.status.toLowerCase()}; proof of insurance and ID cards can only be issued for an active policy.`;
  if (p.expiration_date < t) return `This policy expired ${fmtDate(p.expiration_date)}; proof of insurance and ID cards can't be issued for it.`;
  if (p.effective_date > t && !priorTerm(p, txns)) return `This policy isn't in force until ${fmtDate(p.effective_date)}; proof of insurance and ID cards can't be issued yet.`;
  return null;
}

export function GenerateModal({ accountId: fixedAccount, policyId: fixedPolicy, onClose }: { accountId: string | null; policyId: string | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const { settings, carriers, me } = useAppData();
  const [accountId, setAccountId] = useState<string | null>(fixedAccount);
  const [policyId, setPolicyId] = useState<string | null>(fixedPolicy);
  const [template, setTemplate] = useState<GenTemplate>('proof');
  const [openAfter, setOpenAfter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const policy = useRow('policies', policyId);
  const txns = useTable('policy_transactions', policyId ? { eq: { policy_id: policyId } } : null);
  const isAuto = policy.data ? AUTO_LINES.includes(policy.data.line_of_business) : true;
  const tpl = GEN_TEMPLATES.find((t) => t.value === template)!;
  const needsInForce = template === 'proof' || template === 'id-card';
  const inForceError = needsInForce && policy.data && !txns.loading ? notInForce(policy.data, txns.data) : null;

  const submit = async () => {
    if (!accountId) { setError('Choose a client'); return; }
    if (!policyId) { setError('Choose the policy to generate from'); return; }
    if (tpl.autoOnly && !isAuto) { setError('Auto ID cards can only be generated for auto policies'); return; }
    if (inForceError) { setError(inForceError); return; }
    setBusy(true);
    setError(null);
    const win = openAfter ? window.open('', '_blank') : null;
    try {
      const [p, a] = await Promise.all([db.get('policies', policyId), db.get('accounts', accountId)]);
      if (!p || !a) throw new Error('Policy or account not found');
      // Re-check against the freshly loaded row (the policy may have changed since the modal opened).
      const blocked = needsInForce ? notInForce(p, await db.list('policy_transactions', { eq: { policy_id: p.id } })) : null;
      if (blocked) throw new Error(blocked);
      const vehicles = AUTO_LINES.includes(p.line_of_business) ? await db.list('vehicles', { eq: { account_id: a.id } }) : [];
      const html = buildDocumentHtml(template, { policy: p, account: a, vehicles, settings, carrier: carriers.find((c) => c.name === p.carrier) });
      const fileName = `${tpl.label} - ${p.policy_number}.html`;
      const file = new File([html], fileName, { type: 'text/html' });
      const meta = await db.uploadFile(file);
      const doc = await db.insert('documents', {
        ...meta, name: fileName, category: tpl.category, account_id: a.id, policy_id: p.id,
        esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
      });
      await logActivity({ account_id: a.id, policy_id: p.id, subject: `Generated ${tpl.label}`, description: fileName, assigned_to: me?.name ?? null }).catch(() => {});
      toast(`${tpl.label} generated`);
      onClose();
      // The document is saved; failing to open it must not leave the modal up (and invite a duplicate).
      if (win) await openDocumentFile(doc, false, win).catch((e: Error) => { win.close(); toast(e.message, 'error'); });
    } catch (e) {
      win?.close();
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Generate document" subtitle="Build a printable document from policy data" size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" icon={<FileOutput size={14} />} loading={busy} onClick={() => void submit()}>Generate</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!fixedAccount && (
          <Field label="Client" required>
            <AccountPicker value={accountId} onChange={(id) => { setAccountId(id); setPolicyId(null); setError(null); }} />
          </Field>
        )}
        {!fixedPolicy && (
          <Field label="Policy" required>
            <PolicySelect accountId={accountId} value={policyId} onChange={(id) => { setPolicyId(id); setError(null); }} allowEmpty />
          </Field>
        )}
        <Field label="Document" error={tpl.autoOnly && !isAuto ? 'Only available for auto policies' : inForceError ?? undefined}>
          <Select value={template} onChange={(e) => { setTemplate(e.target.value as GenTemplate); setError(null); }} options={GEN_TEMPLATES.map((t) => ({ value: t.value, label: `${t.label} (${t.category})` }))} />
        </Field>
        <Checkbox label="Open the document after generating" checked={openAfter} onChange={setOpenAfter} />
      </div>
    </Modal>
  );
}
