import { BookOpen, LifeBuoy, RotateCcw, Send, ThumbsUp, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OPEN_CHAT_EVENT } from '@/components/SideNav';
import { Button, IconButton, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { href } from '@/lib/router';
import type { SupportTicket, TicketMessage } from '@/lib/types';
import { kbBySlug, searchKb } from './kb';
import { createTicket, ticketNumber } from './lib';

/* Floating support assistant. Answers come only from the knowledge base (keyword search); nothing is generated. */

type ChatMsg = {
  id: number;
  from: 'user' | 'assistant';
  body: string;
  at: string;
  /** KB article slugs suggested with an answer. */
  articles?: string[];
  /** Offer "This solved it" / "Talk to a person" under this message. */
  actions?: boolean;
  ticket?: Pick<SupportTicket, 'id'>;
};

const GREETING = 'Hi! Ask a question about using Northstar AMS — for example “how do I cancel a policy” — and I’ll point you to the right knowledge-base articles.';

let seq = 0;
const msg = (m: Omit<ChatMsg, 'id' | 'at'>): ChatMsg => ({ ...m, id: ++seq, at: new Date().toISOString() });

export function SupportChatHost() {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const creating = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMessages((m) => (m.length ? m : [msg({ from: 'assistant', body: GREETING })]));
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      // Let open modals handle Escape first.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  if (!open) return null;

  const hasQuestion = messages.some((m) => m.from === 'user');

  const ask = () => {
    const q = text.trim();
    if (!q) return;
    if (q.length > 500) { toast('Keep questions under 500 characters.', 'error'); return; }
    const hits = searchKb(q, 3);
    const reply = hits.length
      ? msg({ from: 'assistant', body: hits.length === 1 ? 'This article looks like the best match:' : `These ${hits.length} articles look like the best matches:`, articles: hits.map((h) => h.article.slug), actions: true })
      : msg({ from: 'assistant', body: 'I couldn’t find a knowledge-base article for that. Try different words (e.g. the screen or button name), or talk to a person and I’ll open a ticket with this conversation.', actions: true });
    setMessages((m) => [...m.map((x) => ({ ...x, actions: false })), msg({ from: 'user', body: q }), reply]);
    setText('');
  };

  const solved = () => {
    setMessages((m) => [...m.map((x) => ({ ...x, actions: false })), msg({ from: 'user', body: 'This solved it.' }), msg({ from: 'assistant', body: 'Great — glad that helped! Ask another question any time.' })]);
  };

  const talkToPerson = async () => {
    if (creating.current) return;
    if (ticket) {
      setMessages((m) => [...m.map((x) => ({ ...x, actions: false })), msg({ from: 'assistant', body: `Your conversation is already on ticket ${ticketNumber(ticket)}. Add details there.`, ticket })]);
      return;
    }
    const firstQuestion = messages.find((m) => m.from === 'user')?.body;
    if (!firstQuestion) return;
    creating.current = true;
    setBusy(true);
    try {
      const author = me?.name ?? 'Agency user';
      const transcript: TicketMessage[] = messages.filter((m) => m.body !== GREETING).map((m) => ({
        from: m.from,
        author: m.from === 'user' ? author : 'Support assistant',
        at: m.at,
        body: m.articles?.length ? `${m.body}\n${m.articles.map((s) => `• ${kbBySlug(s)?.title ?? s}`).join('\n')}` : m.body,
      }));
      transcript.push({ from: 'user', author, at: new Date().toISOString(), body: 'Requested to talk to a person.' });
      const subject = firstQuestion.length > 100 ? `${firstQuestion.slice(0, 97)}…` : firstQuestion;
      const t = await createTicket({ subject, category: 'Chat', priority: 'Normal', requester: me?.name ?? null, messages: transcript });
      setTicket(t);
      setMessages((m) => [...m.map((x) => ({ ...x, actions: false })), msg({ from: 'user', body: 'Talk to a person.' }),
        msg({ from: 'assistant', body: `I opened ticket ${ticketNumber(t)} with this conversation. A support specialist will reply on the ticket; you can follow it under My tickets.`, ticket: t })]);
      toast(`Ticket ${ticketNumber(t)} created`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      creating.current = false;
      setBusy(false);
    }
  };

  const reset = async () => {
    if (hasQuestion && !ticket && !(await confirm({ title: 'Start a new chat?', message: 'The current conversation will be cleared. It has not been saved to a ticket.', confirmLabel: 'Clear chat', danger: true }))) return;
    setMessages([msg({ from: 'assistant', body: GREETING })]);
    setTicket(null);
    setText('');
  };

  return (
    <div
      className="fixed z-[90] inset-x-2 bottom-2 sm:inset-x-auto sm:right-4 sm:bottom-12 sm:w-[380px] h-[min(560px,calc(var(--dvh100)-80px))] bg-white border border-ink-200 rounded-md shadow-pop flex flex-col"
      role="dialog"
      aria-label="Support chat"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-ink-100 bg-brand-600 text-white rounded-t-md">
        <div className="flex items-center gap-2 min-w-0">
          <LifeBuoy size={18} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight">Support assistant</div>
            <div className="text-[11px] text-white/80 leading-tight">Answers come from the knowledge base.</div>
          </div>
        </div>
        <div className="flex items-center">
          <IconButton label="New chat" className="text-white/90 hover:bg-white/15 hover:text-white" onClick={() => void reset()}><RotateCcw size={15} /></IconButton>
          <IconButton label="Close chat" className="text-white/90 hover:bg-white/15 hover:text-white" onClick={() => setOpen(false)}><X size={17} /></IconButton>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-ink-50/50" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={cx('flex', m.from === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-snug', m.from === 'user' ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white border border-ink-100 text-ink-800 rounded-bl-sm')}>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              {m.articles && m.articles.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {m.articles.map((s) => {
                    const a = kbBySlug(s);
                    if (!a) return null;
                    return (
                      <li key={s}>
                        <a href={href(`/support/kb/${a.slug}`)} className="flex items-start gap-1.5 rounded border border-ink-100 px-2 py-1.5 hover:bg-brand-50 no-underline">
                          <BookOpen size={13} className="text-brand-500 mt-0.5 shrink-0" />
                          <span className="min-w-0"><span className="block font-semibold text-ink-900 text-[12.5px]">{a.title}</span><span className="block text-[11px] text-ink-400">{a.summary}</span></span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
              {m.ticket && <a href={href(`/support/tickets/${m.ticket.id}`)} className="inline-block mt-1.5 font-semibold">Open ticket {ticketNumber(m.ticket)} →</a>}
              {m.actions && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Button size="sm" icon={<ThumbsUp size={12} />} onClick={solved} disabled={busy}>This solved it</Button>
                  <Button size="sm" variant="primary" icon={<UserRound size={12} />} loading={busy} onClick={() => void talkToPerson()}>Talk to a person</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="border-t border-ink-100 p-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="Type your question…"
          aria-label="Your question"
          className="flex-1 min-h-[36px] max-h-28 resize-none rounded border border-ink-200 px-2.5 py-2 text-[13px] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <Button type="submit" variant="primary" icon={<Send size={14} />} disabled={!text.trim()} aria-label="Send">Ask</Button>
      </form>
    </div>
  );
}
