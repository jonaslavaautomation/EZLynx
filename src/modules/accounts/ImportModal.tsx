import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, ErrorBanner, Modal, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { downloadCsv, fmtPhone } from '@/lib/format';
import type { Account, AccountStatus } from '@/lib/types';

/* Bulk-create applicants from a CSV file (columns matched by header name, case-insensitive). */

const TEMPLATE_COLUMNS = ['type', 'first_name', 'last_name', 'business_name', 'email', 'phone', 'mobile_phone', 'address', 'city', 'state', 'zip', 'dob', 'status', 'lead_source', 'notes'];
const ALIASES: Record<string, string> = {
  'first name': 'first_name', firstname: 'first_name', 'last name': 'last_name', lastname: 'last_name', business: 'business_name', 'business name': 'business_name',
  company: 'business_name', 'e-mail': 'email', 'email address': 'email', mobile: 'mobile_phone', cell: 'mobile_phone', 'street': 'address', 'address 1': 'address',
  'zip code': 'zip', zipcode: 'zip', 'postal code': 'zip', 'date of birth': 'dob', birthdate: 'dob', 'account type': 'type', source: 'lead_source',
};
const STATUSES: AccountStatus[] = ['Prospect', 'Active', 'Pending', 'Inactive'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Accepts YYYY-MM-DD or M/D/YYYY; returns YYYY-MM-DD or null. */
function toDate(v: string) {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

type Parsed = { ok: Partial<Account>[]; errors: string[] };

function toAccounts(rows: string[][], producer: string | null): Parsed {
  const [header, ...body] = rows;
  const cols = header.map((h) => { const k = h.trim().toLowerCase(); return ALIASES[k] ?? k.replace(/\s+/g, '_'); });
  const ok: Partial<Account>[] = [];
  const errors: string[] = [];
  body.forEach((r, i) => {
    const get = (k: string) => (r[cols.indexOf(k)] ?? '').trim();
    const line = i + 2;
    const commercial = /^c/i.test(get('type')) || (!!get('business_name') && !get('first_name'));
    const first = get('first_name'), last = get('last_name'), email = get('email');
    if (commercial && !get('business_name')) return errors.push(`Row ${line}: commercial applicant needs a business name`);
    if (!commercial && (!first || !last)) return errors.push(`Row ${line}: first and last name are required`);
    if (email && !EMAIL_RE.test(email)) return errors.push(`Row ${line}: invalid email "${email}"`);
    const dob = get('dob') ? toDate(get('dob')) : null;
    if (get('dob') && !dob) return errors.push(`Row ${line}: date of birth must be YYYY-MM-DD or MM/DD/YYYY`);
    const status = STATUSES.find((s) => s.toLowerCase() === get('status').toLowerCase()) ?? 'Prospect';
    const n = (v: string) => v || null;
    ok.push({
      account_type: commercial ? 'Commercial' : 'Personal', first_name: first || get('business_name'), last_name: last || '', business_name: commercial ? get('business_name') : null,
      email: email || '', phone: n(fmtPhone(get('phone'))), mobile_phone: n(fmtPhone(get('mobile_phone'))), address: n(get('address')), city: n(get('city')),
      state: n(get('state').toUpperCase().slice(0, 2)), zip: n(get('zip')), dob: commercial ? null : dob, status, lead_source: n(get('lead_source')), notes: n(get('notes')),
      producer, csr: null, policy_type: commercial ? 'Commercial' : null, marital_status: null, occupation: null,
    });
  });
  return { ok, errors };
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The file has no data rows. The first row must be column headers.');
      setParsed(toAccounts(rows, me?.name ?? null));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = async () => {
    if (!parsed?.ok.length) return;
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < parsed.ok.length; i += 200) await db.insertMany('accounts', parsed.ok.slice(i, i + 200));
      toast(`Imported ${parsed.ok.length} applicant${parsed.ok.length === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const template = () => downloadCsv('applicant-import-template.csv', [
    Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c, { type: 'Personal', first_name: 'Jane', last_name: 'Sample', email: 'jane.sample@example.com', phone: '(512) 555-0100', address: '100 Main St', city: 'Austin', state: 'TX', zip: '78701', dob: '1990-04-15', status: 'Prospect', lead_source: 'Referral' }[c] ?? ''])),
  ]);

  return (
    <Modal
      title="Import applicants"
      subtitle="Create many applicants at once from a CSV file."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!parsed?.ok.length} onClick={run}>
          {parsed?.ok.length ? `Import ${parsed.ok.length} applicant${parsed.ok.length === 1 ? '' : 's'}` : 'Import'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <div className="text-[13px] text-ink-600">
          The first row must be column headers. Recognized columns: <span className="font-mono text-xs">{TEMPLATE_COLUMNS.join(', ')}</span>.
          Rows with a <span className="font-mono text-xs">business_name</span> and type "Commercial" become commercial applicants.
        </div>
        <Button size="sm" icon={<Download size={13} />} onClick={template}>Download template</Button>
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-ink-200 hover:border-brand-300 rounded p-6 text-center bg-ink-50/50">
          <FileUp size={22} className="mx-auto text-ink-400 mb-2" />
          <div className="text-[13px] font-semibold text-ink-800">{fileName ?? 'Choose a CSV file'}</div>
          <div className="text-xs text-ink-400">.csv, up to a few thousand rows</div>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {parsed && (
          <div className="text-[13px]">
            <div className="text-emerald-700 font-semibold">{parsed.ok.length} row{parsed.ok.length === 1 ? '' : 's'} ready to import</div>
            {parsed.errors.length > 0 && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 max-h-40 overflow-y-auto">
                <div className="font-semibold mb-1">{parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'} will be skipped:</div>
                {parsed.errors.slice(0, 50).map((e) => <div key={e} className="text-xs">{e}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
