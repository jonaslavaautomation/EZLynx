import {
  AlignCenter, AlignLeft, AlignRight, Bold, Code, Image as ImageIcon, IndentDecrease, IndentIncrease, Italic, Link2, List,
  ListOrdered, Lock, Strikethrough, Table, Trash2, Underline, Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { OInput } from '@/modules/accounts/applicant-fields';
import { acordOf, defaultSettingsFor, defaultSignatureHtml, effectiveSignature, sanitizeHtml, useAllSettings, useMySettings, type AcordSettings } from '@/modules/usersettings/data';
import { Check, H, InfoNote, Radios, SaveBar, useDraft } from '@/modules/usersettings/parts';

const MAX_IMAGE = 300 * 1024;

// ── ACORD Forms ──

export function AcordTab() {
  const { me, row, save } = useMySettings();
  const { toast, confirm } = useFeedback();
  const d = useDraft<AcordSettings>({ ...acordOf(row), signature_text: acordOf(row).signature_text || me!.name });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = d.v;

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) { toast('Choose a PNG, JPG, GIF or WebP image.', 'error'); return; }
    if (f.size > MAX_IMAGE) { toast('Signature images must be 300 KB or smaller.', 'error'); return; }
    const r = new FileReader();
    r.onload = () => d.set({ signature_image: String(r.result), signature_mode: 'upload' });
    r.readAsDataURL(f);
  };

  const onSave = async () => {
    if (v.signature_mode === 'type' && !v.signature_text.trim()) { toast('Type your signature or switch to Upload.', 'error'); return; }
    if (v.signature_mode === 'upload' && !v.signature_image) { toast('Upload a signature image or switch to Type.', 'error'); return; }
    setBusy(true);
    try {
      const next = { ...v, signature_text: v.signature_text.trim() };
      await save({ acord: next });
      d.commit(next);
      toast('ACORD form settings saved.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete signature?', message: 'Your saved signature will be removed from ACORD forms.', confirmLabel: 'Delete', danger: true }))) return;
    setBusy(true);
    try {
      const next = { ...v, signature_text: '', signature_image: null, signature_mode: 'type' as const };
      await save({ acord: next });
      d.commit(next);
      toast('Signature deleted.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <H>ACORD Forms</H>
      <h3 className="text-[15px] font-medium text-ink-900 mb-2">Preferred address on ACORD forms</h3>
      <Radios name="preferred_address" value={v.preferred_address} onChange={(x) => d.set({ preferred_address: x })}
        options={[{ value: 'applicant', label: 'Applicant' }, { value: 'agency', label: 'Agency' }, { value: 'producer', label: 'Producer' }]} />

      <h3 className="text-[15px] font-medium text-ink-900 mt-7 mb-1">Signature</h3>
      <Check label="Allow other users in my agency to use my signature on ACORD forms" checked={v.share_signature} onChange={(x) => d.set({ share_signature: x })} />
      <div className="mt-3">
        <Radios name="signature_mode" value={v.signature_mode} onChange={(x) => d.set({ signature_mode: x })}
          options={[{ value: 'type', label: 'Type signature' }, { value: 'upload', label: 'Upload signature' }]} />
      </div>

      <div className="mt-5 max-w-[620px]">
        {v.signature_mode === 'type' ? (
          <OInput label="Signature" value={v.signature_text} onChange={(x) => d.set({ signature_text: x })} maxLength={60} />
        ) : (
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>{v.signature_image ? 'Replace image' : 'Choose image'}</Button>
            <span className="text-xs text-ink-500">PNG, JPG, GIF or WebP, up to 300 KB.</span>
          </div>
        )}
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Preview</div>
        <div className="mt-1 h-[110px] rounded border border-dashed border-ink-300 bg-white grid place-items-center px-4 overflow-hidden" data-testid="signature-preview">
          {v.signature_mode === 'type'
            ? (v.signature_text.trim() ? <span className="font-signature text-[40px] text-ink-900 leading-none truncate max-w-full">{v.signature_text}</span> : <span className="text-[13px] text-ink-400">Type your name to preview</span>)
            : (v.signature_image ? <img src={v.signature_image} alt="Signature" className="max-h-[90px] max-w-full object-contain" /> : <span className="text-[13px] text-ink-400">No image uploaded</span>)}
        </div>
        {(acordOf(row).signature_text || acordOf(row).signature_image) && (
          <button type="button" onClick={onDelete} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:underline disabled:opacity-50">
            <Trash2 size={14} /> Delete signature
          </button>
        )}
      </div>
      <SaveBar onSave={onSave} onReset={d.reset} busy={busy} dirty={d.dirty} />
    </div>
  );
}

// ── Email Signature ──

const FONTS = ['Arial', 'Georgia', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New'];
const SIZES = [{ v: '2', l: 'Small' }, { v: '3', l: 'Normal' }, { v: '4', l: 'Large' }, { v: '5', l: 'Larger' }, { v: '6', l: 'Huge' }];
const SMART_TAG = '{agent_signature}';

function TB({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={cx('w-8 h-8 grid place-items-center rounded text-ink-700 hover:bg-ink-100', active && 'bg-ink-200')}>
      {children}
    </button>
  );
}

export function EmailSignatureTab() {
  const { me, row, save } = useMySettings();
  const all = useAllSettings();
  const { settings: agency } = useAppData();
  const { toast } = useFeedback();
  const base = { ...defaultSettingsFor(me!), ...row };
  const locked = effectiveSignature(row, all).lockedBy;
  const lockedRow = locked ? all.get(locked) ?? null : null;

  const d = useDraft({
    reply_to: base.reply_to ?? '',
    html: base.email_signature ?? defaultSignatureHtml(base, agency),
    signature_insert: (base.signature_insert ?? 'smart_tag') as 'auto' | 'smart_tag',
    signature_global_default: !!base.signature_global_default,
    display_global: !!base.display_global,
  });
  const v = d.v;
  const [source, setSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const ed = useRef<HTMLDivElement>(null);

  // Keep the editable surface in sync when the draft changes from outside (reset, source view, first load).
  useEffect(() => {
    if (!source && ed.current && ed.current.innerHTML !== v.html) ed.current.innerHTML = sanitizeHtml(v.html);
  }, [v.html, source]);

  const pull = () => { if (ed.current) d.set({ html: ed.current.innerHTML }); };
  const exec = (cmd: string, arg?: string) => {
    ed.current?.focus();
    document.execCommand(cmd, false, arg);
    pull();
  };
  const insertHtml = (html: string) => exec('insertHTML', html);

  const replyErr = !v.reply_to.trim() ? 'Reply To is required' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.reply_to.trim()) ? 'Enter a valid email address' : null;

  const onSave = async () => {
    setTried(true);
    if (replyErr) { toast(replyErr, 'error'); return; }
    setBusy(true);
    try {
      const html = sanitizeHtml(v.html);
      await save({ reply_to: v.reply_to.trim(), email_signature: html, signature_insert: v.signature_insert, signature_global_default: v.signature_global_default, display_global: v.signature_global_default && v.display_global });
      d.commit({ ...v, html, reply_to: v.reply_to.trim(), display_global: v.signature_global_default && v.display_global });
      if (ed.current) ed.current.innerHTML = html;
      setTried(false);
      toast('Email signature saved.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  if (locked) {
    return (
      <div>
        <H>Email Signature</H>
        <InfoNote>
          <span className="inline-flex items-center gap-1.5"><Lock size={14} /> {locked} set their signature as the agency-wide default, so it is used for everyone and can't be edited here.</span>
        </InfoNote>
        <div className="rounded border border-ink-200 bg-white p-4 max-w-[900px] text-[14px] min-h-[120px]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(lockedRow?.email_signature ?? '') }} />
      </div>
    );
  }

  return (
    <div>
      <H>Email Signature</H>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[900px] mb-5">
        <OInput label="Reply To" type="email" inputMode="email" required="proceed" value={v.reply_to} onChange={(x) => d.set({ reply_to: x })}
          {...(tried && replyErr ? { level: 'proceed' as const, message: replyErr } : {})} />
      </div>

      <div className="rounded border border-ink-300 bg-white max-w-[900px]">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-ink-50 px-1.5 py-1" role="toolbar" aria-label="Formatting">
          <TB label={source ? 'Rich text' : 'Source'} active={source} onClick={() => { if (source) d.set({ html: sanitizeHtml(v.html) }); else pull(); setSource(!source); }}><Code size={15} /></TB>
          {!source && <>
            <span className="w-px h-5 bg-ink-200 mx-1" />
            <TB label="Bold" onClick={() => exec('bold')}><Bold size={15} /></TB>
            <TB label="Italic" onClick={() => exec('italic')}><Italic size={15} /></TB>
            <TB label="Underline" onClick={() => exec('underline')}><Underline size={15} /></TB>
            <TB label="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough size={15} /></TB>
            <span className="w-px h-5 bg-ink-200 mx-1" />
            <TB label="Align left" onClick={() => exec('justifyLeft')}><AlignLeft size={15} /></TB>
            <TB label="Align center" onClick={() => exec('justifyCenter')}><AlignCenter size={15} /></TB>
            <TB label="Align right" onClick={() => exec('justifyRight')}><AlignRight size={15} /></TB>
            <TB label="Bulleted list" onClick={() => exec('insertUnorderedList')}><List size={15} /></TB>
            <TB label="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></TB>
            <TB label="Decrease indent" onClick={() => exec('outdent')}><IndentDecrease size={15} /></TB>
            <TB label="Increase indent" onClick={() => exec('indent')}><IndentIncrease size={15} /></TB>
            <span className="w-px h-5 bg-ink-200 mx-1" />
            <label className="inline-flex items-center gap-1 text-[12px] text-ink-600 px-1" title="Text color">A
              <input type="color" aria-label="Text color" className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" onChange={(e) => exec('foreColor', e.target.value)} />
            </label>
            <label className="inline-flex items-center gap-1 text-[12px] text-ink-600 px-1" title="Highlight color">
              <span className="bg-yellow-200 px-0.5">A</span>
              <input type="color" aria-label="Highlight color" defaultValue="#ffff00" className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" onChange={(e) => exec('hiliteColor', e.target.value)} />
            </label>
            <select aria-label="Font" defaultValue="" onChange={(e) => { if (e.target.value) exec('fontName', e.target.value); e.target.value = ''; }} className="h-7 text-[12px] border border-ink-200 rounded px-1 bg-white">
              <option value="">Font</option>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select aria-label="Size" defaultValue="" onChange={(e) => { if (e.target.value) exec('fontSize', e.target.value); e.target.value = ''; }} className="h-7 text-[12px] border border-ink-200 rounded px-1 bg-white ml-1">
              <option value="">Size</option>{SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
            <span className="w-px h-5 bg-ink-200 mx-1" />
            <TB label="Link" onClick={() => { const u = window.prompt('Link URL (https:// or mailto:)'); if (u && /^(https?:|mailto:)/i.test(u.trim())) exec('createLink', u.trim()); else if (u) toast('Links must start with https://, http:// or mailto:', 'error'); }}><Link2 size={15} /></TB>
            <TB label="Table" onClick={() => insertHtml('<table border="1" cellpadding="4" style="border-collapse: collapse"><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><br>')}><Table size={15} /></TB>
            <TB label="Image" onClick={() => { const u = window.prompt('Image URL (https://)'); if (u && /^https?:/i.test(u.trim())) insertHtml(`<img src="${u.trim().replace(/"/g, '%22')}" alt="" style="max-width:300px">`); else if (u) toast('Image URLs must start with https://', 'error'); }}><ImageIcon size={15} /></TB>
            <select aria-label="Insert smart tag" defaultValue="" onChange={(e) => { if (e.target.value) insertHtml(e.target.value); e.target.value = ''; }} className="h-7 text-[12px] border border-ink-200 rounded px-1 bg-white ml-1">
              <option value="">Insert smart tag</option>
              <option value="{agent_name}">Agent name</option>
              <option value="{agent_email}">Agent email</option>
              <option value="{agent_phone}">Agent phone</option>
              <option value="{agency_name}">Agency name</option>
              <option value="{agency_phone}">Agency phone</option>
            </select>
          </>}
        </div>
        {source ? (
          <textarea aria-label="Signature HTML source" value={v.html} onChange={(e) => d.set({ html: e.target.value })} spellCheck={false}
            className="block w-full min-h-[220px] p-3 font-mono text-[12px] outline-none resize-y" />
        ) : (
          <div ref={ed} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Signature editor" onInput={pull} onBlur={pull}
            className="min-h-[220px] p-3 text-[14px] text-ink-900 outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-blue-700 [&_a]:underline [&_td]:border [&_td]:border-ink-300 [&_td]:p-1" />
        )}
      </div>
      <div className="flex gap-3 mt-2 max-w-[900px]">
        <button type="button" className="text-[13px] text-brand-700 hover:underline" onClick={() => { const h = defaultSignatureHtml(base, agency); d.set({ html: h }); }}>Use default signature</button>
      </div>

      <h3 className="text-[15px] font-medium text-ink-900 mt-6 mb-2">When sending email</h3>
      <Radios name="signature_insert" value={v.signature_insert} onChange={(x) => d.set({ signature_insert: x })}
        options={[{ value: 'auto', label: 'Automatically add my signature to every email' }, { value: 'smart_tag', label: `Only where the ${SMART_TAG} smart tag is used` }]} />
      <div className="mt-4">
        <Check label="Use my signature as the default for all users in my agency" checked={v.signature_global_default} onChange={(x) => d.set({ signature_global_default: x, display_global: x && v.display_global })} />
        <Check label="Also apply my insert rule to all users" checked={v.display_global} disabled={!v.signature_global_default} onChange={(x) => d.set({ display_global: x })} />
      </div>
      <SaveBar onSave={onSave} onReset={() => { d.reset(); setTried(false); }} busy={busy} dirty={d.dirty} />
    </div>
  );
}
