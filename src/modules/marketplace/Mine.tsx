import { ExternalLink, LayoutGrid, Pause, Pencil, Play, Store, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, ErrorBanner, Menu, Modal, PageHeader, Panel, Pills, type Column } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Integration } from '@/lib/types';
import { CATALOG_BY_KEY, secretFlag, type CatalogItem } from './catalog';
import { missingFields, useIntegrationActions } from './logic';
import { AppTile, Disclaimer, IntegrationStatus, SetupForm } from './shared';

type Row = Integration & { item: CatalogItem };
type Filter = 'all' | Integration['status'];

export function MyIntegrations() {
  const q = useTable('integrations', { order: { column: 'created_at', ascending: false } });
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const { busyId, togglePause, remove } = useIntegrationActions();

  // Rows whose key is no longer in the catalog are skipped (nothing to render or configure).
  const rows = useMemo<Row[]>(() => q.data.flatMap((r) => {
    const item = CATALOG_BY_KEY.get(r.integration_key);
    return item ? [{ ...r, item }] : [];
  }), [q.data]);
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const count = (s: Filter) => (s === 'all' ? rows.length : rows.filter((r) => r.status === s).length);
  // Keep the modal's row fresh after saves.
  const editingRow = editing ? rows.find((r) => r.id === editing.id) ?? null : null;

  const columns: Column<Row>[] = [
    {
      key: 'name', header: 'Integration', sortValue: (r) => r.item.name,
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <AppTile item={r.item} size={32} />
          <div className="min-w-0">
            <div className="font-semibold text-ink-900 truncate">{r.item.name}</div>
            <div className="text-[11px] text-ink-400 truncate">{r.item.category}</div>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <IntegrationStatus row={r} /> },
    { key: 'by', header: 'Activated by', sortValue: (r) => r.activated_by, render: (r) => r.activated_by ?? <span className="text-ink-300">—</span> },
    { key: 'date', header: 'Added', sortValue: (r) => r.created_at, render: (r) => <span className="whitespace-nowrap">{fmtDate(r.created_at)}</span> },
    { key: 'config', header: 'Setup', render: (r) => <ConfigCell row={r} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditing(r)} disabled={busyId === r.id}>{r.status === 'Setup Required' ? 'Finish setup' : 'Configure'}</Button>
          <Menu items={[
            { label: 'View listing', icon: <ExternalLink size={14} />, onClick: () => navigate(`/marketplace/app/${r.item.key}`) },
            ...(r.status !== 'Setup Required' ? [{
              label: r.status === 'Paused' ? 'Resume' : 'Pause', icon: r.status === 'Paused' ? <Play size={14} /> : <Pause size={14} />,
              disabled: busyId === r.id, onClick: () => void togglePause(r.item, r),
            }] : []),
            'divider' as const,
            { label: 'Remove', icon: <Trash2 size={14} />, danger: true, disabled: busyId === r.id, onClick: () => void remove(r.item, r) },
          ]} />
        </div>
      ),
    },
  ];

  const filters: Filter[] = ['all', 'Active', 'Setup Required', 'Paused'];

  return (
    <div>
      <PageHeader
        title="My Integrations"
        subtitle="Integrations your agency has added from the Marketplace."
        breadcrumb={[{ label: 'Marketplace', href: href('/marketplace') }]}
        icon={<LayoutGrid size={20} />}
        actions={<Button variant="primary" icon={<Store size={15} />} onClick={() => navigate('/marketplace')}>Browse Marketplace</Button>}
      />
      <ErrorBanner message={q.error} />
      <Panel
        title={<Pills value={filter} onChange={setFilter} options={filters.map((f) => ({ value: f, label: f === 'all' ? 'All' : f, count: count(f) }))} />}
        bodyClassName="p-0"
      >
        <DataTable
          columns={columns}
          rows={visible}
          loading={q.loading && !q.data.length}
          onRowClick={(r) => navigate(`/marketplace/app/${r.item.key}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={rows.length === 0 ? (
            <EmptyState icon={<Store size={22} />} title="No integrations yet"
              message="Browse the Marketplace to add eSignature, texting, payments, carrier downloads and more."
              action={<Button variant="primary" size="sm" onClick={() => navigate('/marketplace')}>Go to Marketplace</Button>} />
          ) : (
            <EmptyState title={`No ${filter} integrations`} action={<Button size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
          )}
        />
      </Panel>
      <Disclaimer className="mt-4" />

      {editingRow && (
        <Modal
          title={`${editingRow.status === 'Setup Required' ? 'Set up' : 'Configure'} ${editingRow.item.name}`}
          subtitle={<>Status: {editingRow.status}</>}
          onClose={() => setEditing(null)}
        >
          <SetupForm key={editingRow.id} item={editingRow.item} row={editingRow}
            mode={editingRow.status === 'Setup Required' ? 'setup' : 'edit'}
            onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function ConfigCell({ row }: { row: Row }) {
  const { item, config } = row;
  const missing = missingFields(item, config);
  const filled = item.fields.filter((f) => (f.secret ? config[secretFlag(f.key)] === 'true' : !!config[f.key]));
  const first = item.fields.find((f) => !f.secret && config[f.key]);
  return (
    <div className="text-xs min-w-[160px]">
      <div className="text-ink-700 truncate max-w-[240px]">{first ? <>{first.label}: <b className="font-semibold">{config[first.key]}</b></> : <span className="text-ink-400">Nothing entered yet</span>}</div>
      <div className={missing.length ? 'text-amber-700' : 'text-ink-400'}>
        {filled.length} of {item.fields.length} fields{missing.length ? ` · ${missing.length} required missing` : ''}
      </div>
    </div>
  );
}
