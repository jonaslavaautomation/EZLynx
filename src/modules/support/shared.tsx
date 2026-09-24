import { Check, Copy, Info } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Badge, Button, cx, useFeedback } from '@/components/ui';
import { href } from '@/lib/router';
import type { SupportTicket } from '@/lib/types';
import type { KbBlock } from './kb';
import { copyText, STATUS_TONE } from './lib';

/** Renders **bold** and [label](/path) markup. App paths become hash links; http(s) links open in a new tab. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<b key={i++}>{m[1]}</b>);
    else if (/^https?:\/\//.test(m[3])) parts.push(<a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-semibold">{m[2]}</a>);
    else parts.push(<a key={i++} href={href(m[3])} className="font-semibold">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, k) => <Fragment key={k}>{p}</Fragment>)}</>;
}

export function Blocks({ blocks }: { blocks: KbBlock[] }) {
  return (
    <div className="help-body text-[13px] text-ink-700 leading-relaxed space-y-3 max-w-3xl">
      {blocks.map((b, i) => {
        if ('h' in b) return <h4 key={i}>{b.h}</h4>;
        if ('p' in b) return <p key={i}><RichText text={b.p} /></p>;
        if ('note' in b) return <p key={i} className="help-note"><RichText text={b.note} /></p>;
        if ('steps' in b) return <ol key={i} className="list-decimal pl-5 space-y-1.5">{b.steps.map((s, j) => <li key={j}><RichText text={s} /></li>)}</ol>;
        return <ul key={i} className="list-disc pl-5 space-y-1.5">{b.list.map((s, j) => <li key={j}><RichText text={s} /></li>)}</ul>;
      })}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const { toast } = useFeedback();
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      icon={done ? <Check size={13} /> : <Copy size={13} />}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); } else toast('Could not copy — select the text and copy it manually.', 'error');
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function CodeBlock({ code, lang, title }: { code: string; lang?: string; title?: string }) {
  return (
    <div className="rounded border border-ink-200 bg-[#1c1414] text-[#f8f6f6] min-w-0">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-300">{title ?? lang ?? 'code'}</span>
        <CopyButton text={code} className="!text-ink-200 hover:!bg-white/10" />
      </div>
      <pre className="px-3 py-2.5 text-[12px] leading-relaxed overflow-x-auto whitespace-pre"><code>{code}</code></pre>
    </div>
  );
}

export function TicketStatus({ status }: { status: SupportTicket['status'] }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{status}</Badge>;
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cx('flex items-start gap-2 rounded border px-3 py-2 text-[13px]', tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-200 bg-sky-50 text-sky-800')}>
      <Info size={15} className="shrink-0 mt-0.5" /> <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cx('h-2 rounded-full bg-ink-100 overflow-hidden', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

const NAV = [
  { label: 'Solution Center', to: '/support', match: (s: string[]) => !s[0] || s[0] === 'tickets' },
  { label: 'Knowledge Base', to: '/support/kb', match: (s: string[]) => s[0] === 'kb' },
  { label: 'Carrier Library', to: '/support/carriers', match: (s: string[]) => s[0] === 'carriers' },
  { label: "What's New", to: '/support/whats-new', match: (s: string[]) => s[0] === 'whats-new' },
  { label: 'Product Blog', to: '/support/blog', match: (s: string[]) => s[0] === 'blog' },
  { label: 'Agency University', to: '/support/university', match: (s: string[]) => s[0] === 'university' },
  { label: 'Instructor-Led', to: '/support/instructor-led', match: (s: string[]) => s[0] === 'instructor-led' },
  { label: 'API Docs', to: '/support/api', match: (s: string[]) => s[0] === 'api' },
];

/** Sub-navigation across the Support area; scrolls horizontally on a phone. */
export function SupportNav({ segments }: { segments: string[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-2 mb-3 border-b border-ink-100" aria-label="Support sections">
      {NAV.map((n) => {
        const active = n.match(segments);
        return (
          <a key={n.to} href={href(n.to)} aria-current={active ? 'page' : undefined}
            className={cx('shrink-0 px-2.5 h-7 inline-flex items-center rounded text-xs font-semibold whitespace-nowrap no-underline', active ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-50')}>
            {n.label}
          </a>
        );
      })}
    </nav>
  );
}
