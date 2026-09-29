/*
 * Document files kept in this browser only (IndexedDB), never uploaded to Supabase. localStorage holds just a few
 * MB in total, so the document list lives there while the file bytes go to IndexedDB, which holds hundreds of MB.
 * A document row points at its file with data_url = "idb:<key>".
 */

const DB_NAME = 'lava-ams-files';
const STORE = 'files';
export const IDB_PREFIX = 'idb:';

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot store files locally.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open browser file storage.'));
  }).catch((e) => { opening = null; throw e; });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError'
      ? new Error('This browser is out of storage space for documents. Delete some documents and try again.')
      : tx.error ?? new Error('Could not save the file in this browser.'));
  }));
}

/** Asks the browser not to clear stored documents when disk space runs low (best effort). */
function persist() { void navigator.storage?.persist?.().catch(() => false); }

export async function putFile(blob: Blob): Promise<string> {
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await run('readwrite', (s) => s.put(blob, key));
  persist();
  return IDB_PREFIX + key;
}

export async function getFile(ref: string): Promise<Blob | null> {
  if (!ref.startsWith(IDB_PREFIX)) return null;
  const blob = await run<Blob>('readonly', (s) => s.get(ref.slice(IDB_PREFIX.length)));
  return blob ?? null;
}

export async function deleteFiles(refs: string[]) {
  const keys = refs.filter((r) => r.startsWith(IDB_PREFIX)).map((r) => r.slice(IDB_PREFIX.length));
  if (!keys.length) return;
  await run('readwrite', (s) => { for (const k of keys) s.delete(k); });
}

/** Removes every stored file (Settings → Reset). */
export function clearFiles() {
  opening = null;
  try { indexedDB.deleteDatabase(DB_NAME); } catch { /* unavailable */ }
}
