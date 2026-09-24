import { ArrowRight, BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, PageHeader, Panel, SearchInput, cx } from '@/components/ui';
import { useDebounced } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import { ALL_LESSONS, COURSES } from './catalog';
import { KB_ARTICLES, KB_CATEGORIES, kbBySlug, relatedArticles, searchKb, type KbCategory } from './kb';
import { readHelpful, writeHelpful } from './lib';
import { Blocks } from './shared';
import { NewTicketModal } from './tickets';

export function KbBrowse() {
  const { params } = useRoute();
  const rawCat = params.get('category');
  const category = KB_CATEGORIES.find((c) => c === rawCat) ?? null;
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);

  const list = useMemo(() => {
    const base = dq.trim() ? searchKb(dq, 50).map((r) => r.article) : KB_ARTICLES;
    return category ? base.filter((a) => a.category === category) : base;
  }, [dq, category]);
  const groups = dq.trim() ? [null] : (category ? [category] : [...KB_CATEGORIES]);

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Solution Center', href: href('/support') }]} title="Knowledge Base" subtitle={`${KB_ARTICLES.length} articles about working in Northstar AMS`} icon={<BookOpen size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
        <Panel bodyClassName="p-2">
          <button onClick={() => setParam('category', null)} className={cx('w-full text-left px-2 py-1.5 rounded text-[13px]', !category ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-transparent text-ink-700 hover:bg-ink-50')}>All categories</button>
          {KB_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setParam('category', c)} className={cx('w-full flex justify-between text-left px-2 py-1.5 rounded text-[13px]', c === category ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-transparent text-ink-700 hover:bg-ink-50')}>
              <span>{c}</span><span className="text-ink-400 text-xs">{KB_ARTICLES.filter((a) => a.category === c).length}</span>
            </button>
          ))}
        </Panel>
        <div className="space-y-4 min-w-0">
          <SearchInput value={q} onChange={setQ} placeholder={category ? `Search ${category}…` : 'Search all articles…'} className="max-w-xl" />
          {list.length === 0 ? (
            <Panel><EmptyState title="No matching articles" message="Try different words, or ask the chat assistant." /></Panel>
          ) : groups.map((g) => {
            const items = g ? list.filter((a) => a.category === g) : list;
            if (!items.length) return null;
            return (
              <Panel key={g ?? 'results'} title={g ?? `Results for “${dq.trim()}”`}>
                <ul className="divide-y divide-ink-50 -my-2">
                  {items.map((a) => (
                    <li key={a.slug} className="py-2.5">
                      <a href={href(`/support/kb/${a.slug}`)} className="text-[13px] font-semibold">{a.title}</a>
                      <div className="text-xs text-ink-400">{!g && <>{a.category} · </>}{a.summary}</div>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function KbArticlePage({ slug }: { slug: string }) {
  const a = kbBySlug(slug);
  const [helpful, setHelpful] = useState(() => readHelpful(slug));
  const [asking, setAsking] = useState(false);
  if (!a) return <EmptyState title="Article not found" message="It may have been renamed." action={<Button onClick={() => navigate('/support/kb')}>Browse the Knowledge Base</Button>} />;
  const related = relatedArticles(a);
  const lessons = ALL_LESSONS.filter((l) => l.kb === a.slug);
  const vote = (v: 'yes' | 'no') => { const next = helpful === v ? null : v; writeHelpful(slug, next); setHelpful(next); };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Solution Center', href: href('/support') }, { label: 'Knowledge Base', href: href('/support/kb') }, { label: a.category, href: href(`/support/kb?category=${encodeURIComponent(a.category)}`) }]}
        title={a.title}
        subtitle={a.summary}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel>
            <Blocks blocks={a.body} />
            {a.links.length > 0 && (
              <div className="mt-5 pt-4 border-t border-ink-100">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Open in the app</div>
                <div className="flex flex-wrap gap-2">
                  {a.links.map((l) => <Button key={l.to} size="sm" icon={<ArrowRight size={13} />} onClick={() => navigate(l.to)}>{l.label}</Button>)}
                </div>
              </div>
            )}
          </Panel>
          <Panel>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-ink-800">Was this helpful?</span>
              <Button size="sm" variant={helpful === 'yes' ? 'primary' : 'secondary'} icon={<ThumbsUp size={13} />} aria-pressed={helpful === 'yes'} onClick={() => vote('yes')}>Yes</Button>
              <Button size="sm" variant={helpful === 'no' ? 'primary' : 'secondary'} icon={<ThumbsDown size={13} />} aria-pressed={helpful === 'no'} onClick={() => vote('no')}>No</Button>
              {helpful === 'yes' && <span className="text-xs text-ink-400">Thanks for the feedback (saved in this browser).</span>}
            </div>
            {helpful === 'no' && (
              <div className="mt-3 text-[13px] text-ink-600">
                Sorry it didn’t help. <button className="text-brand-600 font-semibold bg-transparent hover:underline" onClick={() => setAsking(true)}>Open a support ticket</button> and describe what you were trying to do.
              </div>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Related articles">
            {related.length ? (
              <ul className="space-y-2">
                {related.map((r) => <li key={r.slug}><a href={href(`/support/kb/${r.slug}`)} className="text-[13px] font-semibold">{r.title}</a></li>)}
              </ul>
            ) : <div className="text-xs text-ink-400">No related articles.</div>}
          </Panel>
          {lessons.length > 0 && (
            <Panel title="Used in Agency University">
              <ul className="space-y-1.5">
                {lessons.map((l) => {
                  const c = COURSES.find((x) => l.key.startsWith(x.slug + '.'))!;
                  return <li key={l.key} className="text-[13px]"><a href={href(`/support/university/${c.slug}`)} className="font-semibold">{c.title}</a><span className="text-ink-400"> · {l.title}</span></li>;
                })}
              </ul>
            </Panel>
          )}
          <Panel><div className="flex flex-wrap items-center gap-2 text-xs text-ink-500"><Badge>{a.category as KbCategory}</Badge>{a.tags.slice(0, 5).map((t) => <span key={t}>#{t.replace(/\s+/g, '-')}</span>)}</div></Panel>
        </div>
      </div>
      {asking && <NewTicketModal initialSubject={`Question about: ${a.title}`.slice(0, 150)} initialCategory={a.category} onClose={() => setAsking(false)} />}
    </div>
  );
}
