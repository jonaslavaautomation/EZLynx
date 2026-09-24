import { LayoutGrid, Plug, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader, SearchInput, Select, cx } from '@/components/ui';
import { useTable } from '@/lib/hooks';
import { href, navigate, setParam, useRoute } from '@/lib/router';
import type { Integration } from '@/lib/types';
import { CATALOG, CATEGORIES, type CatalogItem, type Category } from './catalog';
import { CATEGORY_ICONS } from './logic';
import { AppTile, Disclaimer, IntegrationStatus } from './shared';

export function MarketplaceHome() {
  const { params } = useRoute();
  const rawCat = params.get('cat');
  const category = (CATEGORIES as readonly string[]).includes(rawCat ?? '') ? (rawCat as Category) : null;
  const [search, setSearch] = useState('');
  const integrations = useTable('integrations', { order: { column: 'created_at' } });

  const byKey = useMemo(() => new Map(integrations.data.map((r) => [r.integration_key, r])), [integrations.data]);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return CATALOG.filter((c) => {
      if (category && c.category !== category) return false;
      const hay = `${c.name} ${c.vendor} ${c.category} ${c.short} ${c.features.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [search, category]);

  // Suggest one listing from each category the agency has nothing active in.
  const recommended = useMemo(() => {
    const activeCats = new Set(integrations.data.filter((r) => r.status === 'Active').map((r) => CATALOG.find((c) => c.key === r.integration_key)?.category));
    return CATEGORIES.filter((cat) => !activeCats.has(cat))
      .map((cat) => CATALOG.find((c) => c.category === cat && !byKey.has(c.key)))
      .filter((c): c is CatalogItem => !!c)
      .slice(0, 4);
  }, [integrations.data, byKey]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    CATALOG.forEach((c) => m.set(c.category, (m.get(c.category) ?? 0) + 1));
    return m;
  }, []);

  const active = integrations.data.filter((r) => r.status === 'Active').length;
  const pending = integrations.data.filter((r) => r.status === 'Setup Required').length;
  const setCategory = (c: string | null) => setParam('cat', c);
  const showRecommended = !search && !category && recommended.length > 0;

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle="Browse third-party solutions and activate them from inside Northstar — no development required."
        icon={<Plug size={20} />}
        actions={<Button variant="primary" icon={<LayoutGrid size={15} />} onClick={() => navigate('/marketplace/mine')}>My Integrations</Button>}
      />

      <section className="rounded border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white p-4 sm:p-6 mb-4 shadow-card">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-ink-900">Connect the tools your agency already uses</h2>
          <p className="text-[13px] text-ink-500 mt-1">eSignature, texting, payments, carrier downloads and more. Pick a listing, add it, complete the setup and activate.</p>
          <SearchInput value={search} onChange={setSearch} placeholder="Search integrations, vendors or features…" className="mt-3" />
          <div className="flex flex-wrap gap-2 mt-3 text-xs text-ink-500">
            <span><b className="text-ink-800">{CATALOG.length}</b> listings</span>
            <span aria-hidden>·</span>
            <a href={href('/marketplace/mine')} className="hover:underline"><b className="text-emerald-700">{active}</b> active</a>
            {pending > 0 && <><span aria-hidden>·</span><a href={href('/marketplace/mine')} className="hover:underline"><b className="text-amber-700">{pending}</b> need setup</a></>}
          </div>
        </div>
        <Disclaimer className="mt-4" />
      </section>

      <ErrorBanner message={integrations.error} />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Categories: sidebar on desktop, select on phones */}
        <aside className="hidden lg:block">
          <nav className="bg-white border border-[#e3e3e3] rounded shadow-card py-1 sticky top-4">
            <CategoryButton label="All categories" count={CATALOG.length} active={!category} onClick={() => setCategory(null)} />
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              return <CategoryButton key={c} label={c} icon={<Icon size={14} />} count={counts.get(c) ?? 0} active={category === c} onClick={() => setCategory(c)} />;
            })}
          </nav>
        </aside>
        <div className="lg:hidden">
          <Select value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)} options={[...CATEGORIES]} placeholder="All categories" aria-label="Category" />
        </div>

        <div className="min-w-0 space-y-5">
          {showRecommended && (
            <section>
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800 mb-2"><Sparkles size={14} className="text-brand-500" /> Recommended for your agency</h3>
              <p className="text-xs text-ink-400 -mt-1 mb-2">Categories where you don&rsquo;t have an active integration yet.</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {recommended.map((c) => (
                  <a key={c.key} href={href(`/marketplace/app/${c.key}`)} className="flex items-center gap-3 bg-white border border-[#e3e3e3] rounded shadow-card p-3 hover:border-brand-200 transition-colors min-w-0">
                    <AppTile item={c} size={36} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink-900 truncate">{c.name}</div>
                      <div className="text-[11px] text-ink-400 truncate">{c.category}</div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-semibold text-ink-800 mb-2">
              {category ?? 'All integrations'} <span className="text-ink-400 font-medium">({filtered.length})</span>
            </h3>
            {integrations.loading && !integrations.data.length ? <LoadingBlock /> : filtered.length === 0 ? (
              <div className="bg-white border border-[#e3e3e3] rounded shadow-card">
                <EmptyState title="No integrations match" message="Try a different search or category."
                  action={<Button size="sm" onClick={() => { setSearch(''); setCategory(null); }}>Clear filters</Button>} />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((c) => <ListingCard key={c.key} item={c} row={byKey.get(c.key)} />)}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({ label, icon, count, active, onClick }: { label: string; icon?: ReactNode; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left border-l-2', active ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-transparent bg-transparent text-ink-700 hover:bg-ink-50')}>
      {icon && <span className={active ? 'text-brand-600' : 'text-ink-400'}>{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] text-ink-400">{count}</span>
    </button>
  );
}

function ListingCard({ item, row }: { item: CatalogItem; row: Integration | undefined }) {
  return (
    <a href={href(`/marketplace/app/${item.key}`)} className="flex flex-col bg-white border border-[#e3e3e3] rounded shadow-card p-4 hover:border-brand-200 hover:shadow-pop transition min-w-0">
      <div className="flex items-start gap-3">
        <AppTile item={item} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink-900 leading-tight">{item.name}</div>
          <div className="text-[11px] text-ink-400 mt-0.5">by {item.vendor}</div>
        </div>
        <IntegrationStatus row={row} />
      </div>
      <p className="text-xs text-ink-500 mt-3 flex-1">{item.short}</p>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-50 text-[11px]">
        <span className="text-ink-400">{item.category}</span>
        <span className="font-semibold text-brand-600">{row ? (row.status === 'Setup Required' ? 'Finish setup' : 'Manage') : 'View details'} →</span>
      </div>
    </a>
  );
}
