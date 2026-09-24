import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getDbMode, type DbMode } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import type { AgencySettings, Carrier, Staff } from '@/lib/types';

/** Agency-wide reference data every screen needs: settings, staff, carriers and the signed-in user. */
type AppData = {
  mode: DbMode;
  settings: AgencySettings | null;
  staff: Staff[];
  activeStaff: Staff[];
  carriers: Carrier[];
  appointedCarriers: Carrier[];
  /** The staff member acting as the current user ("me"). */
  me: Staff | null;
  staffColor: (name: string | null | undefined) => string;
  loading: boolean;
};

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const settings = useTable('agency_settings', { order: { column: 'created_at' }, limit: 1 });
  const staff = useTable('staff', { order: { column: 'name' } });
  const carriers = useTable('carriers', { order: { column: 'name' } });

  const value = useMemo<AppData>(() => {
    const s = settings.data[0] ?? null;
    const me = staff.data.find((m) => m.name === s?.current_user_name) ?? staff.data[0] ?? null;
    return {
      mode: getDbMode(),
      settings: s,
      staff: staff.data,
      activeStaff: staff.data.filter((m) => m.active),
      carriers: carriers.data,
      appointedCarriers: carriers.data.filter((c) => c.appointed),
      me,
      staffColor: (name) => staff.data.find((m) => m.name === name)?.color ?? '#8f8484',
      loading: settings.loading || staff.loading || carriers.loading,
    };
  }, [settings.data, settings.loading, staff.data, staff.loading, carriers.data, carriers.loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
