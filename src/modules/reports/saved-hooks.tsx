import { useCallback, useMemo, useState } from 'react';
import { useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import type { SavedReport } from '@/lib/types';
import { findReport, type ReportDef } from './registry';
import { NameModal, ScheduleModal, ShareModal } from './modals';

// ── Actions ──

type ModalState = { kind: 'rename' | 'schedule' | 'share' | 'duplicate'; row: SavedReport } | null;

/** Common saved-report actions (favorite, unshare, delete) plus the modal they open. */
export function useSavedReportActions() {
  const { toast, confirm } = useFeedback();
  const { me } = useAppData();
  const [modal, setModal] = useState<ModalState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const guard = useCallback(async (id: string, fn: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusyId(null); }
  }, [busyId, toast]);

  const toggleFavorite = (row: SavedReport) => guard(row.id, async () => {
    await db.update('saved_reports', row.id, { favorite: !row.favorite });
    toast(row.favorite ? `Removed “${row.name}” from favorites` : `Added “${row.name}” to favorites`);
  });
  const unshare = (row: SavedReport) => guard(row.id, async () => {
    await db.update('saved_reports', row.id, { shared: false });
    toast(`“${row.name}” is no longer shared`);
  });
  const remove = async (row: SavedReport, after?: () => void) => {
    const ok = await confirm({ title: 'Delete saved report?', message: <>“{row.name}” will be removed{row.schedule ? ' and its schedule cancelled' : ''}{row.shared ? '. Users it is shared with will lose access' : ''}. The underlying report is not affected.</>, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await guard(row.id, async () => {
      await db.remove('saved_reports', row.id);
      toast('Saved report deleted');
      after?.();
    });
  };

  const element = modal ? (
    modal.kind === 'rename' ? (
      <NameModal title="Rename saved report" initial={modal.row.name} confirmLabel="Rename" onClose={() => setModal(null)} onSubmit={async (name) => {
        await db.update('saved_reports', modal.row.id, { name });
        toast('Saved report renamed');
        setModal(null);
      }} />
    ) : modal.kind === 'duplicate' ? (
      <NameModal title="Duplicate saved report" initial={`${modal.row.name} (copy)`} confirmLabel="Duplicate" onClose={() => setModal(null)} onSubmit={async (name) => {
        await db.insert('saved_reports', { name, report_key: modal.row.report_key, owner: me?.name ?? null, favorite: false, shared: false, schedule: null, schedule_email: null });
        toast('Saved report duplicated');
        setModal(null);
      }} />
    ) : modal.kind === 'schedule' ? (
      <ScheduleModal saved={modal.row} def={findReport(modal.row.report_key)} onClose={() => setModal(null)} />
    ) : (
      <ShareModal saved={modal.row} onClose={() => setModal(null)} />
    )
  ) : null;

  return { toggleFavorite, unshare, remove, open: setModal, busyId, element };
}

// ── Favorites on plain reports ──

/** Favorite state for an unsaved report = any favorite saved report pointing at that report key. */
export function useReportFavorites(rows: SavedReport[]) {
  const { me } = useAppData();
  const { toast } = useFeedback();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const favKeys = useMemo(() => new Set(rows.filter((r) => r.favorite).map((r) => r.report_key)), [rows]);

  const toggle = async (def: ReportDef) => {
    if (busyKey) return;
    setBusyKey(def.key);
    try {
      const mine = rows.filter((r) => r.report_key === def.key && (r.owner ?? null) === (me?.name ?? null));
      if (favKeys.has(def.key)) {
        const favs = rows.filter((r) => r.report_key === def.key && r.favorite);
        for (const r of favs) {
          // A favorite made straight from the report (not renamed, scheduled or shared) is just a bookmark — remove it.
          if (r.name === def.title && !r.schedule && !r.shared) await db.remove('saved_reports', r.id);
          else await db.update('saved_reports', r.id, { favorite: false });
        }
        toast(`Removed ${def.title} from favorites`);
      } else {
        const existing = mine.find((r) => r.name === def.title);
        if (existing) await db.update('saved_reports', existing.id, { favorite: true });
        else await db.insert('saved_reports', { name: def.title, report_key: def.key, owner: me?.name ?? null, favorite: true, shared: false, schedule: null, schedule_email: null });
        toast(`Added ${def.title} to favorites`);
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusyKey(null);
    }
  };
  return { isFavorite: (key: string) => favKeys.has(key), toggle, busyKey };
}

