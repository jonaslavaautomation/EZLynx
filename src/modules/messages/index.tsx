import { AlertCircle, ArrowLeft, Check, CheckCheck, Info, Mail, MessageSquare, MessageSquareText, Plus, Reply, Send, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AccountPicker } from '@/components/pickers';
import {
  Avatar, Badge, Button, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Modal, PageHeader, Pills, SearchInput, Select, Textarea, cx, useFeedback,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName, fmtDateTime, fmtPhone, fmtRelative, parseDate } from '@/lib/format';
import { useRow, useTable } from '@/lib/hooks';
import { href, setParam, useRoute } from '@/lib/router';
import type { Account, Message } from '@/lib/types';
import { MESSAGE_TEMPLATES, defaultAddress, fillTemplate, sendMessage, smsInfo, validateAddress, type Channel, type MessageTemplate } from './shared';

/** Unread inbound message count, for the topbar badge. */
export function useUnreadMessageCount() {
  const { data } = useTable('messages', { eq: { read: false, direction: 'Inbound' } });
  return data.length;
}

const SIMULATED_NOTE = 'Delivery is simulated — connect an SMS/email provider to send for real.';

/** Built-in templates plus the agency's saved templates (Communication Center → Text Templates) for a channel. */
function useTemplates(channel: Channel): MessageTemplate[] {
  const saved = useTable('message_templates', { eq: { channel }, order: { column: 'name' } });
  return useMemo(() => [
    ...MESSAGE_TEMPLATES,
    ...saved.data.map((t) => ({ id: `saved:${t.id}`, label: `Saved: ${t.name}`, subject: t.subject ?? '', body: t.body })),
  ], [saved.data]);
}

function smsHint(body: string) {
  const s = smsInfo(body);
  return `${s.units}/${s.limit}${s.unicode ? ' (Unicode)' : ''}${s.segments > 1 ? ` · ${s.segments} segments` : ''}`;
}

type Filter = 'all' | 'unread' | 'sms' | 'email';
type Conversation = { account: Account | null; accountId: string; last: Message | null; unread: number; channels: Set<Channel> };

// ── Inbox ──

export function MessagesPage({ accountId }: { accountId: string | null }) {
  const messages = useTable('messages', { order: { column: 'created_at', ascending: false } });
  const ids = useMemo(() => [...new Set(messages.data.map((m) => m.account_id))].sort(), [messages.data]);
  const accounts = useTable('accounts', ids.length ? { in: { column: 'id', values: ids } } : null);
  const selected = useRow('accounts', accountId);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [composeState, setComposeOpen] = useState(false);
  const { params } = useRoute();
  const composeParam = params.get('compose') === '1';
  const composeOpen = composeState || composeParam;
  const closeCompose = () => { setComposeOpen(false); if (composeParam) setParam('compose', null); };

  const conversations = useMemo(() => {
    const byId = new Map(accounts.data.map((a) => [a.id, a]));
    const map = new Map<string, Conversation>();
    for (const m of messages.data) {
      let c = map.get(m.account_id);
      if (!c) { c = { account: byId.get(m.account_id) ?? null, accountId: m.account_id, last: m, unread: 0, channels: new Set() }; map.set(m.account_id, c); }
      if (m.direction === 'Inbound' && !m.read) c.unread++;
      c.channels.add(m.channel);
    }
    const list = [...map.values()];
    if (accountId && !map.has(accountId) && selected.data) list.unshift({ account: selected.data, accountId, last: null, unread: 0, channels: new Set() });
    return list;
  }, [messages.data, accounts.data, accountId, selected.data]);

  const counts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter((c) => c.unread > 0).length,
    sms: conversations.filter((c) => c.channels.has('SMS')).length,
    email: conversations.filter((c) => c.channels.has('Email')).length,
  }), [conversations]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unread === 0) return false;
      if (filter === 'sms' && !c.channels.has('SMS')) return false;
      if (filter === 'email' && !c.channels.has('Email')) return false;
      if (!t) return true;
      const a = c.account;
      return [accountName(a), a?.email, a?.phone, a?.mobile_phone, c.last?.body, c.last?.subject].some((s) => (s ?? '').toLowerCase().includes(t));
    });
  }, [conversations, filter, q]);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Messages"
        icon={<MessageSquareText size={20} />}
        subtitle={totalUnread ? `${totalUnread} unread ${totalUnread === 1 ? 'reply' : 'replies'}` : 'Text and email your clients'}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setComposeOpen(true)}>New message</Button>}
      />
      <ErrorBanner message={messages.error} />
      <div className="bg-white border border-[#e3e3e3] rounded shadow-card flex h-[calc(100vh-190px)] min-h-[480px] overflow-hidden">
        {/* Conversation list */}
        <aside className={cx('w-full md:w-80 lg:w-96 md:border-r border-ink-100 flex-col min-w-0 shrink-0', accountId ? 'hidden md:flex' : 'flex')}>
          <div className="p-3 border-b border-ink-100 space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search conversations…" />
            <Pills<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'unread', label: 'Unread', count: counts.unread },
                { value: 'sms', label: 'SMS', count: counts.sms },
                { value: 'email', label: 'Email', count: counts.email },
              ]}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {messages.loading ? <LoadingBlock /> : visible.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title={conversations.length ? 'No matching conversations' : 'No conversations yet'}
                message={conversations.length ? 'Try a different search or filter.' : 'Start a text or email thread with a client.'}
                action={!conversations.length && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setComposeOpen(true)}>New message</Button>}
              />
            ) : visible.map((c) => (
              <ConversationRow key={c.accountId} c={c} active={c.accountId === accountId} onClick={() => setParam('account', c.accountId)} />
            ))}
          </div>
        </aside>

        {/* Thread */}
        <div className={cx('flex-1 min-w-0 flex-col', accountId ? 'flex' : 'hidden md:flex')}>
          {accountId ? (
            <MessageThread key={accountId} accountId={accountId} onBack={() => setParam('account', null)} className="h-full" />
          ) : (
            <div className="flex-1 grid place-items-center">
              <EmptyState icon={<MessageSquareText size={22} />} title="Select a conversation" message="Choose a client on the left, or start a new message." />
            </div>
          )}
        </div>
      </div>
      {composeOpen && <NewMessageModal onClose={closeCompose} />}
    </div>
  );
}

function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const name = c.account ? accountName(c.account) : 'Unknown account';
  return (
    <button onClick={onClick} className={cx('w-full text-left flex items-start gap-3 px-3 py-3 border-b border-ink-50 transition-colors', active ? 'bg-brand-50' : 'bg-white hover:bg-ink-50')}>
      <Avatar name={name} color={active ? '#dc2626' : '#5b6f86'} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx('truncate text-[13px]', c.unread ? 'font-bold text-ink-900' : 'font-semibold text-ink-800')}>{name}</span>
          <span className="ml-auto text-[11px] text-ink-400 whitespace-nowrap">{c.last ? fmtRelative(c.last.created_at) : 'New'}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {c.last && (c.last.channel === 'Email' ? <Mail size={12} className="text-ink-300 shrink-0" /> : <Smartphone size={12} className="text-ink-300 shrink-0" />)}
          <span className={cx('truncate text-xs', c.unread ? 'text-ink-800' : 'text-ink-400')}>
            {c.last ? `${c.last.direction === 'Outbound' ? 'You: ' : ''}${c.last.subject && c.last.channel === 'Email' ? c.last.subject + ' — ' : ''}${c.last.body}` : 'No messages yet'}
          </span>
          {c.unread > 0 && <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold grid place-items-center">{c.unread}</span>}
        </div>
      </div>
    </button>
  );
}

// ── Thread ──

type ThreadProps = { accountId: string; onBack?: () => void; className?: string };

/** Keyed by account so composer state (e.g. the To address) never carries over to another client. */
export function MessageThread(props: ThreadProps) {
  return <Thread key={props.accountId} {...props} />;
}

function Thread({ accountId, onBack, className }: ThreadProps) {
  const account = useRow('accounts', accountId);
  const msgs = useTable('messages', { eq: { account_id: accountId }, order: { column: 'created_at', ascending: true } });
  const { settings, me } = useAppData();
  const { toast } = useFeedback();
  const [channel, setChannel] = useState<Channel>('SMS');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const marking = useRef(new Set<string>());
  const initialized = useRef(false);
  const templates = useTemplates(channel);
  const a = account.data;

  // Default channel (SMS when the client has a phone) once the account loads.
  useEffect(() => {
    if (!a || initialized.current) return;
    initialized.current = true;
    const ch: Channel = a.mobile_phone || a.phone ? 'SMS' : 'Email';
    setChannel(ch);
    setTo(defaultAddress(a, ch));
  }, [a]);

  const switchChannel = (ch: Channel) => { setChannel(ch); setTo(defaultAddress(a, ch)); setError(null); };

  // Opening the thread marks inbound messages read.
  useEffect(() => {
    const unread = msgs.data.filter((m) => m.direction === 'Inbound' && !m.read && !marking.current.has(m.id));
    unread.forEach((m) => {
      marking.current.add(m.id);
      db.update('messages', m.id, { read: true }).catch(() => marking.current.delete(m.id));
    });
  }, [msgs.data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.data.length]);

  const send = async () => {
    if (!a || sending) return;
    const addrErr = validateAddress(channel, to);
    if (addrErr) { setError(addrErr); return; }
    if (!body.trim()) { setError('Type a message first'); return; }
    if (channel === 'Email' && !subject.trim()) { setError('Email needs a subject'); return; }
    setSending(true);
    setError(null);
    try {
      await sendMessage(a, { channel, to, subject, body, agent: me?.name });
      setBody('');
      setSubject('');
      toast(channel === 'SMS' ? 'Text sent' : 'Email sent');
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(fillTemplate(t.body, a, settings, me?.name));
    if (channel === 'Email') setSubject(fillTemplate(t.subject, a, settings, me?.name));
    setError(null);
  };

  if (account.loading && !a) return <div className={cx('flex flex-col', className)}><LoadingBlock /></div>;
  if (!a) return <div className={cx('flex flex-col', className)}><EmptyState title="Account not found" message="This client may have been deleted." action={onBack && <Button size="sm" onClick={onBack}>Back</Button>} /></div>;

  const name = accountName(a);
  const len = body.length;
  const sms = smsInfo(body);

  return (
    <div className={cx('flex flex-col min-h-0 min-w-0 bg-white', className ?? 'h-[600px] border border-[#e3e3e3] rounded shadow-card')}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-ink-100">
        {onBack && <button onClick={onBack} className="md:hidden bg-transparent text-ink-500 hover:text-ink-900 -ml-1 p-1" aria-label="Back to conversations"><ArrowLeft size={18} /></button>}
        <Avatar name={name} color="#dc2626" size={34} />
        <div className="min-w-0 flex-1">
          <a href={href(`/accounts/${a.id}`)} className="block text-[14px] font-semibold text-ink-900 hover:text-brand-600 truncate">{name}</a>
          <div className="text-xs text-ink-400 truncate">
            {[fmtPhone(a.mobile_phone || a.phone), a.email].filter(Boolean).join(' · ') || 'No contact info'}
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={<Reply size={13} />} onClick={() => setInboundOpen(true)} title="Record a reply the client sent outside the system">
          <span className="hidden sm:inline">Log inbound reply</span><span className="sm:hidden">Log reply</span>
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 bg-ink-50/40">
        {msgs.loading ? <LoadingBlock /> : msgs.data.length === 0 ? (
          <EmptyState icon={<MessageSquare size={22} />} title="No messages yet" message={`Send ${a.first_name || name} a text or email below.`} />
        ) : (
          <div className="space-y-2">
            {msgs.data.map((m, i) => {
              const prev = msgs.data[i - 1];
              const day = parseDate(m.created_at)?.toDateString();
              const showDay = !prev || parseDate(prev.created_at)?.toDateString() !== day;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="text-center my-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 bg-white border border-ink-100 rounded-full px-2.5 py-0.5">
                        {parseDate(m.created_at)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                  <Bubble m={m} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ink-100 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pills<Channel> value={channel} onChange={switchChannel} options={[{ value: 'SMS', label: 'SMS' }, { value: 'Email', label: 'Email' }]} />
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">To</span>
            <Input value={to} onChange={(e) => { setTo(e.target.value); setError(null); }} placeholder={channel === 'SMS' ? 'Mobile number' : 'Email address'} className="h-7 text-xs" />
          </div>
          <Select className="h-7 text-xs w-auto max-w-[180px]" value="" onChange={(e) => applyTemplate(e.target.value)} placeholder="Insert template…" options={templates.map((t) => ({ value: t.id, label: t.label }))} aria-label="Insert template" />
        </div>
        {channel === 'Email' && <Input value={subject} onChange={(e) => { setSubject(e.target.value); setError(null); }} placeholder="Subject" />}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setError(null); }}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={channel === 'SMS' ? 'Type a text message…' : 'Write an email…'}
            className="min-h-[44px] max-h-40 flex-1"
          />
          <Button variant="primary" icon={<Send size={15} />} loading={sending} onClick={() => void send()} disabled={!body.trim()} aria-label="Send">
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {error ? <span className="text-red-600">{error}</span> : <span className="text-ink-400">Enter to send · Shift+Enter for a new line</span>}
          <span className={cx('tabular-nums', channel === 'SMS' && sms.segments > 1 ? 'text-amber-600' : 'text-ink-400')}>
            {channel === 'SMS' ? smsHint(body) : `${len} characters`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-300"><Info size={11} /> {SIMULATED_NOTE}</div>
      </div>

      {inboundOpen && <InboundModal account={a} defaultChannel={channel} onClose={() => setInboundOpen(false)} />}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const out = m.direction === 'Outbound';
  const time = parseDate(m.created_at)?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={cx('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[85%] sm:max-w-[70%] flex flex-col', out ? 'items-end' : 'items-start')}>
        <div className={cx('rounded-2xl px-3.5 py-2 text-[13px] whitespace-pre-wrap break-words shadow-sm', out ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white border border-ink-100 text-ink-900 rounded-bl-sm')}>
          {m.channel === 'Email' && m.subject && <div className={cx('font-semibold mb-1', out ? 'text-white' : 'text-ink-900')}>{m.subject}</div>}
          {m.body}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-ink-400" title={fmtDateTime(m.created_at)}>
          {m.channel === 'Email' ? <Mail size={10} /> : <Smartphone size={10} />}
          <span>{time}</span>
          {out && <StatusTick status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function StatusTick({ status }: { status: Message['status'] }) {
  if (status === 'Delivered') return <span className="inline-flex items-center gap-0.5 text-brand-600"><CheckCheck size={11} /> Delivered</span>;
  if (status === 'Failed') return <span className="inline-flex items-center gap-0.5 text-red-600"><AlertCircle size={11} /> Failed</span>;
  if (status === 'Sent') return <span className="inline-flex items-center gap-0.5"><Check size={11} /> Sent</span>;
  return null;
}

// ── Modals ──

function InboundModal({ account, defaultChannel, onClose }: { account: Account; defaultChannel: Channel; onClose: () => void }) {
  const { toast } = useFeedback();
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [from, setFrom] = useState(defaultAddress(account, defaultChannel));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!body.trim()) { setError('Enter what the client said'); return; }
    setBusy(true);
    try {
      await db.insert('messages', {
        account_id: account.id, channel, direction: 'Inbound', to_address: from.trim() || null,
        subject: channel === 'Email' ? subject.trim() || null : null, body: body.trim(), status: 'Received', read: true,
      });
      toast('Reply logged');
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Log inbound reply" subtitle={`Record a response from ${accountName(account)}`} size="sm" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void save()}>Log reply</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => { const ch = e.target.value as Channel; setChannel(ch); setFrom(defaultAddress(account, ch)); }} options={['SMS', 'Email']} />
          </Field>
          <Field label="From">
            <Input value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        {channel === 'Email' && <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label="Message" required>
          <Textarea value={body} onChange={(e) => { setBody(e.target.value); setError(null); }} autoFocus placeholder="What did the client send?" />
        </Field>
      </div>
    </Modal>
  );
}

function NewMessageModal({ onClose }: { onClose: () => void }) {
  const { settings, me } = useAppData();
  const { toast } = useFeedback();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('SMS');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const templates = useTemplates(channel);

  const pickAccount =(id: string | null, a: Account | null) => {
    setAccountId(id);
    setAccount(a);
    if (a) {
      const ch: Channel = a.mobile_phone || a.phone ? channel : 'Email';
      setChannel(ch);
      setTo(defaultAddress(a, ch));
    } else setTo('');
    setErrors({});
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(fillTemplate(t.body, account, settings, me?.name));
    setSubject(fillTemplate(t.subject, account, settings, me?.name));
  };

  const openThread = () => {
    if (!accountId) { setErrors({ account: 'Choose a client' }); return; }
    setParam('account', accountId);
    onClose();
  };

  const send = async () => {
    const e: Record<string, string> = {};
    if (!account) e.account = 'Choose a client';
    const addrErr = account ? validateAddress(channel, to) : null;
    if (addrErr) e.to = addrErr;
    if (channel === 'Email' && !subject.trim()) e.subject = 'Subject is required';
    if (!body.trim()) e.body = 'Message is required';
    setErrors(e);
    if (Object.keys(e).length || !account) return;
    setBusy(true);
    try {
      await sendMessage(account, { channel, to, subject, body, agent: me?.name });
      toast(channel === 'SMS' ? 'Text sent' : 'Email sent');
      setParam('account', account.id);
      onClose();
    } catch (err) {
      setErrors({ form: (err as Error).message });
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title="New message" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={openThread} disabled={!accountId}>Open conversation</Button>
      <Button variant="primary" icon={<Send size={14} />} loading={busy} onClick={() => void send()}>Send</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={errors.form} />
        <Field label="Client" required error={errors.account}>
          <AccountPicker value={accountId} onChange={pickAccount} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
          <Field label="Channel">
            <Pills<Channel> value={channel} onChange={(ch) => { setChannel(ch); setTo(defaultAddress(account, ch)); }} options={[{ value: 'SMS', label: 'SMS' }, { value: 'Email', label: 'Email' }]} />
          </Field>
          <Field label="To" required error={errors.to}>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === 'SMS' ? 'Mobile number' : 'Email address'} />
          </Field>
        </div>
        <Field label="Template">
          <Select value="" onChange={(e) => applyTemplate(e.target.value)} placeholder="Insert template…" options={templates.map((t) => ({ value: t.id, label: t.label }))} />
        </Field>
        {channel === 'Email' && <Field label="Subject" required error={errors.subject}><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field
          label="Message"
          required
          error={errors.body}
          hint={channel === 'SMS' ? smsHint(body) : undefined}
        >
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Field>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400"><Info size={11} /> {SIMULATED_NOTE}</div>
        {account && channel === 'SMS' && !(account.mobile_phone || account.phone) && <Badge tone="amber">This client has no phone number on file</Badge>}
      </div>
    </Modal>
  );
}
