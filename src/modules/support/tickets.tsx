import { BookOpen, ChevronRight, LifeBuoy, MessageCircleQuestion, Plus, Send, Ticket, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  Badge, Button, Checkbox, DataTable, DescriptionList, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Modal, PageHeader, Panel, Pills,
  SearchInput, Select, Textarea, useFeedback, type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { useDebounced, useRow, useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Priority, SupportTicket, TicketMessage } from '@/lib/types';
import { KB_ARTICLES, KB_CATEGORIES, searchKb, stripMarkup } from './kb';
import { createTicket, lastActivity, openChat, ticketNumber, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './lib';
import { TicketStatus } from './shared';

// ── Solution Center ──

export function SolutionCenter() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const [creating, setCreating] = useState<{ subject?: string } | null>(null);
  const results = useMemo(() => searchKb(dq, 8), [dq]);
  const popular = KB_ARTICLES.filter((a) => a.popular);
  const counts = useMemo(() => new Map(KB_CATEGORIES.map((c) => [c, KB_ARTICLES.filter((a) => a.category === c).length])), []);

  return (
    <div>
      <PageHeader
        title="Solution Center"
        subtitle="Search the knowledge base, chat with the support assistant, or open a ticket."
        icon={<LifeBuoy size={20} />}
        actions={<>
          <Button icon={<MessageCircleQuestion size={15} />} onClick={openChat}>Chat</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating({})}>Contact support</Button>
        </>}
      />

      <Panel className="mb-4">
        <div className="text-sm font-semibold text-ink-900 mb-2">How can we help?</div>
        <div className="max-w-2xl">
          <SearchInput value={q} onChange={setQ} placeholder="e.g. how do I reconcile a commission statement" />
        </div>
        {dq.trim() && (
          <div className="mt-3 max-w-2xl">
            {results.length ? (
              <ul className="divide-y divide-ink-50 border border-ink-100 rounded">
                {results.map(({ article: a }) => (
                  <li key={a.slug}>
                    <a href={href(`/support/kb/${a.slug}`)} className="flex items-start gap-3 px-3 py-2.5 hover:bg-brand-50/50 no-underline">
                      <BookOpen size={15} className="text-brand-500 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink-900">{a.title}</span>
                        <span className="block text-xs text-ink-400">{a.category} · {stripMarkup(a.summary)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[13px] text-ink-500 border border-dashed border-ink-200 rounded px-3 py-3">
                No articles match “{dq.trim()}”. Try other words, or{' '}
                <button className="text-brand-600 font-semibold bg-transparent hover:underline" onClick={() => setCreating({ subject: dq.trim() })}>open a ticket</button>.
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel title="Browse by category" actions={<a href={href('/support/kb')} className="text-xs font-semibold">All articles</a>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {KB_CATEGORIES.map((c) => (
                <a key={c} href={href(`/support/kb?category=${encodeURIComponent(c)}`)} className="flex items-center justify-between gap-2 border border-ink-100 rounded px-3 py-2.5 hover:border-brand-200 hover:bg-brand-50/40 no-underline">
                  <span className="text-[13px] font-semibold text-ink-800">{c}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-400">{counts.get(c)} <ChevronRight size={13} /></span>
                </a>
              ))}
            </div>
          </Panel>
          <Panel title="Popular articles">
            <ul className="space-y-2">
              {popular.map((a) => (
                <li key={a.slug}>
                  <a href={href(`/support/kb/${a.slug}`)} className="text-[13px] font-semibold">{a.title}</a>
                  <div className="text-xs text-ink-400">{a.summary}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <MyTickets onNew={() => setCreating({})} />
      </div>

      {creating && <NewTicketModal initialSubject={creating.subject} onClose={() => setCreating(null)} />}
    </div>
  );
}

function MyTickets({ onNew }: { onNew: () => void }) {
  const { me } = useAppData();
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const tickets = useTable('support_tickets', { order: { column: 'created_at', ascending: false } });
  const rows = tickets.data
    .filter((t) => showAll || t.requester === (me?.name ?? null))
    .filter((t) => filter === 'all' || t.status === 'Open' || t.status === 'Pending');

  return (
    <Panel title={showAll ? 'Agency tickets' : 'My tickets'} actions={<Button size="sm" icon={<Plus size={13} />} onClick={onNew}>New</Button>} bodyClassName="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-ink-100">
        <Pills options={[{ value: 'active', label: 'Open' }, { value: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
        <Checkbox label="Everyone's" checked={showAll} onChange={setShowAll} />
      </div>
      <ErrorBanner message={tickets.error} />
      {tickets.loading ? <LoadingBlock /> : rows.length === 0 ? (
        <EmptyState icon={<Ticket size={20} />} title={filter === 'active' ? 'No open tickets' : 'No tickets yet'} message={me ? `Tickets requested by ${showAll ? 'anyone' : me.name} appear here.` : 'Choose who you are in Settings → Agency Profile.'} />
      ) : (
        <ul className="divide-y divide-ink-50">
          {rows.map((t) => (
            <li key={t.id}>
              <a href={href(`/support/tickets/${t.id}`)} className="block px-4 py-2.5 hover:bg-brand-50/50 no-underline">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-ink-400">{ticketNumber(t)}</span>
                  <TicketStatus status={t.status} />
                </div>
                <div className="text-[13px] font-semibold text-ink-900 truncate">{t.subject}</div>
                <div className="text-xs text-ink-400 truncate">{t.category} · {showAll && t.requester ? `${t.requester} · ` : ''}updated {fmtRelative(lastActivity(t))}</div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function NewTicketModal({ initialSubject = '', initialCategory = 'General', onClose }: { initialSubject?: string; initialCategory?: string; onClose: () => void }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [subject, setSubject] = useState(initialSubject);
  const [category, setCategory] = useState(TICKET_CATEGORIES.includes(initialCategory) ? initialCategory : 'General');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const dSubject = useDebounced(subject, 250);
  const suggestions = useMemo(() => searchKb(`${dSubject}`, 3), [dSubject]);

  const submit = async () => {
    if (submitting.current) return;
    const e: Record<string, string> = {};
    if (subject.trim().length < 5) e.subject = 'Enter a short summary (at least 5 characters).';
    if (subject.trim().length > 150) e.subject = 'Keep the subject under 150 characters.';
    if (body.trim().length < 10) e.body = 'Describe the problem (at least 10 characters): what you did, what you expected, what happened.';
    setErrors(e);
    if (Object.keys(e).length) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const author = me?.name ?? 'Agency user';
      const t = await createTicket({
        subject: subject.trim(), category, priority, requester: me?.name ?? null,
        messages: [{ from: 'user', author, body: body.trim(), at: new Date().toISOString() }],
      });
      toast(`Ticket ${ticketNumber(t)} created`);
      onClose();
      navigate(`/support/tickets/${t.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal title="Contact support" subtitle="Opens a support ticket you can follow under My tickets." onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" icon={<Send size={14} />} loading={busy} onClick={submit}>Submit ticket</Button>
    </>}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!me && <ErrorBanner message="No current user is set. Choose who you are in Settings → Agency Profile so the ticket shows as yours." />}
        <Field label="Subject" required error={errors.subject}>
          <Input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Carrier not returning quotes" autoFocus />
        </Field>
        {suggestions.length > 0 && (
          <div className="rounded border border-ink-100 bg-ink-50/60 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">These articles may answer it</div>
            <ul className="space-y-0.5">
              {suggestions.map(({ article: a }) => (
                <li key={a.slug}><a href={href(`/support/kb/${a.slug}`)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold">{a.title}</a></li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={TICKET_CATEGORIES} /></Field>
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} options={TICKET_PRIORITIES} /></Field>
        </div>
        <Field label="Description" required error={errors.body} hint="Include the applicant or policy number and the steps you took. Never include passwords or full SSNs.">
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Ticket detail ──

export function TicketDetail({ id }: { id: string }) {
  const { me, staffColor } = useAppData();
  const { toast, confirm } = useFeedback();
  const { data: t, loading, error } = useRow('support_tickets', id);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);

  if (loading) return <LoadingBlock />;
  if (!t) return <EmptyState title="Ticket not found" message={error ?? 'It may have been deleted.'} action={<Button onClick={() => navigate('/support')}>Back to Solution Center</Button>} />;

  const guard = async (key: string, fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { lock.current = false; setBusy(null); }
  };

  const sendReply = () => {
    const body = reply.trim();
    if (!body) { setReplyError('Write a reply first.'); return; }
    if (body.length > 5000) { setReplyError('Replies are limited to 5,000 characters.'); return; }
    setReplyError(null);
    void guard('reply', async () => {
      const msg: TicketMessage = { from: 'user', author: me?.name ?? 'Agency user', body, at: new Date().toISOString() };
      const reopen = t.status === 'Resolved' || t.status === 'Closed';
      await db.update('support_tickets', t.id, { messages: [...t.messages, msg], ...(reopen ? { status: 'Open' as const } : {}) });
      setReply('');
      toast(reopen ? 'Reply added — ticket reopened' : 'Reply added');
    });
  };

  const setStatus = async (status: SupportTicket['status']) => {
    if (status === t.status) return;
    if (status === 'Closed' && !(await confirm({ title: 'Close this ticket?', message: 'Closed tickets are archived. Replying later reopens it.', confirmLabel: 'Close ticket' }))) return;
    await guard('status', async () => {
      await db.update('support_tickets', t.id, { status });
      toast(`Ticket marked ${status}`);
    });
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete ticket?', message: `${ticketNumber(t)} and its conversation will be permanently deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    await guard('delete', async () => {
      await db.remove('support_tickets', t.id);
      toast('Ticket deleted');
      navigate('/support');
    });
  };

  const done = t.status === 'Resolved' || t.status === 'Closed';

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Solution Center', href: href('/support') }]}
        title={t.subject}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{ticketNumber(t)}</span><TicketStatus status={t.status} /><Badge>{t.priority}</Badge></span>}
        icon={<Ticket size={20} />}
        actions={<>
          {!done && <Button variant="primary" loading={busy === 'status'} onClick={() => setStatus('Resolved')}>Mark resolved</Button>}
          <Button variant="ghost" icon={<Trash2 size={14} />} loading={busy === 'delete'} onClick={remove}>Delete</Button>
        </>}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        <Panel title="Conversation">
          <ol className="space-y-3">
            {t.messages.map((m, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0" style={{ background: m.from === 'user' ? staffColor(m.author) : m.from === 'assistant' ? '#6f6464' : '#b91c1c' }}>
                  {m.from === 'assistant' ? 'KB' : m.author.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className={`min-w-0 flex-1 rounded border px-3 py-2 ${m.from === 'assistant' ? 'border-ink-100 bg-ink-50' : 'border-ink-100 bg-white'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                    <span className="font-semibold text-ink-800">{m.author}{m.from === 'assistant' && <span className="font-normal text-ink-400"> · automated</span>}</span>
                    <span className="text-ink-400">{fmtDateTime(m.at)}</span>
                  </div>
                  <div className="text-[13px] text-ink-700 whitespace-pre-wrap break-words mt-0.5">{m.body}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded border border-dashed border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-500">
            A support specialist will reply here. No live support team is connected to this training system, so replies are not generated automatically —
            use the <a href={href('/support/kb')}>Knowledge Base</a> or the chat assistant in the meantime.
          </div>
          <div className="mt-4">
            <Field label={done ? 'Reply (reopens the ticket)' : 'Add a reply'} error={replyError}>
              <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add details, screenshots described in words, or what you tried next…" />
            </Field>
            <div className="flex justify-end mt-2">
              <Button variant="primary" icon={<Send size={14} />} loading={busy === 'reply'} onClick={sendReply}>Send reply</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Details">
          <DescriptionList columns={1} items={[
            { label: 'Status', value: <Select value={t.status} disabled={!!busy} onChange={(e) => void setStatus(e.target.value as SupportTicket['status'])} options={TICKET_STATUSES} /> },
            { label: 'Category', value: t.category },
            { label: 'Priority', value: t.priority },
            { label: 'Requester', value: t.requester },
            { label: 'Opened', value: fmtDateTime(t.created_at) },
            { label: 'Last activity', value: fmtRelative(lastActivity(t)) },
            { label: 'Messages', value: t.messages.length },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

/** All tickets table (not linked from the menu, used by the tickets index route). */
export function TicketsIndex() {
  const tickets = useTable('support_tickets', { order: { column: 'created_at', ascending: false } });
  const cols: Column<SupportTicket>[] = [
    { key: 'n', header: 'Ticket', render: (t) => <span className="font-mono text-xs">{ticketNumber(t)}</span> },
    { key: 'subject', header: 'Subject', sortValue: (t) => t.subject, render: (t) => <span className="font-semibold">{t.subject}</span> },
    { key: 'req', header: 'Requester', sortValue: (t) => t.requester, render: (t) => t.requester ?? '—' },
    { key: 'status', header: 'Status', sortValue: (t) => t.status, render: (t) => <TicketStatus status={t.status} /> },
    { key: 'upd', header: 'Updated', sortValue: (t) => lastActivity(t), render: (t) => fmtRelative(lastActivity(t)) },
  ];
  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Solution Center', href: href('/support') }]} title="Support tickets" icon={<Ticket size={20} />} />
      <Panel bodyClassName="p-0">
        <ErrorBanner message={tickets.error} />
        <DataTable columns={cols} rows={tickets.data} loading={tickets.loading} onRowClick={(t) => navigate(`/support/tickets/${t.id}`)} empty={<EmptyState title="No tickets yet" />} />
      </Panel>
    </div>
  );
}
