import { Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { accountName, fmtPhone } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import type { Account } from '@/lib/types';
import { sendMessage, validateAddress, type Channel } from '@/modules/messages/shared';

const SMS_MAX = 1600;

/** Right-hand "Reply To Text" / "Send Email" panel opened from the applicant panel's text and email icons. */
export function ComposeDrawer({ account, channel, draft, onClose }: { account: Account; channel: Channel; draft?: string; onClose: () => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const contacts = useTable('account_contacts', { eq: { account_id: account.id } });
  const docs = useTable('documents', { eq: { account_id: account.id }, order: { column: 'created_at', ascending: false } });
  const sms = channel === 'SMS';
  const options = useMemo(() => {
    const list: { value: string; label: string; name: string }[] = [];
    const add = (name: string, value: string | null | undefined, kind: string) => {
      if (!value || list.some((o) => o.value === value)) return;
      list.push({ value, name, label: `${name} - ${kind}: ${sms ? fmtPhone(value) : value}` });
    };
    const self = accountName(account);
    if (sms) { add(self, account.mobile_phone, 'Mobile'); add(self, account.phone, 'Phone'); } else add(self, account.email, 'Email');
    for (const c of contacts.data) {
      const n = `${c.first_name} ${c.last_name}`.trim();
      if (sms) { add(n, c.mobile_phone, 'Mobile'); add(n, c.phone, 'Phone'); } else add(n, c.email, 'Email');
    }
    return list;
  }, [account, contacts.data, sms]);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(draft ?? '');
  const [attach, setAttach] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!to && options[0]) setTo(options[0].value); }, [options, to]);
  useEffect(() => { document.body.classList.add('side-panel-open'); return () => document.body.classList.remove('side-panel-open'); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const attachedNames = attach.map((id) => docs.data.find((d) => d.id === id)?.name).filter(Boolean) as string[];
  const fullBody = attachedNames.length ? `${body.trim()}\n\nAttached: ${attachedNames.join(', ')}` : body.trim();
  const send = async () => {
    const who = options.find((o) => o.value === to);
    const bad = validateAddress(channel, to);
    if (bad) { setError(options.length ? bad : `${accountName(account)} has no ${sms ? 'mobile number' : 'email address'} on file. Add one under Details.`); return; }
    if (!body.trim()) { setError('Type a message.'); return; }
    if (sms && fullBody.length > SMS_MAX) { setError(`Text messages can be up to ${SMS_MAX} characters.`); return; }
    if (!sms && !subject.trim()) { setError('Add a subject.'); return; }
    setBusy(true); setError(null);
    try {
      await sendMessage(account, { channel, to, subject, body: fullBody, agent: me?.name ?? null });
      toast(`${sms ? 'SMS' : 'Email'} sent successfully to ${who?.name ?? accountName(account)}`);
      onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="fixed top-[50px] right-0 bottom-[28px] z-[120] w-full sm:w-[400px] bg-white border-l border-ink-200 shadow-pop flex flex-col" role="dialog" aria-label={sms ? 'Reply To Text' : 'Send Email'}>
      <div className="flex items-center h-10 px-3 bg-[#2d3740] text-white">
        <div className="text-[13px] font-bold">{sms ? 'Reply To Text' : 'Send Email'}</div>
        <button type="button" aria-label="Close" className="ml-auto text-white/80 hover:text-white" onClick={onClose} disabled={busy}><X size={17} /></button>
      </div>
      <div className="p-3">
        <label className="relative block">
          <span className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-ink-600">Reply To</span>
          <select aria-label="Reply To" className="w-full h-10 rounded border border-ink-300 bg-white px-2 text-[13px] outline-none focus:border-brand-500" value={to} onChange={(e) => setTo(e.target.value)}>
            {!options.length && <option value="">No {sms ? 'mobile number' : 'email'} on file</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {!sms && (
          <label className="relative block mt-4">
            <span className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-ink-600">Subject<span className="text-red-600">*</span></span>
            <input aria-label="Subject" className="w-full h-10 rounded border border-ink-300 px-2 text-[13px] outline-none focus:border-brand-500" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
          </label>
        )}
      </div>
      <div className="flex-1" />
      <div className="p-3 border-t border-ink-100">
        {error && <div className="mb-2 rounded bg-red-50 border border-red-200 px-2.5 py-1.5 text-[12px] text-red-700" role="alert">{error}</div>}
        {attachedNames.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{attach.map((id) => { const d = docs.data.find((x) => x.id === id); return d ? <span key={id} className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-[11.5px]">{d.name}<button type="button" aria-label={`Remove ${d.name}`} onClick={() => setAttach(attach.filter((x) => x !== id))}><X size={11} /></button></span> : null; })}</div>}
        <label className="relative block">
          <span className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-ink-600">{sms ? 'Text Message' : 'Message'}<span className="text-red-600">*</span></span>
          <textarea aria-label={sms ? 'Text Message' : 'Message'} rows={sms ? 4 : 8} maxLength={sms ? SMS_MAX : 10000} className="w-full rounded border border-brand-500 p-2 text-[13px] outline-none" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {sms && <div className={cx('text-right text-[11px]', fullBody.length > SMS_MAX ? 'text-red-600' : 'text-ink-500')} data-testid="sms-count">{fullBody.length}/{SMS_MAX}</div>}
        <div className="flex items-center gap-3 mt-2">
          <button type="button" aria-label="Attach a document" title="Attach a document from this insured's Document Library" onClick={() => setPicking(true)} className="text-ink-600 hover:text-ink-900"><Paperclip size={17} /></button>
          <button type="button" className="text-[11.5px] text-brand-700 hover:underline mx-auto" onClick={() => setTerms(true)}>Terms &amp; Conditions</button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void send()} className="tracking-wider">SEND</Button>
        </div>
      </div>
      {picking && (
        <Modal title="Attach a document" size="sm" onClose={() => setPicking(false)} footer={<Button variant="primary" onClick={() => setPicking(false)}>Done</Button>}>
          {docs.data.length === 0 ? <p className="text-[13px] text-ink-500">This insured has no documents yet. Upload one in the Documents tab.</p> : (
            <ul className="max-h-[320px] overflow-y-auto divide-y divide-ink-100 border border-ink-100 rounded">
              {docs.data.map((d) => (
                <li key={d.id}><label className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer"><input type="checkbox" className="accent-[#007a78]" checked={attach.includes(d.id)} onChange={(e) => setAttach(e.target.checked ? [...attach, d.id] : attach.filter((x) => x !== d.id))} /><span className="truncate">{d.name}</span></label></li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {terms && (
        <Modal title="Texting terms & conditions" size="sm" onClose={() => setTerms(false)} footer={<Button onClick={() => setTerms(false)}>Close</Button>}>
          <div className="space-y-2 text-[13px] text-ink-700">
            <p>Only text customers who have agreed to receive text messages from the agency. Customers can reply STOP at any time to opt out, and opted-out numbers are blocked automatically (Communication Center → Suppression list).</p>
            <p>Don&rsquo;t send full policy numbers with personal details, Social Security numbers, or payment card numbers by text. Message and data rates may apply for the customer.</p>
            <p className="text-ink-500">Training portal: messages are recorded on the insured&rsquo;s Messages tab; delivery is simulated.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
