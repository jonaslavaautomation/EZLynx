import { BookOpen, Check, CheckCircle2, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, DescriptionList, EmptyState, ErrorBanner, LoadingBlock, PageHeader, Panel, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import { ACTIVATED_AT, CATALOG, CATALOG_BY_KEY, type CatalogItem } from './catalog';
import { CATEGORY_ICONS, configSummary, missingFields, useIntegrationActions } from './logic';
import { AppTile, Disclaimer, IntegrationStatus, SetupForm } from './shared';

const crumbs = [{ label: 'Marketplace', href: href('/marketplace') }];

export function IntegrationDetail({ itemKey }: { itemKey: string }) {
  const item = CATALOG_BY_KEY.get(itemKey);
  if (!item) {
    return (
      <div>
        <PageHeader title="Integration not found" breadcrumb={crumbs} />
        <Panel><EmptyState title="This listing doesn't exist" message="It may have been renamed or removed from the catalog." action={<Button size="sm" onClick={() => navigate('/marketplace')}>Back to Marketplace</Button>} /></Panel>
      </div>
    );
  }
  return <DetailBody item={item} />;
}

function DetailBody({ item }: { item: CatalogItem }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const q = useTable('integrations', { eq: { integration_key: item.key } });
  const row = q.data[0];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const { busyId, togglePause, remove } = useIntegrationActions();
  const Icon = CATEGORY_ICONS[item.category];

  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      // integration_key is unique; re-check so a second tab / double click can't create a duplicate.
      const existing = await db.list('integrations', { eq: { integration_key: item.key }, limit: 1 });
      if (existing.length) { toast(`${item.name} is already added`, 'info'); q.reload(); return; }
      await db.insert('integrations', { integration_key: item.key, status: 'Setup Required', config: {}, activated_by: me?.name ?? null });
      toast(`${item.name} added — complete the setup to activate it`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const related = CATALOG.filter((c) => c.category === item.category && c.key !== item.key);
  const missing = row ? missingFields(item, row.config) : [];

  return (
    <div>
      <PageHeader
        breadcrumb={[...crumbs, { label: item.category, href: href(`/marketplace?cat=${encodeURIComponent(item.category)}`) }]}
        title={<span className="flex items-center gap-2 flex-wrap">{item.name} <IntegrationStatus row={row} /></span>}
        subtitle={<>by {item.vendor} · {item.category}</>}
        icon={<AppTile item={item} size={40} />}
        actions={q.loading && !row ? null : !row ? (
          <Button variant="primary" icon={<Plus size={15} />} loading={adding} onClick={() => void add()}>Add integration</Button>
        ) : (
          <>
            {row.status !== 'Setup Required' && (
              <Button icon={row.status === 'Paused' ? <Play size={14} /> : <Pause size={14} />} loading={busyId === row.id} onClick={() => void togglePause(item, row)}>
                {row.status === 'Paused' ? 'Resume' : 'Pause'}
              </Button>
            )}
            <Button variant="ghost" icon={<Trash2 size={14} />} disabled={busyId === row.id} onClick={() => void remove(item, row)} className="text-red-600">Remove</Button>
          </>
        )}
      />
      <ErrorBanner message={q.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4 min-w-0">
          {q.loading && !row ? <Panel><LoadingBlock /></Panel> : row && (row.status === 'Setup Required' || editing) ? (
            <Panel
              title={row.status === 'Setup Required' ? 'Complete setup' : 'Configure'}
              actions={row.status === 'Setup Required' && <span className="text-xs text-amber-700">{missing.length ? `${missing.length} required field${missing.length === 1 ? '' : 's'} left` : 'Ready to activate'}</span>}
            >
              <p className="text-xs text-ink-500 mb-3">
                {row.status === 'Setup Required'
                  ? 'Enter the details from your vendor account, then activate. Save a draft if you need to come back later.'
                  : 'Update the saved setup. Secret values are never stored; re-enter one only to replace it.'}
              </p>
              <SetupForm key={row.id} item={item} row={row} mode={row.status === 'Setup Required' ? 'setup' : 'edit'}
                onDone={() => setEditing(false)} onCancel={editing ? () => setEditing(false) : undefined} />
            </Panel>
          ) : row ? (
            <Panel title="Setup" actions={<Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Configure</Button>}>
              {row.status === 'Paused' && <div className="mb-3 rounded bg-sky-50 text-sky-800 text-xs px-3 py-2">Paused — nothing is sent or received until you resume it.</div>}
              <DescriptionList items={configSummary(item, row.config)} />
            </Panel>
          ) : (
            <Panel bodyClassName="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 text-[13px] text-ink-600">Add this integration to start setup. It will show as <b>Setup Required</b> until you enter the details and activate it.</div>
              <Button variant="primary" icon={<Plus size={15} />} loading={adding} onClick={() => void add()}>Add integration</Button>
            </Panel>
          )}

          <Panel title="Overview">
            <p className="text-[13px] text-ink-700 leading-relaxed">{item.long}</p>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-400 mt-4 mb-2">Features</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {item.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-ink-700"><Check size={15} className="text-emerald-600 shrink-0 mt-0.5" /> {f}</li>
              ))}
            </ul>
          </Panel>

          <Panel title={<h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-900"><BookOpen size={15} className="text-brand-500" /> Before you set up</h2>}>
            <p className="text-[13px] text-ink-600">{item.docsNote}</p>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-400 mt-4 mb-2">You&rsquo;ll need</h3>
            <ul className="space-y-1">
              {item.fields.map((f) => (
                <li key={f.key} className="text-[13px] text-ink-700">
                  {f.label}{f.required ? '' : <span className="text-ink-400"> (optional)</span>}
                  {f.secret && <span className="text-[11px] text-ink-400"> — entered once, never stored</span>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="space-y-4 min-w-0">
          <Panel title="Details">
            <DescriptionList columns={1} items={[
              { label: 'Vendor', value: item.vendor },
              { label: 'Category', value: <span className="inline-flex items-center gap-1.5"><Icon size={14} className="text-ink-400" />{item.category}</span> },
              { label: 'Status', value: <IntegrationStatus row={row} /> },
              ...(row ? [
                { label: 'Added by', value: row.activated_by ?? '—' },
                { label: 'Added', value: fmtDate(row.created_at) },
                ...(row.config[ACTIVATED_AT] ? [{ label: 'Activated', value: fmtDateTime(row.config[ACTIVATED_AT]) }] : []),
              ] : []),
            ]} />
            {row?.status === 'Active' && <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-700"><CheckCircle2 size={14} /> Recorded as active in Northstar</div>}
          </Panel>
          <Disclaimer />
          {related.length > 0 && (
            <Panel title={`More in ${item.category}`}>
              <ul className="space-y-2">
                {related.map((c) => (
                  <li key={c.key}>
                    <a href={href(`/marketplace/app/${c.key}`)} className="flex items-center gap-2 text-[13px] text-ink-800 hover:text-brand-600">
                      <AppTile item={c} size={28} /> <span className="truncate">{c.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
