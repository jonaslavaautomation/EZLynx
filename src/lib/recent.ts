/** Recently opened applicants (accounts), most recent first. Kept per browser, like a user's history. */

const KEY = 'northstar-ams:recent-accounts';
const MAX = 10;
const EVENT = 'northstar-ams:recent-change';

export function getRecentAccountIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function trackRecentAccount(id: string) {
  const next = [id, ...getRecentAccountIds().filter((x) => x !== id)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

export function onRecentChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
