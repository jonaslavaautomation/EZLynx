import { useState } from 'react';
import { CalendarClock, Copy, ExternalLink, Pencil, Play, Save, Share2, Star, Trash2, Users } from 'lucide-react';
import { Badge, Button, Menu, cx, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { SavedReport } from '@/lib/types';
import { findCategory, type ReportDef } from './registry';
import { NameModal, ScheduleModal } from './modals';
import { nextRun, openSavedReport, reportMeta } from './saved-lib';
import { useReportFavorites, useSavedReportActions } from './saved-hooks';

// ── Card ──

export function SavedReportCard({ row, actions }: { row: SavedReport; actions: ReturnType<typeof useSavedReportActions> }) {
  const meta = reportMeta(row.report_key);
  const next = nextRun(row);
  const busy = actions.busyId === row.id;
  return (
    <div className="bg-white border border-[#e3e3e3] rounded shadow-card p-3 flex flex-col gap-2 min-w-0 hover:border-brand-200 transition-colors">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => actions.toggleFavorite(row)}
          disabled={busy}
          aria-pressed={row.favorite}
          aria-label={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
          title={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="mt-0.5 shrink-0 bg-transparent disabled:opacity-50"
        >
          <Star size={16} className={row.favorite ? 'fill-amber-400 text-amber-500' : 'text-ink-300 hover:text-amber-500'} />
        </button>
        <button type="button" onClick={() => openSavedReport(row)} className="min-w-0 flex-1 text-left bg-transparent">
          <div className="text-[14px] font-semibold text-ink-900 hover:text-brand-700 truncate">{row.name}</div>
          <div className="text-[12px] text-ink-500 truncate">{meta.title}{meta.category && <span className="text-ink-400"> · {meta.category}</span>}</div>
        </button>
        <Menu items={[
          { label: 'Open', icon: <ExternalLink size={14} />, onClick: () => openSavedReport(row) },
          { label: 'Rename', icon: <Pencil size={14} />, onClick: () => actions.open({ kind: 'rename', row }) },
          { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => actions.open({ kind: 'duplicate', row }) },
          { label: row.favorite ? 'Unfavorite' : 'Favorite', icon: <Star size={14} />, onClick: () => actions.toggleFavorite(row), disabled: busy },
          { label: row.shared ? 'Unshare' : 'Share…', icon: <Share2 size={14} />, onClick: () => (row.shared ? actions.unshare(row) : actions.open({ kind: 'share', row })), disabled: busy },
          { label: row.schedule ? 'Edit schedule…' : 'Schedule…', icon: <CalendarClock size={14} />, onClick: () => actions.open({ kind: 'schedule', row }) },
          'divider',
          { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => actions.remove(row), danger: true, disabled: busy },
        ]} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.schedule && <Badge tone="blue"><CalendarClock size={11} />{row.schedule}{next ? ` · next ${fmtDate(next)}` : ''}</Badge>}
        {row.shared && <Badge tone="purple"><Users size={11} />Shared with agency</Badge>}
        {!meta.def && <Badge tone="red">Report unavailable</Badge>}
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-ink-50">
        <div className="text-[11px] text-ink-400 truncate">
          {row.owner ?? 'Unknown owner'} · saved {fmtDate(row.created_at)}
          {row.schedule_email && row.schedule && <> · to {row.schedule_email}</>}
        </div>
        {row.schedule ? (
          <Button size="sm" variant="ghost" icon={<Play size={12} />} onClick={() => openSavedReport(row)} disabled={!meta.def}>Run now</Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />} onClick={() => openSavedReport(row)} disabled={!meta.def}>Open</Button>
        )}
      </div>
    </div>
  );
}

export function FavoriteStar({ on, busy, onClick, size = 16, className }: { on: boolean; busy?: boolean; onClick: () => void; size?: number; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      title={on ? 'Remove from favorites' : 'Add to favorites'}
      className={cx('bg-transparent disabled:opacity-50 shrink-0', className)}
    >
      <Star size={size} className={on ? 'fill-amber-400 text-amber-500' : 'text-ink-300 hover:text-amber-500'} />
    </button>
  );
}

// ── Toolbar shown above every open report ──

export function ReportToolbar({ def, saved, savedMissing, rows }: { def: ReportDef; saved: SavedReport | null; savedMissing: boolean; rows: SavedReport[] }) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const favorites = useReportFavorites(rows);
  const actions = useSavedReportActions();
  const [modal, setModal] = useState<'save' | 'schedule' | null>(null);
  const isFav = saved ? saved.favorite : favorites.isFavorite(def.key);
  const next = saved ? nextRun(saved) : null;
  const category = findCategory(def.categories[0]);

  return (
    <div className="bg-white border border-[#e3e3e3] rounded shadow-card px-3 py-2 mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <div className="min-w-0 flex items-center gap-2">
        <FavoriteStar on={isFav} busy={saved ? actions.busyId === saved.id : favorites.busyKey === def.key} onClick={() => (saved ? actions.toggleFavorite(saved) : favorites.toggle(def))} size={18} />
        <div className="min-w-0">
          {saved ? (
            <>
              <div className="text-[14px] font-semibold text-ink-900 truncate">{saved.name}</div>
              <div className="text-[11px] text-ink-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Saved report · {def.title} · {saved.owner ?? 'Unknown owner'}</span>
                {saved.schedule && <Badge tone="blue"><CalendarClock size={11} />{saved.schedule}{next ? ` · next ${fmtDate(next)}` : ''}</Badge>}
                {saved.shared && <Badge tone="purple"><Users size={11} />Shared with agency</Badge>}
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-ink-400">Reports 5.0{category ? ` · ${category.title}` : ''}</div>
              <div className="text-[14px] font-semibold text-ink-900 truncate">{def.title}</div>
            </>
          )}
          {savedMissing && <div className="text-[11px] text-red-600">That saved report no longer exists — showing the standard report.</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Star size={13} className={isFav ? 'fill-amber-400 text-amber-500' : ''} />} onClick={() => (saved ? actions.toggleFavorite(saved) : favorites.toggle(def))} disabled={saved ? actions.busyId === saved.id : favorites.busyKey === def.key}>
          {isFav ? 'Favorited' : 'Favorite'}
        </Button>
        <Button size="sm" icon={<Save size={13} />} onClick={() => setModal('save')}>Save as…</Button>
        <Button size="sm" icon={<CalendarClock size={13} />} onClick={() => (saved ? actions.open({ kind: 'schedule', row: saved }) : setModal('schedule'))}>{saved?.schedule ? 'Edit schedule…' : 'Schedule…'}</Button>
        {saved && (
          <Menu items={[
            { label: 'Rename', icon: <Pencil size={14} />, onClick: () => actions.open({ kind: 'rename', row: saved }) },
            { label: saved.shared ? 'Unshare' : 'Share…', icon: <Share2 size={14} />, onClick: () => (saved.shared ? actions.unshare(saved) : actions.open({ kind: 'share', row: saved })) },
            'divider',
            { label: 'Delete saved report', icon: <Trash2 size={14} />, danger: true, onClick: () => actions.remove(saved, () => navigate(`/reports?report=${def.key}`, { replace: true })) },
          ]} />
        )}
      </div>
      {modal === 'save' && (
        <NameModal title="Save report as" subtitle={def.title} initial={saved ? `${saved.name} (copy)` : def.title} confirmLabel="Save" onClose={() => setModal(null)} onSubmit={async (name) => {
          const row = await db.insert('saved_reports', { name, report_key: def.key, owner: me?.name ?? null, favorite: false, shared: false, schedule: null, schedule_email: null });
          toast(`Saved “${name}” to Saved Reports`);
          setModal(null);
          openSavedReport(row);
        }} />
      )}
      {modal === 'schedule' && <ScheduleModal saved={null} def={def} onClose={() => setModal(null)} onSaved={(row) => openSavedReport(row)} />}
      {actions.element}
    </div>
  );
}
