import { Download, FileUp, MailX, MessageSquareOff, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  Button, DataTable, EmptyState, ErrorBanner, Field, IconButton, Input, Modal, PageHeader, Panel, SearchInput, Select, Tabs, useFeedback, type Column,
} from '@/components/ui';
import { db } from '@/lib/db';
import { downloadCsv, fmtDate, fmtPhone } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { setParam, useRoute } from '@/lib/router';
import type { Suppression } from '@/lib/types';
import { COMM_CRUMB, ReasonBadge, useSubmit } from './parts';
import { EMAIL_REASONS, SMS_REASONS, parseOneColumn } from './shared';
import { normalizePhone, suppressionKey, validateSuppressionAddress, type SuppressionChannel } from './suppression';

const display = (channel: SuppressionChannel, address: string) => (channel === 'SMS' ? fmtPhone(address) : address);
/** Stored form: emails lower-cased, phones as 10 digits. */
const stored = (channel: SuppressionChannel, address: string) => (channel === 'Email' ? address.trim().toLowerCase() : normalizePhone(address));

export function SuppressionPage() {
  const { params } = useRoute();
  const channel: SuppressionChannel = params.get('channel') === 'SMS' ? 'SMS' : 'Email';
  const { toast, confirm } = useFeedback();
  const all = useTable('suppressions', { order: { column: 'created_at', ascending: false } });
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const onChannel = all.data.filter((s) => s.channel === channel);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return all.data.filter((s) => {
      if (s.channel !== channel) return false;
      if (reason && s.reason !== reason) return false;
      if (!t) return true;
      return s.address.toLowerCase().includes(t) || (channel === 'SMS' && digits.length > 0 && normalizePhone(s.address).includes(digits));
    });
  }, [all.data, channel, q, reason]);

  const remove = async (s: Suppression) => {
    const ok = await confirm({
      title: 'Remove from suppression list?',
      message: channel === 'Email'
        ? <>{s.address} will be able to receive campaign emails again. Only remove an address when the client asked to resubscribe.</>
        : <>{display('SMS', s.address)} will be able to receive texts again. Only remove a number when the client opted back in (e.g. replied START).</>,
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try { await db.remove('suppressions', s.id); toast('Removed from suppression list'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const exportCsv = () => {
    if (!rows.length) { toast('Nothing to export', 'info'); return; }
    downloadCsv(`${channel.toLowerCase()}-suppression-list.csv`, rows.map((s) => ({ [channel === 'Email' ? 'email' : 'phone']: display(channel, s.address), reason: s.reason, added: s.created_at.slice(0, 10) })));
  };

  const reasons = channel === 'Email' ? EMAIL_REASONS : SMS_REASONS;
  const columns: Column<Suppression>[] = [
    { key: 'address', header: channel === 'Email' ? 'Email address' : 'Phone number', sortValue: (s) => s.address.toLowerCase(), render: (s) => <span className="font-semibold text-ink-900 break-all">{display(channel, s.address)}</span> },
    { key: 'reason', header: 'Reason', sortValue: (s) => s.reason, render: (s) => <ReasonBadge reason={s.reason} /> },
    { key: 'added', header: 'Added', sortValue: (s) => s.created_at, render: (s) => <span className="whitespace-nowrap text-ink-500">{fmtDate(s.created_at)}</span> },
    { key: 'x', header: '', align: 'right', render: (s) => <IconButton label="Remove" onClick={(e) => { e.stopPropagation(); void remove(s); }}><Trash2 size={15} /></IconButton> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Suppression List"
        icon={channel === 'Email' ? <MailX size={20} /> : <MessageSquareOff size={20} />}
        breadcrumb={[COMM_CRUMB]}
        subtitle={channel === 'Email' ? 'Addresses that never receive campaign emails — unsubscribes, repeated bounces and manual additions' : 'Numbers that opted out of texts (e.g. replied STOP). Texts to them are blocked.'}
        actions={<>
          <Button icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Button>
          <Button icon={<Upload size={14} />} onClick={() => setImporting(true)}>Import bulk</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add {channel === 'Email' ? 'address' : 'number'}</Button>
        </>}
      />
      <Tabs<SuppressionChannel>
        className="mb-3"
        value={channel}
        onChange={(v) => { setParam('channel', v); setReason(''); setQ(''); }}
        tabs={[
          { value: 'Email', label: 'Email', count: all.data.filter((s) => s.channel === 'Email').length },
          { value: 'SMS', label: 'SMS / Text', count: all.data.filter((s) => s.channel === 'SMS').length },
        ]}
      />
      <ErrorBanner message={all.error} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 p-3 border-b border-ink-100">
          <SearchInput value={q} onChange={setQ} placeholder={channel === 'Email' ? 'Search email…' : 'Search number…'} className="w-full sm:w-64" />
          <Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="All reasons" options={reasons} className="w-full sm:w-44" />
          <span className="sm:ml-auto self-center text-xs text-ink-400">{rows.length} of {onChannel.length}</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={all.loading}
          initialSort={{ key: 'added', dir: 'desc' }}
          empty={<EmptyState icon={channel === 'Email' ? <MailX size={22} /> : <MessageSquareOff size={22} />} title={onChannel.length ? 'No matches' : 'The list is empty'} message={onChannel.length ? 'Try a different search or reason.' : `Add ${channel === 'Email' ? 'addresses' : 'numbers'} one at a time or import a file.`} />}
        />
      </Panel>
      {adding && <AddModal channel={channel} existing={onChannel} onClose={() => setAdding(false)} />}
      {importing && <ImportModal channel={channel} existing={onChannel} onClose={() => setImporting(false)} />}
    </div>
  );
}

function AddModal({ channel, existing, onClose }: { channel: SuppressionChannel; existing: Suppression[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('Manual');
  const [err, setErr] = useState<string | null>(null);
  const { busy, error, submit } = useSubmit();

  const save = () => {
    const v = validateSuppressionAddress(channel, address);
    if (v) { setErr(v); return; }
    const key = suppressionKey(channel, address);
    if (existing.some((s) => suppressionKey(channel, s.address) === key)) { setErr('Already on the suppression list'); return; }
    void submit(async () => {
      // Re-check against the database in case another tab added it meanwhile.
      const fresh = await db.list('suppressions', { eq: { channel } });
      if (fresh.some((s) => suppressionKey(channel, s.address) === key)) throw new Error('Already on the suppression list');
      await db.insert('suppressions', { channel, address: stored(channel, address), reason });
      toast(`${channel === 'Email' ? 'Address' : 'Number'} suppressed`);
      onClose();
    });
  };

  return (
    <Modal title={`Add to ${channel} suppression list`} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>Add</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label={channel === 'Email' ? 'Email address' : 'Mobile number'} required error={err}>
          <Input value={address} autoFocus type={channel === 'Email' ? 'email' : 'tel'} placeholder={channel === 'Email' ? 'name@example.com' : '(512) 555-0100'} onChange={(e) => { setAddress(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </Field>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} options={channel === 'Email' ? EMAIL_REASONS : SMS_REASONS} />
        </Field>
      </div>
    </Modal>
  );
}

type Parsed = { valid: string[]; skipped: { line: number; value: string; why: string }[]; header: string };

function ImportModal({ channel, existing, onClose }: { channel: SuppressionChannel; existing: Suppression[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reason, setReason] = useState('Manual');
  const [readErr, setReadErr] = useState<string | null>(null);
  const { busy, error, submit } = useSubmit();

  const parse = (text: string): Parsed => {
    const cells = parseOneColumn(text);
    const [header = '', ...rest] = cells; // the first row is always the header
    const seen = new Set(existing.map((s) => suppressionKey(channel, s.address)));
    const valid: string[] = [];
    const skipped: Parsed['skipped'] = [];
    rest.forEach((value, i) => {
      const line = i + 2;
      if (!value) return; // blank line
      const err = validateSuppressionAddress(channel, value);
      if (err) { skipped.push({ line, value, why: channel === 'Email' ? 'Invalid email' : 'Invalid phone' }); return; }
      const key = suppressionKey(channel, value);
      if (seen.has(key)) { skipped.push({ line, value, why: valid.some((v) => suppressionKey(channel, v) === key) ? 'Duplicate in file' : 'Already on list' }); return; }
      seen.add(key);
      valid.push(value);
    });
    return { valid, skipped, header };
  };

  const onFile = (f: File | undefined) => {
    setReadErr(null);
    setParsed(null);
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) { setReadErr('Choose a .csv or .txt file'); return; }
    if (f.size > 2 * 1024 * 1024) { setReadErr('File is larger than 2 MB'); return; }
    setFileName(f.name);
    f.text().then((t) => setParsed(parse(t))).catch(() => setReadErr('Could not read the file'));
  };

  const headerLooksLikeData = parsed ? !validateSuppressionAddress(channel, parsed.header) : false;

  const run = () => {
    if (!parsed?.valid.length) return;
    void submit(async () => {
      const fresh = await db.list('suppressions', { eq: { channel } });
      const have = new Set(fresh.map((s) => suppressionKey(channel, s.address)));
      const rows = parsed.valid.filter((v) => !have.has(suppressionKey(channel, v))).map((v) => ({ channel, address: stored(channel, v), reason }));
      for (let i = 0; i < rows.length; i += 200) await db.insertMany('suppressions', rows.slice(i, i + 200));
      const skipped = parsed.skipped.length + (parsed.valid.length - rows.length);
      toast(`Imported ${rows.length} ${channel === 'Email' ? 'address' : 'number'}${rows.length === 1 ? '' : 'es'}${skipped ? ` · ${skipped} skipped` : ''}`);
      onClose();
    });
  };

  return (
    <Modal title={`Import ${channel} suppression list`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!parsed?.valid.length} icon={<Upload size={14} />} onClick={run}>Import {parsed?.valid.length ?? ''}</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error || readErr} />
        <div className="text-[13px] text-ink-600 bg-ink-50 border border-ink-100 rounded px-3 py-2 space-y-1">
          <div className="font-semibold text-ink-800">File format</div>
          <div>A .csv or .txt file with <b>one column</b> of {channel === 'Email' ? 'email addresses' : 'phone numbers'} and a <b>header row</b> (e.g. <code className="font-mono text-xs">{channel === 'Email' ? 'email' : 'phone'}</code>).</div>
          <div className="text-xs text-ink-500">The first row is always treated as the header — without one, your first {channel === 'Email' ? 'address' : 'number'} would be skipped. Other columns are ignored.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<FileUp size={14} />} onClick={() => fileRef.current?.click()}>{fileName ? 'Choose another file' : 'Choose file'}</Button>
          {fileName && <span className="text-xs text-ink-500 truncate max-w-[240px]">{fileName}</span>}
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {parsed && (
          <>
            {headerLooksLikeData && <ErrorBanner message={`The first row (“${parsed.header}”) looks like ${channel === 'Email' ? 'an email address' : 'a phone number'}, not a header. It was treated as the header and will not be imported — add a header row and re-import if you need it.`} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-emerald-200 bg-emerald-50 rounded px-3 py-2"><div className="text-xl font-semibold text-emerald-700 tabular-nums">{parsed.valid.length}</div><div className="text-[11px] uppercase font-semibold tracking-wide text-emerald-700">Ready to import</div></div>
              <div className="border border-amber-200 bg-amber-50 rounded px-3 py-2"><div className="text-xl font-semibold text-amber-700 tabular-nums">{parsed.skipped.length}</div><div className="text-[11px] uppercase font-semibold tracking-wide text-amber-700">Skipped</div></div>
            </div>
            <Field label="Reason for imported rows">
              <Select value={reason} onChange={(e) => setReason(e.target.value)} options={channel === 'Email' ? EMAIL_REASONS : SMS_REASONS} />
            </Field>
            {parsed.skipped.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Skipped rows</div>
                <ul className="border border-ink-100 rounded divide-y divide-ink-50 max-h-48 overflow-y-auto text-[13px]">
                  {parsed.skipped.map((s) => (
                    <li key={s.line} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-ink-400 text-xs w-14 shrink-0">Row {s.line}</span>
                      <span className="truncate flex-1 text-ink-800">{s.value}</span>
                      <span className="text-xs text-amber-700 whitespace-nowrap">{s.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
