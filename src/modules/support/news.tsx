import { Gift, Newspaper } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Panel } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { href, navigate } from '@/lib/router';
import { BLOG_POSTS, blogBySlug, RELEASES } from './content';
import { Blocks, RichText } from './shared';

export function WhatsNew() {
  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }]} title="What's New" subtitle="Release notes for Northstar AMS" icon={<Gift size={20} />} />
      <ol className="relative border-l-2 border-brand-100 ml-2 space-y-5 max-w-3xl">
        {RELEASES.map((r) => (
          <li key={r.version} className="pl-5 relative">
            <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-brand-500 border-4 border-white" />
            <Panel>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge tone={r.tag === 'New' ? 'teal' : r.tag === 'Improved' ? 'blue' : 'green'}>{r.tag}</Badge>
                <span className="text-xs text-ink-400">Version {r.version} · {fmtDate(r.date)}</span>
              </div>
              <h2 className="text-[15px] font-semibold text-ink-900 mb-2">{r.title}</h2>
              <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-ink-700 leading-relaxed">
                {r.items.map((it, i) => <li key={i}><RichText text={it} /></li>)}
              </ul>
            </Panel>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BlogIndex() {
  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }]} title="Product Blog" subtitle="Practical tips for running a better agency" icon={<Newspaper size={20} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {BLOG_POSTS.map((p) => (
          <a key={p.slug} href={href(`/support/blog/${p.slug}`)} className="no-underline block bg-white border border-[#e3e3e3] rounded shadow-card p-4 hover:border-brand-200 transition-colors">
            <div className="text-xs text-ink-400">{fmtDate(p.date)} · {p.minutes} min read</div>
            <div className="text-[15px] font-semibold text-ink-900 mt-1">{p.title}</div>
            <div className="text-[13px] text-ink-500 mt-1.5">{p.excerpt}</div>
            <div className="flex flex-wrap gap-1 mt-3">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function BlogPostPage({ slug }: { slug: string }) {
  const p = blogBySlug(slug);
  if (!p) return <EmptyState title="Post not found" action={<Button onClick={() => navigate('/support/blog')}>Back to the blog</Button>} />;
  const idx = BLOG_POSTS.indexOf(p);
  const next = BLOG_POSTS[(idx + 1) % BLOG_POSTS.length];
  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }, { label: 'Product Blog', href: href('/support/blog') }]} title={p.title} subtitle={`${p.author} · ${fmtDate(p.date)} · ${p.minutes} min read`} />
      <Panel className="max-w-3xl">
        <p className="text-[14px] text-ink-800 font-medium mb-3">{p.excerpt}</p>
        <Blocks blocks={p.body} />
      </Panel>
      {next && next.slug !== p.slug && (
        <div className="max-w-3xl mt-3 text-[13px]">Next: <a href={href(`/support/blog/${next.slug}`)} className="font-semibold">{next.title}</a></div>
      )}
    </div>
  );
}
