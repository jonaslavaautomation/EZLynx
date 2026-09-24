import { useCallback, useEffect, useRef, useState } from 'react';
import { db, onDbChange, type ListQuery } from '@/lib/db';
import type { TableMap, TableName } from '@/lib/types';

type Loadable<T> = { data: T; loading: boolean; error: string | null; reload: () => void };

/** Live list of rows; re-fetches whenever `table` (or `alsoWatch`) changes. Pass `null` query to skip. */
export function useTable<K extends TableName>(table: K, query: ListQuery<K> | null = {}, alsoWatch: TableName[] = []): Loadable<TableMap[K][]> {
  const [data, setData] = useState<TableMap[K][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(query);
  const watch = alsoWatch.join(',');
  const seq = useRef(0);

  const load = useCallback(() => {
    const n = ++seq.current; // also invalidates in-flight loads when the query becomes null
    if (query === null) { setData([]); setLoading(false); return; }
    db.list(table, query)
      .then((rows) => { if (n === seq.current) { setData(rows); setError(null); } })
      .catch((e: Error) => { if (n === seq.current) setError(e.message); })
      .finally(() => { if (n === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, key]);

  useEffect(() => {
    setLoading(true);
    load();
    const watched = new Set<TableName>([table, ...(watch ? (watch.split(',') as TableName[]) : [])]);
    return onDbChange((t) => { if (watched.has(t)) load(); });
  }, [load, table, watch]);

  return { data, loading, error, reload: load };
}

/** Live single row by id. */
export function useRow<K extends TableName>(table: K, id: string | null | undefined): Loadable<TableMap[K] | null> {
  const [data, setData] = useState<TableMap[K] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    // Ignore responses for a previous id (or an earlier reload) that arrive late.
    const n = ++seq.current;
    if (!id) { setData(null); setLoading(false); return; }
    db.get(table, id)
      .then((row) => { if (n === seq.current) { setData(row); setError(null); } })
      .catch((e: Error) => { if (n === seq.current) setError(e.message); })
      .finally(() => { if (n === seq.current) setLoading(false); });
  }, [table, id]);

  useEffect(() => {
    setLoading(true);
    setData(null); // don't show the previous id's row while the new one loads
    load();
    return onDbChange((t) => { if (t === table) load(); });
  }, [load, table]);

  return { data, loading, error, reload: load };
}

/** Wraps an async action with busy state and error capture. Resolves true on success. */
export function useAsyncAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (...args: A) => {
    setBusy(true);
    setError(null);
    try {
      await fn(...args);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [fn]);
  return { run, busy, error, setError };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
