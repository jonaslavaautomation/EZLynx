import {
  Ban, CheckCircle2, Clock, CloudUpload, File, FileCode, FileImage, FileOutput, FileSpreadsheet, FileText, FolderOpen, Hourglass, Layers, PenLine, Upload, XCircle, AlertTriangle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Button, DataTable, EmptyState, ErrorBanner, Menu, PageHeader, Panel, Pills, SearchInput, Select, StatCard, StatusBadge, Tabs, type Column,
} from '@/components/ui';
import { db } from '@/lib/db';
import { accountName, fmtBytes, fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, setParam, useRoute } from '@/lib/router';
import type { Account, DocumentRow, ESignStatus, Policy } from '@/lib/types';
import { GenerateModal, UploadModal, useDocumentActions } from './actions';
import { DOC_CATEGORIES, ESIGN_STATUSES, effectiveStatus, isStalePending } from './shared';

// ── Hooks ──

export type ESignCounts = Record<ESignStatus, number> & { total: number; loading: boolean };

/** Envelope counts by eSignature status (stale Pending counted as Expired), for the dashboard widget. */
export function useESignCounts(): ESignCounts {
  const docs = useTable('documents');
  return useMemo(() => {
    const counts = { Completed: 0, Pending: 0, Declined: 0, Expired: 0, Canceled: 0, Failed: 0, total: 0, loading: docs.loading } as ESignCounts;
    for (const d of docs.data) {
      const st = effectiveStatus(d);
      if (!st) continue;
      counts[st]++;
      counts.total++;
    }
    return counts;
  }, [docs.data, docs.loading]);
}

// ── Helpers ──

function DocIcon({ mime, name }: { mime: string | null; name: string }) {
  const m = (mime ?? '').toLowerCase();
  const n = name.toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return <FileText size={16} className="text-red-500 shrink-0" />;
  if (m.startsWith('image/')) return <FileImage size={16} className="text-violet-500 shrink-0" />;
  if (m.includes('html') || n.endsWith('.html')) return <FileCode size={16} className="text-brand-500 shrink-0" />;
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv') || /\.(xlsx?|csv)$/.test(n)) return <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />;
  if (m.includes('word') || m.startsWith('text/') || /\.(docx?|txt|rtf)$/.test(n)) return <FileText size={16} className="text-sky-600 shrink-0" />;
  return <File size={16} className="text-ink-400 shrink-0" />;
}

function useDropZone(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const isFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return {
    dragging,
    props: {
      onDragEnter: (e: DragEvent) => { if (!isFiles(e)) return; e.preventDefault(); if (!enabled) return; depth.current++; setDragging(true); },
      // Always cancel file drags (even when disabled) so the browser doesn't navigate away to the file.
      onDragOver: (e: DragEvent) => { if (!isFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = enabled ? 'copy' : 'none'; },
      onDragLeave: () => { if (!enabled) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
      onDrop: (e: DragEvent) => {
        if (!isFiles(e)) return;
        e.preventDefault();
        if (!enabled) return;
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}

// ── Document browser (account / policy / agency-wide) ──

function DocumentBrowser({ accountId, policyId, agencyWide }: { accountId?: string; policyId?: string; agencyWide?: boolean }) {
  const policy = useRow('policies', policyId ?? null);
  const effAccount = accountId ?? policy.data?.account_id ?? null;
  const docs = useTable('documents', policyId
    ? { eq: { policy_id: policyId }, order: { column: 'created_at', ascending: false } }
    : accountId
      ? { eq: { account_id: accountId }, order: { column: 'created_at', ascending: false } }
      : agencyWide ? { order: { column: 'created_at', ascending: false } } : null);
  const policies = useTable('policies', agencyWide ? {} : effAccount ? { eq: { account_id: effAccount } } : null);
  const accounts = useTable('accounts', agencyWide ? {} : null);
  const actions = useDocumentActions();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [esign, setEsign] = useState<'all' | 'esign' | 'none'>('all');
  const [uploadFiles, setUploadFiles] = useState<File[] | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canUpload = agencyWide || Boolean(effAccount);
  // Dropping more files while the upload modal is open adds them to it.
  const drop = useDropZone((files) => setUploadFiles((prev) => (prev ? [...prev, ...files] : files)), canUpload);

  const policyById = useMemo(() => new Map<string, Policy>(policies.data.map((p) => [p.id, p])), [policies.data]);
  const accountById = useMemo(() => new Map<string, Account>(accounts.data.map((a) => [a.id, a])), [accounts.data]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return docs.data.filter((d) => {
      if (category && d.category !== category) return false;
      if (esign === 'esign' && !d.esign_status) return false;
      if (esign === 'none' && d.esign_status) return false;
      if (!t) return true;
      const extra = agencyWide ? [accountName(accountById.get(d.account_id ?? '')), policyById.get(d.policy_id ?? '')?.policy_number] : [policyById.get(d.policy_id ?? '')?.policy_number];
      return [d.name, d.category, ...extra].some((s) => (s ?? '').toLowerCase().includes(t));
    });
  }, [docs.data, q, category, esign, agencyWide, accountById, policyById]);

  const categories = useMemo(() => {
    const extra = [...new Set(docs.data.map((d) => d.category).filter((c) => c && !DOC_CATEGORIES.includes(c)))];
    return [...DOC_CATEGORIES, ...extra].map((c) => ({ value: c, label: `${c} (${docs.data.filter((d) => d.category === c).length})` }));
  }, [docs.data]);

  const columns: Column<DocumentRow>[] = [
    {
      key: 'name', header: 'Name', sortValue: (d) => d.name.toLowerCase(),
      render: (d) => (
        <button onClick={() => void actions.view(d)} className="flex items-center gap-2 bg-transparent text-left min-w-0 max-w-[320px] group">
          <DocIcon mime={d.mime_type} name={d.name} />
          <span className="truncate font-semibold text-ink-900 group-hover:text-brand-600 group-hover:underline">{d.name}</span>
        </button>
      ),
    },
    ...(agencyWide ? [{
      key: 'insured', header: 'Insured', sortValue: (d: DocumentRow) => accountName(accountById.get(d.account_id ?? '')),
      render: (d: DocumentRow) => {
        const a = accountById.get(d.account_id ?? '');
        return a ? <a href={href(`/accounts/${a.id}`)} className="text-brand-600 hover:underline whitespace-nowrap">{accountName(a)}</a> : <span className="text-ink-300">—</span>;
      },
    }] : []),
    { key: 'category', header: 'Category', sortValue: (d) => d.category, render: (d) => <span className="whitespace-nowrap">{d.category || 'Other'}</span> },
    ...(policyId ? [] : [{
      key: 'policy', header: 'Policy', sortValue: (d: DocumentRow) => policyById.get(d.policy_id ?? '')?.policy_number ?? '',
      render: (d: DocumentRow) => {
        const p = policyById.get(d.policy_id ?? '');
        return p ? <a href={href(`/policies/${p.id}`)} className="text-brand-600 hover:underline whitespace-nowrap">{p.policy_number}</a> : <span className="text-ink-300">—</span>;
      },
    }]),
    { key: 'size', header: 'Size', align: 'right', sortValue: (d) => d.size_bytes ?? 0, render: (d) => <span className="text-ink-500 whitespace-nowrap tabular-nums">{fmtBytes(d.size_bytes)}</span> },
    { key: 'created', header: 'Uploaded', sortValue: (d) => d.created_at, render: (d) => <span className="whitespace-nowrap" title={fmtDateTime(d.created_at)}>{fmtDate(d.created_at)}</span> },
    { key: 'esign', header: 'eSign', sortValue: (d) => effectiveStatus(d) ?? '', render: (d) => <StatusBadge status={effectiveStatus(d)} /> },
    { key: 'actions', header: '', align: 'right', render: (d) => <Menu items={actions.items(d)} /> },
  ];

  const pickFiles = () => fileInput.current?.click();

  return (
    <div {...drop.props} className="relative min-w-0">
      <Panel
        title={agencyWide ? 'All documents' : 'Documents'}
        actions={<>
          <Button size="sm" icon={<FileOutput size={13} />} onClick={() => setGenerateOpen(true)} disabled={!canUpload}>Generate</Button>
          <Button size="sm" variant="primary" icon={<Upload size={13} />} onClick={pickFiles} disabled={!canUpload}>Upload</Button>
        </>}
        bodyClassName="p-0"
      >
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) setUploadFiles(f); e.target.value = ''; }} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-ink-100">
          <SearchInput value={q} onChange={setQ} placeholder={agencyWide ? 'Search by name, insured or policy…' : 'Search documents…'} className="w-full sm:w-64" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={categories} className="w-full sm:w-52" />
          <Pills value={esign} onChange={setEsign} options={[{ value: 'all', label: 'All' }, { value: 'esign', label: 'eSign' }, { value: 'none', label: 'No eSign' }]} />
          <span className="ml-auto text-xs text-ink-400">{rows.length} of {docs.data.length}</span>
        </div>
        <ErrorBanner message={docs.error} />
        {canUpload && (
          <button
            onClick={pickFiles}
            className="w-full flex items-center justify-center gap-2 border-b border-dashed border-ink-200 bg-ink-50/40 hover:bg-brand-50/50 text-xs text-ink-400 py-3"
          >
            <CloudUpload size={15} className="text-brand-500" /> Drag & drop files here, or <span className="text-brand-600 font-semibold">browse</span>
          </button>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          loading={docs.loading}
          initialSort={{ key: 'created', dir: 'desc' }}
          empty={
            <EmptyState
              icon={<FolderOpen size={22} />}
              title={docs.data.length ? 'No matching documents' : 'No documents yet'}
              message={docs.data.length ? 'Try a different search or category.' : 'Upload files or generate an ID card or proof of insurance from a policy.'}
              action={!docs.data.length && canUpload && <Button size="sm" variant="primary" icon={<Upload size={13} />} onClick={pickFiles}>Upload</Button>}
            />
          }
        />
      </Panel>
      {drop.dragging && (
        <div className="absolute inset-0 z-10 rounded border-2 border-dashed border-brand-400 bg-brand-50/80 grid place-items-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-brand-700 font-semibold text-sm"><CloudUpload size={28} /> Drop files to upload</div>
        </div>
      )}
      {uploadFiles && <UploadModal files={uploadFiles} accountId={effAccount} policyId={policyId ?? null} onClose={() => setUploadFiles(null)} />}
      {generateOpen && <GenerateModal accountId={effAccount} policyId={policyId ?? null} onClose={() => setGenerateOpen(false)} />}
      {actions.modals}
    </div>
  );
}

/** Documents for an account (account detail tab) or a policy (policy detail). */
export function DocumentList({ accountId, policyId }: { accountId?: string; policyId?: string }) {
  return <DocumentBrowser accountId={accountId} policyId={policyId} />;
}

// ── eSignature dashboard ──

const STATUS_CARDS: { status: ESignStatus; icon: ReactNode; tone: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'brand' }[] = [
  { status: 'Completed', icon: <CheckCircle2 size={18} />, tone: 'green' },
  { status: 'Pending', icon: <Clock size={18} />, tone: 'amber' },
  { status: 'Declined', icon: <XCircle size={18} />, tone: 'red' },
  { status: 'Expired', icon: <Hourglass size={18} />, tone: 'purple' },
  { status: 'Canceled', icon: <Ban size={18} />, tone: 'blue' },
  { status: 'Failed', icon: <AlertTriangle size={18} />, tone: 'red' },
];

function ESignDashboard() {
  const docs = useTable('documents', { order: { column: 'esign_sent_at', ascending: false } });
  const accounts = useTable('accounts');
  const actions = useDocumentActions();
  const counts = useESignCounts();
  const [status, setStatus] = useState<ESignStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const expired = useRef(false);

  // Pending envelopes older than 30 days become Expired (once per visit).
  useEffect(() => {
    if (docs.loading || docs.error || expired.current) return;
    expired.current = true;
    const stale = docs.data.filter(isStalePending);
    stale.forEach((d) => { db.update('documents', d.id, { esign_status: 'Expired' }).catch(() => {}); });
  }, [docs.loading, docs.error, docs.data]);

  const accountById = useMemo(() => new Map(accounts.data.map((a) => [a.id, a])), [accounts.data]);
  const envelopes = useMemo(() => docs.data.filter((d) => d.esign_status), [docs.data]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return envelopes.filter((d) => {
      if (status !== 'all' && effectiveStatus(d) !== status) return false;
      if (!t) return true;
      return [d.name, d.esign_signer_email, accountName(accountById.get(d.account_id ?? ''))].some((s) => (s ?? '').toLowerCase().includes(t));
    });
  }, [envelopes, status, q, accountById]);

  const columns: Column<DocumentRow>[] = [
    {
      key: 'name', header: 'Document', sortValue: (d) => d.name.toLowerCase(),
      render: (d) => (
        <button onClick={() => void actions.view(d)} className="flex items-center gap-2 bg-transparent text-left max-w-[280px] group">
          <DocIcon mime={d.mime_type} name={d.name} />
          <span className="truncate font-semibold text-ink-900 group-hover:text-brand-600 group-hover:underline">{d.name}</span>
        </button>
      ),
    },
    {
      key: 'insured', header: 'Insured', sortValue: (d) => accountName(accountById.get(d.account_id ?? '')),
      render: (d) => {
        const a = accountById.get(d.account_id ?? '');
        return a ? <a href={href(`/accounts/${a.id}?tab=documents`)} className="text-brand-600 hover:underline whitespace-nowrap">{accountName(a)}</a> : <span className="text-ink-300">—</span>;
      },
    },
    { key: 'signer', header: 'Signer', sortValue: (d) => d.esign_signer_email ?? '', render: (d) => <span className="text-ink-600">{d.esign_signer_email ?? '—'}</span> },
    { key: 'sent', header: 'Sent', sortValue: (d) => d.esign_sent_at ?? '', render: (d) => <span className="whitespace-nowrap" title={fmtDateTime(d.esign_sent_at)}>{d.esign_sent_at ? fmtRelative(d.esign_sent_at) : '—'}</span> },
    { key: 'completed', header: 'Completed', sortValue: (d) => d.esign_completed_at ?? '', render: (d) => <span className="whitespace-nowrap">{fmtDate(d.esign_completed_at)}</span> },
    { key: 'status', header: 'Status', sortValue: (d) => effectiveStatus(d) ?? '', render: (d) => <StatusBadge status={effectiveStatus(d)} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1">
          {effectiveStatus(d) === 'Pending' ? (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void actions.complete(d, 'simulated'); }} title="Simulate the signer completing the envelope">Sign</Button>
          ) : effectiveStatus(d) !== 'Completed' ? (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void actions.resend(d); }}>Resend</Button>
          ) : null}
          <Menu items={actions.items(d)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {STATUS_CARDS.map((c) => (
          <StatCard key={c.status} label={c.status} value={counts[c.status]} icon={c.icon} tone={c.tone} onClick={() => setStatus(status === c.status ? 'all' : c.status)} />
        ))}
        <StatCard label="All" value={counts.total} icon={<Layers size={18} />} tone="brand" onClick={() => setStatus('all')} />
      </div>
      <Panel title="Envelopes" bodyClassName="p-0" actions={<span className="text-xs text-ink-400">Signing is simulated — connect an eSignature provider to send for real.</span>}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-ink-100">
          <SearchInput value={q} onChange={setQ} placeholder="Search document, insured or signer…" className="w-full sm:w-72" />
          <Pills<ESignStatus | 'all'>
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'All', count: counts.total }, ...ESIGN_STATUSES.map((s) => ({ value: s, label: s, count: counts[s] }))]}
          />
        </div>
        <ErrorBanner message={docs.error} />
        <DataTable
          columns={columns}
          rows={rows}
          loading={docs.loading}
          initialSort={{ key: 'sent', dir: 'desc' }}
          empty={<EmptyState icon={<PenLine size={22} />} title={envelopes.length ? 'No envelopes match' : 'No signature requests yet'} message={envelopes.length ? 'Try a different status or search.' : 'Use “Send for eSignature” on any document to request a signature.'} />}
        />
      </Panel>
      {actions.modals}
    </div>
  );
}

// ── Page ──

type PageTab = 'all' | 'esign';

export function DocumentsPage() {
  const { params } = useRoute();
  const tab: PageTab = params.get('tab') === 'esign' ? 'esign' : 'all';
  const docs = useTable('documents');
  const counts = useESignCounts();

  return (
    <div className="min-w-0">
      <PageHeader title="Documents" icon={<FolderOpen size={20} />} subtitle="Agency document library and eSignature envelopes" />
      <Tabs<PageTab>
        className="mb-4"
        value={tab}
        onChange={(v) => setParam('tab', v === 'all' ? null : v)}
        tabs={[{ value: 'all', label: 'All Documents', count: docs.data.length }, { value: 'esign', label: 'eSignature', count: counts.Pending }]}
      />
      {tab === 'all' && <DocumentBrowser agencyWide />}
      {tab === 'esign' && <ESignDashboard />}
    </div>
  );
}
