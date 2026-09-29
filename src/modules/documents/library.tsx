import {
  ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, File, FileCode, FileImage, FileSpreadsheet, FileText, Filter, Folder, FolderInput, FolderOpen, Pencil, Plus, Search, Trash2, Upload, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button, ErrorBanner, Field, Input, Menu, Modal, Select, Textarea, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db, uuid } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtBytes, fmtMoney } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { setParam } from '@/lib/router';
import type { Account, DocumentRow, Policy, Quote } from '@/lib/types';
import { LabelChip } from '@/modules/admin/shared';
import { useLabels } from '@/modules/admin/integration';
import { saveAppConfig, useAppConfig, type DocFolder, type DocLibraryEntry } from '@/modules/admin/config';
import { GenerateModal, useDocumentActions } from './actions';
import { DOC_CATEGORIES, coverageTable, effectiveStatus, esc, hasFile, openDocumentFile, shell } from './shared';

/*
 * EZLynx-style Document Library for one insured: folders, documents, labels, Add ▾ (Form, Upload, Folder,
 * Certificate, Merge PDFs, Word document, Quote proposal, Summary of insurance) and row / bulk actions.
 * Folders, placement, labels and who/when metadata live in app config (doc_library), keyed by account.
 */

const DEFAULT_FOLDERS = ['Payments', 'Policy Documents', 'Certificates', 'Applications', 'Claims', 'Carrier eDocs'];
const MAX_UPLOAD = 100 * 1024 * 1024;

const mdy = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

function DocIcon({ mime, name }: { mime: string | null; name: string }) {
  const m = (mime ?? '').toLowerCase();
  const n = name.toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return <FileText size={16} className="text-red-500" />;
  if (m.startsWith('image/')) return <FileImage size={16} className="text-violet-500" />;
  if (m.includes('html') || n.endsWith('.html')) return <FileCode size={16} className="text-brand-600" />;
  if (m.includes('sheet') || m.includes('excel') || /\.(xlsx?|csv)$/.test(n)) return <FileSpreadsheet size={16} className="text-emerald-600" />;
  if (m.includes('word') || /\.(docx?|rtf|txt)$/.test(n)) return <FileText size={16} className="text-sky-600" />;
  return <File size={16} className="text-ink-400" />;
}

type Row = { kind: 'folder'; folder: DocFolder; count: number } | { kind: 'doc'; doc: DocumentRow };
type Dialog =
  | { kind: 'upload' } | { kind: 'folder'; folder?: DocFolder } | { kind: 'move'; ids: string[] } | { kind: 'labels'; doc: DocumentRow }
  | { kind: 'merge' } | { kind: 'word' } | { kind: 'proposal' } | { kind: 'form' } | null;

/** The account's library entry, with the default EZLynx folders until the agency changes them. */
function useLibrary(account: Account) {
  const { value } = useAppConfig('doc_library');
  const saved = value.byAccount[account.id];
  const entry: DocLibraryEntry = useMemo(() => saved ?? {
    folders: DEFAULT_FOLDERS.map((name, i) => ({ id: `default-${i}`, name, created_at: account.created_at, created_by: account.producer, modified_at: null })),
    placement: {}, labels: {}, meta: {},
  }, [saved, account.created_at, account.producer]);
  // Read-modify-write against the latest stored value so quick successive edits don't overwrite each other.
  const update = async (fn: (e: DocLibraryEntry) => DocLibraryEntry) => {
    const [row] = await db.list('app_config', { eq: { key: 'doc_library' } });
    const all = (row?.value as { byAccount?: Record<string, DocLibraryEntry> } | undefined)?.byAccount ?? {};
    const current = all[account.id] ?? entry;
    await saveAppConfig('doc_library', { byAccount: { ...all, [account.id]: fn(structuredClone(current)) } });
  };
  return { entry, update };
}

export function DocumentLibrary({ account }: { account: Account }) {
  const { me, settings } = useAppData();
  const { toast, confirm } = useFeedback();
  const docs = useTable('documents', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const policies = useTable('policies', { eq: { account_id: account.id } });
  const labels = useLabels();
  const { entry, update } = useLibrary(account);
  const actions = useDocumentActions();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pinFolders, setPinFolders] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fType, setFType] = useState<'' | 'Folder' | 'Document'>('');
  const [fCategory, setFCategory] = useState('');
  const [fPolicy, setFPolicy] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dropping, setDropping] = useState<File[] | null>(null);
  const [page, setPage] = useState(0);

  const policyById = useMemo(() => new Map<string, Policy>(policies.data.map((p) => [p.id, p])), [policies.data]);
  const labelById = useMemo(() => new Map(labels.data.map((l) => [l.id, l])), [labels.data]);
  const folder = entry.folders.find((f) => f.id === folderId) ?? null;
  const placeOf = (d: DocumentRow) => (entry.folders.some((f) => f.id === entry.placement[d.id]) ? entry.placement[d.id] : null);
  const createdBy = (d: DocumentRow) => entry.meta[d.id]?.created_by ?? account.producer ?? 'System';
  const modifiedAt = (d: DocumentRow) => entry.meta[d.id]?.modified_at ?? d.created_at;

  const rows: Row[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    const searching = !!t || !!fCategory || !!fPolicy;
    // Searching looks through every folder, as in EZLynx; otherwise show the current folder's contents.
    const docRows: Row[] = docs.data
      .filter((d) => (searching ? true : placeOf(d) === folderId))
      .filter((d) => !fCategory || d.category === fCategory)
      .filter((d) => !fPolicy || d.policy_id === fPolicy)
      .filter((d) => !t || [d.name, d.category, policyById.get(d.policy_id ?? '')?.policy_number, createdBy(d), ...(entry.labels[d.id] ?? []).map((id) => labelById.get(id)?.name)]
        .some((s) => (s ?? '').toLowerCase().includes(t)))
      .map((doc) => ({ kind: 'doc', doc }));
    const folderRows: Row[] = folderId || fCategory || fPolicy ? [] : entry.folders
      .filter((f) => !t || f.name.toLowerCase().includes(t))
      .map((f) => ({ kind: 'folder', folder: f, count: docs.data.filter((d) => entry.placement[d.id] === f.id).length }));
    let list = [...folderRows, ...docRows];
    if (fType) list = list.filter((r) => (fType === 'Folder' ? r.kind === 'folder' : r.kind === 'doc'));
    if (!pinFolders) list.sort((a, b) => (b.kind === 'folder' ? b.folder.created_at : b.doc.created_at).localeCompare(a.kind === 'folder' ? a.folder.created_at : a.doc.created_at));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.data, entry, folderId, q, fType, fCategory, fPolicy, pinFolders, policyById, labelById]);

  const docIds = rows.filter((r): r is Extract<Row, { kind: 'doc' }> => r.kind === 'doc').map((r) => r.doc.id);
  const allOn = docIds.length > 0 && docIds.every((id) => selected.has(id));
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  useEffect(() => { setSelected(new Set()); setPage(0); }, [folderId]);
  useEffect(() => { setPage(0); }, [q, fType, fCategory, fPolicy]);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const toggleShare = (id: string, on: boolean) => void update((e) => { e.meta[id] = { ...e.meta[id], share: on }; return e; }).then(() => toast(on ? 'Shared with the insured' : 'No longer shared'));

  const touch = (ids: string[]) => update((e) => { for (const id of ids) e.meta[id] = { ...e.meta[id], modified_at: new Date().toISOString() }; return e; });

  const removeFolder = async (f: DocFolder) => {
    const inside = docs.data.filter((d) => entry.placement[d.id] === f.id).length;
    if (!(await confirm({ title: `Delete folder "${f.name}"?`, message: inside ? `The ${inside} document${inside === 1 ? '' : 's'} in it move back to the Document Library.` : 'The folder is empty.', confirmLabel: 'Delete folder', danger: true }))) return;
    try {
      await update((e) => ({ ...e, folders: e.folders.filter((x) => x.id !== f.id), placement: Object.fromEntries(Object.entries(e.placement).filter(([, v]) => v !== f.id)) }));
      toast('Folder deleted');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const bulkDelete = async () => {
    const list = docs.data.filter((d) => selected.has(d.id));
    if (!(await confirm({ title: `Delete ${list.length} document${list.length === 1 ? '' : 's'}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    let n = 0;
    for (const d of list) { try { await db.remove('documents', d.id); await db.removeFile(d).catch(() => {}); n++; } catch { /* keep going */ } }
    setSelected(new Set());
    toast(`${n} document${n === 1 ? '' : 's'} deleted`);
  };

  /** Saves generated HTML as a document in the current folder and opens it. */
  const saveGenerated = async (content: BlobPart, name: string, category: string, policyId: string | null, mime = 'text/html', open = true) => {
    const win = open ? window.open('', '_blank') : null;
    try {
      const file = new globalThis.File([content], name, { type: mime });
      const meta = await db.uploadFile(file);
      const doc = await db.insert('documents', { ...meta, name, category, account_id: account.id, policy_id: policyId, esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null });
      await update((e) => { if (folderId) e.placement[doc.id] = folderId; e.meta[doc.id] = { created_by: me?.name ?? null, modified_at: null }; return e; });
      await logActivity({ account_id: account.id, policy_id: policyId, subject: `Created ${name}`, description: null, assigned_to: me?.name ?? null }).catch(() => {});
      toast(`${name} created`);
      if (win) await openDocumentFile(doc, false, win).catch(() => win.close());
    } catch (e) { win?.close(); toast((e as Error).message, 'error'); }
  };

  const summaryOfInsurance = () => {
    const active = policies.data.filter((p) => p.status === 'Active').sort((a, b) => a.line_of_business.localeCompare(b.line_of_business));
    if (!active.length) { toast('This insured has no active policies to summarize.', 'info'); return; }
    const total = active.reduce((s, p) => s + p.premium, 0);
    const html = shell('Summary of Insurance', settings, `
<p>Prepared for <b>${esc(accountName(account))}</b>. This summary lists the policies in force today.</p>
<h2>Policies in force</h2>
<table><thead><tr><th>Line</th><th>Carrier</th><th>Policy #</th><th>Term</th><th style="text-align:right">Premium</th></tr></thead><tbody>
${active.map((p) => `<tr><td>${esc(p.line_of_business)}</td><td>${esc(p.carrier)}</td><td>${esc(p.policy_number)}</td><td>${esc(mdy(p.effective_date))} – ${esc(mdy(p.expiration_date))}</td><td style="text-align:right">${esc(fmtMoney(p.premium, true))}</td></tr>`).join('')}
<tr><td colspan="4"><b>Total annualized premium</b></td><td style="text-align:right"><b>${esc(fmtMoney(total, true))}</b></td></tr></tbody></table>
${active.map((p) => `<h2>${esc(p.line_of_business)} · ${esc(p.policy_number)}</h2>${coverageTable(p, false)}`).join('')}`);
    void saveGenerated(html, `Summary of Insurance - ${accountName(account)}.html`, 'Declarations', null);
  };

  const cell = 'px-3 py-2.5 text-[13px] text-ink-800 border-b border-ink-100';
  const head = 'px-3 py-2 text-[12px] font-semibold text-ink-700 border-b border-ink-200 text-left align-bottom';

  return (
    <div className="px-4 py-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative w-full sm:w-[280px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search documents" className="w-full h-9 rounded border border-ink-300 bg-white pl-3 pr-9 text-[13px] outline-none focus:border-brand-500" />
          <Search size={16} className="absolute right-3 top-2.5 text-ink-500" />
        </div>
        <div className="relative">
          <button type="button" onClick={() => setFiltersOpen((o) => !o)} className={cx('inline-flex items-center gap-1.5 h-9 px-2 text-[13px] text-ink-800 hover:text-ink-900', (fType || fCategory || fPolicy) && 'text-brand-700 font-semibold')} aria-expanded={filtersOpen}>
            <Filter size={15} /> Filters{(fType || fCategory || fPolicy) ? ` (${[fType, fCategory, fPolicy].filter(Boolean).length})` : ''}
          </button>
          {filtersOpen && (
            <div className="absolute z-40 mt-1 w-72 bg-white border border-ink-200 rounded shadow-pop p-3 space-y-2.5">
              <Field label="Document type"><Select value={fType} onChange={(e) => setFType(e.target.value as typeof fType)} placeholder="All" options={['Folder', 'Document']} /></Field>
              <Field label="Category"><Select value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="All categories" options={DOC_CATEGORIES} /></Field>
              <Field label="Policy #"><Select value={fPolicy} onChange={(e) => setFPolicy(e.target.value)} placeholder="All policies" options={policies.data.map((p) => ({ value: p.id, label: `${p.policy_number} · ${p.line_of_business}` }))} /></Field>
              <div className="flex justify-between pt-1">
                <button type="button" className="text-[12px] text-brand-700 hover:underline" onClick={() => { setFType(''); setFCategory(''); setFPolicy(''); }}>Clear</button>
                <button type="button" className="text-[12px] font-semibold text-brand-700 hover:underline" onClick={() => setFiltersOpen(false)}>Done</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1" />
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-800 cursor-pointer">
          Pin folders to top <input type="checkbox" className="w-4 h-4 accent-[#007a78]" checked={pinFolders} onChange={(e) => setPinFolders(e.target.checked)} />
        </label>
        <Menu trigger={<Button variant="primary" className="h-9 px-4 tracking-wide">Add <ChevronDown size={15} /></Button>} items={[
          { label: 'Form', onClick: () => setDialog({ kind: 'form' }) },
          { label: 'Upload', onClick: () => setDialog({ kind: 'upload' }) },
          { label: 'Folder', onClick: () => setDialog({ kind: 'folder' }) },
          { label: 'Certificate', onClick: () => setParam('tab', 'certificates') },
          { label: 'Merge PDFs', onClick: () => setDialog({ kind: 'merge' }) },
          { label: 'Word document', onClick: () => setDialog({ kind: 'word' }) },
          { label: 'Quote proposal', onClick: () => setDialog({ kind: 'proposal' }) },
          { label: 'Summary of insurance', onClick: summaryOfInsurance },
        ]} />
      </div>

      {/* Breadcrumb + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 min-h-[28px] mb-1 text-[13px]">
        {folder ? (
          <>
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setFolderId(null)}>Document Library</button>
            <ChevronRight size={14} className="text-ink-400" />
            <span className="font-semibold text-ink-900 inline-flex items-center gap-1.5"><FolderOpen size={15} className="text-amber-500" />{folder.name}</span>
          </>
        ) : (q || fCategory || fPolicy) ? <span className="text-ink-500">{docIds.length} matching document{docIds.length === 1 ? '' : 's'} in all folders</span> : null}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-ink-600">{selected.size} selected</span>
            <Button size="sm" icon={<FolderInput size={13} />} onClick={() => setDialog({ kind: 'move', ids: [...selected] })}>Move to folder</Button>
            <Button size="sm" onClick={() => { for (const d of docs.data.filter((x) => selected.has(x.id))) void actions.view(d, true); }}>Download</Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => void bulkDelete()}>Delete</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-ink-200 rounded overflow-x-auto"
        onDragOver={(e: DragEvent) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
        onDrop={(e: DragEvent) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDropping([...e.dataTransfer.files]); setDialog({ kind: 'upload' }); }}>
        <table className="w-full min-w-[900px] border-collapse" aria-label="Document Library">
          <thead>
            <tr>
              <th className={cx(head, 'w-10')}><input type="checkbox" aria-label="Select all documents" className="w-4 h-4 accent-[#007a78]" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(docIds) : new Set())} /></th>
              <th className={cx(head, 'w-14')}>Type</th>
              <th className={head}>Document Name</th>
              <th className={cx(head, 'w-28')}>Document<br />Type</th>
              <th className={cx(head, 'w-32')}>Labels</th>
              <th className={cx(head, 'w-24')}>Policy #</th>
              <th className={cx(head, 'w-28')}>Created By</th>
              <th className={cx(head, 'w-24')}>Date<br />Created</th>
              <th className={cx(head, 'w-24')}>Date<br />Modified</th>
              <th className={cx(head, 'w-16')}>Share</th>
              <th className={cx(head, 'w-28')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.loading && <tr><td colSpan={11} className="px-3 py-8 text-center text-[13px] text-ink-500">Loading documents…</td></tr>}
            {!docs.loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-[13px] text-ink-500">
                {folder ? 'This folder is empty. Use Add ▾ → Upload, or drag files here.' : q || fType || fCategory || fPolicy ? 'No documents or folders match.' : 'No documents yet. Use Add ▾ → Upload, or drag files here.'}
              </td></tr>
            )}
            {shown.map((r) => r.kind === 'folder' ? (
              <tr key={r.folder.id} className="hover:bg-[#f7f9fb]" data-testid="doc-folder">
                <td className={cell} />
                <td className={cell}><Folder size={16} className="text-amber-500 fill-amber-100" /></td>
                <td className={cell}><button type="button" className="text-left hover:text-brand-700 hover:underline" onClick={() => { setFolderId(r.folder.id); setQ(''); }}>{r.folder.name}</button>{r.count > 0 && <span className="text-ink-400 text-[12px] ml-1.5">({r.count})</span>}</td>
                <td className={cell}>Folder</td>
                <td className={cell} />
                <td className={cell} />
                <td className={cell}>{r.folder.created_by ?? '—'}</td>
                <td className={cell}>{mdy(r.folder.created_at)}</td>
                <td className={cell}>{mdy(r.folder.modified_at ?? r.folder.created_at)}</td>
                <td className={cell} />
                <td className={cell}>
                  <Menu trigger={<button type="button" className="inline-flex items-center gap-1 text-brand-700 font-semibold tracking-wide hover:underline">Actions <ChevronDown size={14} /></button>} items={[
                    { label: 'Open', icon: <FolderOpen size={14} />, onClick: () => setFolderId(r.folder.id) },
                    { label: 'Rename', icon: <Pencil size={14} />, onClick: () => setDialog({ kind: 'folder', folder: r.folder }) },
                    'divider',
                    { label: 'Delete folder', icon: <Trash2 size={14} />, danger: true, onClick: () => void removeFolder(r.folder) },
                  ]} />
                </td>
              </tr>
            ) : (() => {
              const d = r.doc;
              const p = policyById.get(d.policy_id ?? '');
              const docLabels = (entry.labels[d.id] ?? []).map((id) => labelById.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
              const where = entry.folders.find((f) => f.id === placeOf(d));
              return (
                <tr key={d.id} className={cx('hover:bg-[#f7f9fb]', selected.has(d.id) && 'bg-brand-50/50')} data-testid="doc-row">
                  <td className={cell}><input type="checkbox" aria-label={`Select ${d.name}`} className="w-4 h-4 accent-[#007a78]" checked={selected.has(d.id)} onChange={(e) => toggle(d.id, e.target.checked)} /></td>
                  <td className={cell}><DocIcon mime={d.mime_type} name={d.name} /></td>
                  <td className={cell}>
                    <button type="button" className="text-left hover:text-brand-700 hover:underline break-all" onClick={() => void actions.view(d)}>{d.name}</button>
                    {!folderId && where && <div className="text-[11px] text-ink-400">in {where.name}</div>}
                  </td>
                  <td className={cell}>Document</td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-1">
                      {docLabels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
                      <button type="button" className="inline-flex items-center gap-1 text-brand-700 font-semibold tracking-wide hover:underline whitespace-nowrap" onClick={() => setDialog({ kind: 'labels', doc: d })}>
                        <Plus size={13} /> {docLabels.length ? 'Edit' : 'Add label'}
                      </button>
                    </div>
                  </td>
                  <td className={cell}>{p?.policy_number ?? ''}</td>
                  <td className={cell}>{createdBy(d)}</td>
                  <td className={cell}>{mdy(d.created_at)}</td>
                  <td className={cell}>{mdy(modifiedAt(d))}</td>
                  <td className={cell}><input type="checkbox" aria-label={`Share ${d.name} with the insured`} title="Share with the insured" className="w-4 h-4 accent-[#007a78]" checked={!!entry.meta[d.id]?.share} onChange={(e) => toggleShare(d.id, e.target.checked)} /></td>
                  <td className={cell}>
                    <Menu trigger={<button type="button" className="inline-flex items-center gap-1 text-brand-700 font-semibold tracking-wide hover:underline">Actions <ChevronDown size={14} /></button>} items={[
                      { label: 'Move to folder', icon: <FolderInput size={14} />, onClick: () => setDialog({ kind: 'move', ids: [d.id] }) },
                      { label: docLabels.length ? 'Edit labels' : 'Add label', icon: <Plus size={14} />, onClick: () => setDialog({ kind: 'labels', doc: d }) },
                      'divider',
                      ...actions.items(d),
                    ]} />
                  </td>
                </tr>
              );
            })())}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={rows.length} per={PAGE} onPage={setPage} label={`${docs.data.length} document${docs.data.length === 1 ? '' : 's'} · ${entry.folders.length} folder${entry.folders.length === 1 ? '' : 's'}`} />
      <ESignatureSection account={account} docs={docs.data} actions={actions} createdBy={createdBy} share={(id) => !!entry.meta[id]?.share_envelope} onShare={(id, on) => void update((e) => { e.meta[id] = { ...e.meta[id], share_envelope: on }; return e; })} />

      {dialog?.kind === 'upload' && (
        <UploadDocumentModal account={account} policies={policies.data} folders={entry.folders} folderId={folderId} initial={dropping ?? []}
          onClose={() => { setDialog(null); setDropping(null); }}
          onUploaded={(ids, target) => update((e) => { for (const id of ids) { if (target) e.placement[id] = target; e.meta[id] = { created_by: me?.name ?? null, modified_at: null }; } return e; })} />
      )}
      {dialog?.kind === 'folder' && (
        <FolderModal folder={dialog.folder} taken={entry.folders.map((f) => f.name.toLowerCase())} onClose={() => setDialog(null)} onSave={async (name) => {
          const now = new Date().toISOString();
          const f = dialog.folder;
          await update((e) => (f
            ? { ...e, folders: e.folders.map((x) => (x.id === f.id ? { ...x, name, modified_at: now } : x)) }
            : { ...e, folders: [...e.folders, { id: uuid(), name, created_at: now, created_by: me?.name ?? null, modified_at: null }] }));
          toast(f ? 'Folder renamed' : `Folder "${name}" created`);
        }} />
      )}
      {dialog?.kind === 'move' && (
        <MoveToFolderModal count={dialog.ids.length} folders={entry.folders} current={dialog.ids.length === 1 ? placeOf(docs.data.find((d) => d.id === dialog.ids[0])!) : null} onClose={() => setDialog(null)} onMove={async (target) => {
          const ids = dialog.ids;
          await update((e) => { for (const id of ids) { if (target) e.placement[id] = target; else delete e.placement[id]; e.meta[id] = { ...e.meta[id], modified_at: new Date().toISOString() }; } return e; });
          setSelected(new Set());
          toast(`Moved to ${entry.folders.find((f) => f.id === target)?.name ?? 'Document Library'}`);
        }} />
      )}
      {dialog?.kind === 'labels' && (
        <DocLabelsModal doc={dialog.doc} current={entry.labels[dialog.doc.id] ?? []} labels={labels.data} onClose={() => setDialog(null)} onSave={async (ids) => {
          await update((e) => { e.labels[dialog.doc.id] = ids; return e; });
          await touch([dialog.doc.id]);
          toast('Labels updated');
        }} />
      )}
      {dialog?.kind === 'merge' && <MergePdfsModal docs={docs.data} onClose={() => setDialog(null)} save={saveGenerated} />}
      {dialog?.kind === 'word' && <WordDocModal account={account} onClose={() => setDialog(null)} save={saveGenerated} />}
      {dialog?.kind === 'proposal' && <ProposalModal account={account} onClose={() => setDialog(null)} save={saveGenerated} />}
      {dialog?.kind === 'form' && <GenerateModal accountId={account.id} policyId={null} onClose={() => setDialog(null)} />}
      {actions.modals}
    </div>
  );
}

// ── Upload Document (EZLynx layout: dark title bar, dashed drop zone, Cancel / Upload) ──

function UploadDocumentModal({ account, policies, folders, folderId, initial, onClose, onUploaded }: {
  account: Account; policies: Policy[]; folders: DocFolder[]; folderId: string | null; initial: File[];
  onClose: () => void; onUploaded: (ids: string[], folderId: string | null) => Promise<void>;
}) {
  const { toast } = useFeedback();
  const [files, setFiles] = useState<File[]>(initial);
  const [category, setCategory] = useState('Other');
  const [policyId, setPolicyId] = useState('');
  const [target, setTarget] = useState(folderId ?? '');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const limit = MAX_UPLOAD;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const add = (list: FileList | File[] | null) => { if (list && list.length) { setFiles((f) => [...f, ...Array.from(list)]); setError(null); } };

  const submit = async () => {
    if (!files.length) { setError('Choose at least one file to upload.'); return; }
    const big = files.filter((f) => f.size > limit);
    if (big.length) { setError(`${big.map((f) => f.name).join(', ')} ${big.length === 1 ? 'is' : 'are'} larger than 100 MB.`); return; }
    setBusy(true);
    setError(null);
    const ids: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        const meta = await db.uploadFile(file);
        try {
          const doc = await db.insert('documents', { ...meta, name: file.name, category, account_id: account.id, policy_id: policyId || null, esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null });
          ids.push(doc.id);
        } catch (e) { await db.removeFile(meta).catch(() => {}); throw e; }
      } catch (e) { failed.push(`${file.name}: ${(e as Error).message}`); }
    }
    if (ids.length) {
      await onUploaded(ids, target || null).catch(() => {});
      toast(`${ids.length} document${ids.length === 1 ? '' : 's'} uploaded`);
    }
    setBusy(false);
    if (failed.length) { setError(failed.join('\n')); setFiles((f) => f.filter((x) => failed.some((m) => m.startsWith(`${x.name}:`)))); } else onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/30 grid place-items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Upload Document" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-[680px] bg-white shadow-pop rounded-sm overflow-hidden">
        <div className="flex items-center h-9 px-3 bg-[#2d3740] text-white">
          <div className="text-[13px] font-bold">Upload Document</div>
          <button type="button" aria-label="Close" className="ml-auto text-white/80 hover:text-white" disabled={busy} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-3 min-h-[320px] flex flex-col">
          <button type="button" onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            className={cx('w-full flex items-center justify-center gap-5 rounded-xl border-2 border-dashed px-4 py-4 text-[13px] text-ink-800 transition-colors', over ? 'border-brand-500 bg-brand-50' : 'border-ink-300 hover:border-ink-400')}>
            <Upload size={30} className="text-ink-500" strokeWidth={1.6} />
            <span className="text-center leading-snug">Drag files here or click to browse computer<br /><span className="text-ink-600">Maximum file size: 100 MB</span></span>
          </button>
          <input ref={input} type="file" multiple className="hidden" aria-label="Choose files" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          {error && <div className="mt-3 whitespace-pre-line"><ErrorBanner message={error} /></div>}
          {files.length > 0 && (
            <>
              <ul className="mt-3 border border-ink-200 rounded divide-y divide-ink-100" aria-label="Files to upload">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <DocIcon mime={f.type} name={f.name} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className={cx('text-[12px]', f.size > limit ? 'text-red-600' : 'text-ink-500')}>{fmtBytes(f.size)}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} className="text-ink-400 hover:text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <Field label="Document type"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={DOC_CATEGORIES} /></Field>
                <Field label="Folder"><Select value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Document Library" options={folders.map((f) => ({ value: f.id, label: f.name }))} /></Field>
                <Field label="Policy #"><Select value={policyId} onChange={(e) => setPolicyId(e.target.value)} placeholder="None" options={policies.map((p) => ({ value: p.id, label: `${p.policy_number} · ${p.line_of_business}` }))} /></Field>
              </div>
            </>
          )}
          <div className="flex-1" />
          <div className="flex items-center justify-end gap-5 pt-4">
            {busy && <span className="mr-auto text-[12px] text-ink-500">Uploading…</span>}
            <button type="button" className="text-[13px] font-semibold tracking-wide text-brand-700 hover:underline disabled:opacity-50" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="button" className="text-[13px] font-semibold tracking-wide text-brand-700 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void submit()}>Upload</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small dialogs ──

function useSaving(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return { busy, error, setError, run };
}

function FolderModal({ folder, taken, onClose, onSave }: { folder?: DocFolder; taken: string[]; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(folder?.name ?? '');
  const { busy, error, setError, run } = useSaving(onClose);
  const submit = () => {
    const n = name.trim();
    if (!n) { setError('Folder name is required'); return; }
    if (n.toLowerCase() !== folder?.name.toLowerCase() && taken.includes(n.toLowerCase())) { setError('A folder with this name already exists'); return; }
    void run(() => onSave(n));
  };
  return (
    <Modal title={folder ? 'Rename folder' : 'New folder'} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{folder ? 'Save' : 'Create'}</Button></>}>
      <Field label="Folder name" required error={error}><Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} /></Field>
    </Modal>
  );
}

function MoveToFolderModal({ count, folders, current, onClose, onMove }: { count: number; folders: DocFolder[]; current: string | null; onClose: () => void; onMove: (folderId: string | null) => Promise<void> }) {
  const [target, setTarget] = useState(current ?? '');
  const { busy, error, run } = useSaving(onClose);
  return (
    <Modal title="Move to folder" subtitle={`${count} document${count === 1 ? '' : 's'}`} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void run(() => onMove(target || null))}>Move</Button></>}>
      <ErrorBanner message={error} />
      <Field label="Folder"><Select value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Document Library (no folder)" options={folders.map((f) => ({ value: f.id, label: f.name }))} /></Field>
    </Modal>
  );
}

function DocLabelsModal({ doc, current, labels, onClose, onSave }: { doc: DocumentRow; current: string[]; labels: { id: string; name: string; color: string }[]; onClose: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>(current);
  const { busy, error, run } = useSaving(onClose);
  return (
    <Modal title="Document labels" subtitle={doc.name} size="sm" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void run(() => onSave(picked))}>Save</Button></>}>
      <ErrorBanner message={error} />
      {labels.length === 0 ? <p className="text-[13px] text-ink-500">No labels yet. Create them in Agency Management → Manage Labels.</p> : (
        <div className="space-y-1.5">
          {labels.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#007a78]" checked={picked.includes(l.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
              <LabelChip name={l.name} color={l.color} />
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

type SaveFn = (content: BlobPart, name: string, category: string, policyId: string | null, mime?: string, open?: boolean) => Promise<void>;

/** Combines PDFs on file (in the chosen order) into one new PDF document. */
function MergePdfsModal({ docs, onClose, save }: { docs: DocumentRow[]; onClose: () => void; save: SaveFn }) {
  const pdfs = docs.filter((d) => (d.mime_type ?? '').includes('pdf') || d.name.toLowerCase().endsWith('.pdf'));
  const withFile = pdfs.filter((d) => d.data_url || d.storage_path);
  const [order, setOrder] = useState<string[]>([]);
  const [name, setName] = useState('Merged Documents.pdf');
  const { busy, error, setError, run } = useSaving(onClose);
  const pickedDocs = order.map((id) => withFile.find((d) => d.id === id)!).filter(Boolean);
  const submit = () => {
    if (pickedDocs.length < 2) { setError('Choose at least two PDFs to merge.'); return; }
    void run(async () => {
      const { PDFDocument } = await import('pdf-lib');
      const out = await PDFDocument.create();
      for (const d of pickedDocs) {
        const url = await db.fileUrl(d);
        if (!url) throw new Error(`${d.name} has no file.`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not read ${d.name}.`);
        let src;
        try { src = await PDFDocument.load(await res.arrayBuffer()); } catch { throw new Error(`${d.name} is encrypted or not a valid PDF, so it can't be merged.`); }
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      const fileName = name.trim().toLowerCase().endsWith('.pdf') ? name.trim() : `${name.trim() || 'Merged Documents'}.pdf`;
      await save(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName, 'Other', null, 'application/pdf', false);
    });
  };
  return (
    <Modal title="Merge PDFs" subtitle="Tick PDFs in the order they should appear" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Merge</Button></>}>
      <ErrorBanner message={error} />
      {withFile.length < 2 ? (
        <p className="text-[13px] text-ink-500">{pdfs.length ? 'Only PDFs with an uploaded file can be merged; sample records have no file.' : 'This insured has no PDFs yet.'} Upload at least two PDFs first.</p>
      ) : (
        <div className="space-y-3">
          <ul className="border border-ink-200 rounded divide-y divide-ink-100 max-h-[300px] overflow-y-auto">
            {withFile.map((d) => {
              const pos = order.indexOf(d.id);
              return (
                <li key={d.id}>
                  <label className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#007a78]" checked={pos >= 0} onChange={(e) => setOrder((o) => (e.target.checked ? [...o, d.id] : o.filter((x) => x !== d.id)))} />
                    <span className="w-5 text-center text-[12px] font-semibold text-brand-700">{pos >= 0 ? pos + 1 : ''}</span>
                    <FileText size={15} className="text-red-500" /><span className="truncate">{d.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Field label="New file name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

/** A simple Word document (opens in Microsoft Word) saved to the library. */
function WordDocModal({ account, onClose, save }: { account: Account; onClose: () => void; save: SaveFn }) {
  const [title, setTitle] = useState(`Letter to ${accountName(account)}`);
  const [body, setBody] = useState(`Dear ${account.account_type === 'Commercial' ? `${account.first_name} ${account.last_name}`.trim() || accountName(account) : account.first_name},\n\n\n\nSincerely,\n`);
  const { busy, error, setError, run } = useSaving(onClose);
  const submit = () => {
    if (!title.trim()) { setError('Title is required'); return; }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${body.split('\n').map((l) => `<p style="margin:0 0 6pt">${esc(l) || '&nbsp;'}</p>`).join('')}</body></html>`;
    const safe = title.trim().replace(/[\\/:*?"<>|]/g, '-');
    void run(() => save(html, `${safe}.doc`, 'Correspondence', null, 'application/msword', false));
  };
  return (
    <Modal title="Word document" subtitle="Saved as a .doc file that opens in Microsoft Word" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Content"><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** A printable proposal comparing the carriers that quoted. */
function ProposalModal({ account, onClose, save }: { account: Account; onClose: () => void; save: SaveFn }) {
  const { settings } = useAppData();
  const quotes = useTable('quotes', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const rated = quotes.data.filter((q) => q.results.some((r) => r.status === 'Quoted'));
  const [quoteId, setQuoteId] = useState('');
  const [note, setNote] = useState('Thank you for the opportunity to quote your insurance. Below are the options we obtained for you.');
  const { busy, error, setError, run } = useSaving(onClose);
  const pick: Quote | undefined = rated.find((q) => q.id === quoteId) ?? rated[0];
  const submit = () => {
    if (!pick) { setError('This insured has no rated quotes yet. Run an Auto or Home quote first.'); return; }
    const offers = pick.results.filter((r) => r.status === 'Quoted' && r.premium != null).sort((a, b) => (a.premium ?? 0) - (b.premium ?? 0));
    const html = shell('Quote Proposal', settings, `
<p>Prepared for <b>${esc(accountName(account))}</b> · ${esc(pick.line_of_business)} · Effective ${esc(mdy(pick.effective_date))}</p>
<p>${esc(note)}</p>
<h2>Options</h2>
<table><thead><tr><th>Carrier</th><th>Term</th><th style="text-align:right">Premium</th></tr></thead><tbody>
${offers.map((r, i) => `<tr><td>${esc(r.carrier)}${i === 0 ? ' <b>(lowest)</b>' : ''}</td><td>${esc(r.term_months)} months</td><td style="text-align:right">${esc(fmtMoney(r.premium ?? 0, true))}</td></tr>`).join('')}
</tbody></table>
${offers[0]?.coverages?.length ? `<h2>Coverages quoted</h2><table><thead><tr><th>Coverage</th><th>Limit</th><th>Deductible</th></tr></thead><tbody>${offers[0].coverages.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.limit)}</td><td>${esc(c.deductible || '—')}</td></tr>`).join('')}</tbody></table>` : ''}
<p class="muted" style="margin-top:18px">Premiums are quotes, not a binder of coverage. Coverage is bound only after the carrier accepts the application.</p>`);
    void run(() => save(html, `Quote Proposal - ${pick.line_of_business} - ${accountName(account)}.html`, 'Correspondence', pick.policy_id));
  };
  return (
    <Modal title="Quote proposal" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit} disabled={!rated.length}>Create proposal</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {quotes.loading ? <p className="text-[13px] text-ink-500">Loading quotes…</p> : rated.length === 0 ? (
          <p className="text-[13px] text-ink-500">This insured has no rated quotes yet. Run an Auto or Home quote first, then create the proposal here.</p>
        ) : (
          <>
            <Field label="Quote"><Select value={pick?.id ?? ''} onChange={(e) => setQuoteId(e.target.value)} options={rated.map((q) => ({ value: q.id, label: `${q.line_of_business} · ${mdy(q.created_at)} · ${q.results.filter((r) => r.status === 'Quoted').length} carriers` }))} /></Field>
            <Field label="Message"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}


// ── Pagination (EZLynx: Items per page · 1 – N of N · |< < > >|) ──

function Pager({ page, pages, total, per, onPage, label }: { page: number; pages: number; total: number; per: number; onPage: (p: number) => void; label?: string }) {
  const from = total ? page * per + 1 : 0;
  const to = Math.min(total, (page + 1) * per);
  const btn = 'w-8 h-8 grid place-items-center rounded text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex flex-wrap items-center gap-4 mt-2 text-[12px] text-ink-700" data-testid="pager">
      {label && <span className="text-ink-500">{label}</span>}
      <span className="ml-auto">Items per page: {per}</span>
      <span>{from} – {to} of {total}</span>
      <span className="flex">
        <button type="button" aria-label="First page" className={btn} disabled={page === 0} onClick={() => onPage(0)}><ChevronsLeft size={16} /></button>
        <button type="button" aria-label="Previous page" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeftIcon /></button>
        <button type="button" aria-label="Next page" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
        <button type="button" aria-label="Last page" className={btn} disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}><ChevronsRight size={16} /></button>
      </span>
    </div>
  );
}
const ChevronLeftIcon = () => <ChevronRight size={16} className="rotate-180" />;

// ── eSignature envelopes ──

const ENV_TONE: Record<string, string> = { Completed: 'text-emerald-700', Pending: 'text-amber-700', Declined: 'text-red-600', Expired: 'text-ink-500', Canceled: 'text-ink-500', Failed: 'text-red-600' };
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—');
/** A stable 6-digit envelope reference from the document id. */
const reference = (id: string) => String(parseInt(id.replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');

function ESignatureSection({ account, docs, actions, createdBy, share, onShare }: {
  account: Account; docs: DocumentRow[]; actions: ReturnType<typeof useDocumentActions>; createdBy: (d: DocumentRow) => string;
  share: (id: string) => boolean; onShare: (id: string, on: boolean) => void;
}) {
  const envelopes = docs.filter((d) => d.esign_status).sort((a, b) => (b.esign_sent_at ?? '').localeCompare(a.esign_sent_at ?? ''));
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pick, setPick] = useState('');
  const PER = 10;
  const pages = Math.max(1, Math.ceil(envelopes.length / PER));
  const signable = docs.filter((d) => hasFile(d) && !d.esign_status);
  const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-ink-700 border-b border-ink-200';
  const td = 'px-3 py-2.5 text-[13px] text-ink-800 border-b border-ink-100';
  return (
    <section className="mt-6" data-testid="esignature">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h3 className="text-[14px] font-semibold text-ink-900">eSignature</h3>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => { setPick(signable[0]?.id ?? ''); setCreating(true); }}>Create eSignature Envelope</Button>
      </div>
      <div className="bg-white border border-ink-200 rounded overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse" aria-label="eSignature envelopes">
          <thead><tr><th className={th}>Recipient</th><th className={th}>Envelope Name</th><th className={th}>Reference #</th><th className={th}>Sent</th><th className={th}>Received</th><th className={th}>Status</th><th className={th}>Share</th><th className={th}>Actions</th></tr></thead>
          <tbody>
            {!envelopes.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-[13px] text-ink-500">No envelopes yet. Use Create eSignature Envelope to send a document for signature.</td></tr>}
            {envelopes.slice(page * PER, page * PER + PER).map((d) => {
              const st = effectiveStatus(d) ?? '';
              return (
                <tr key={d.id} data-testid="envelope-row">
                  <td className={cx(td, 'uppercase')}>{accountName(account)}, {createdBy(d)}</td>
                  <td className={td}>{d.name.replace(/\.[a-z0-9]+$/i, '')}</td>
                  <td className={td}>{reference(d.id)}</td>
                  <td className={td}>{stamp(d.esign_sent_at)}</td>
                  <td className={td}>{st === 'Completed' ? stamp(d.esign_completed_at) : '—'}</td>
                  <td className={cx(td, 'font-semibold', ENV_TONE[st])}>{st}</td>
                  <td className={td}><input type="checkbox" aria-label={`Share envelope ${d.name}`} className="w-4 h-4 accent-[#007a78]" checked={share(d.id)} onChange={(e) => onShare(d.id, e.target.checked)} /></td>
                  <td className={td}><Menu trigger={<button type="button" className="inline-flex items-center gap-1 text-brand-700 font-semibold tracking-wide hover:underline">Actions <ChevronDown size={14} /></button>} items={actions.items(d)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={envelopes.length} per={PER} onPage={setPage} />
      {creating && (
        <Modal title="Create eSignature Envelope" size="sm" onClose={() => setCreating(false)} footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={() => { const d = docs.find((x) => x.id === pick); setCreating(false); if (d) actions.esign(d); }}>Next</Button></>}>
          {signable.length ? (
            <Field label="Document to sign" hint="Only documents with an uploaded file that aren't already out for signature are listed.">
              <Select value={pick} onChange={(e) => setPick(e.target.value)} options={signable.map((d) => ({ value: d.id, label: d.name }))} />
            </Field>
          ) : <p className="text-[13px] text-ink-500">Upload the document first (Add ▾ → Upload), then create the envelope.</p>}
        </Modal>
      )}
    </section>
  );
}
