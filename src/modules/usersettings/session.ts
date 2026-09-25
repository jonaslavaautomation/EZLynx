import { useEffect, useState } from 'react';
import { db } from '@/lib/db';

/*
 * Per-browser sign-in session for the training sign-in screen. Not real authentication: it decides which staff
 * member the app acts as and records sign-in / sign-out events for the Login Activity tab.
 */

export type Session = { staff_name: string; signed_in_at: string; trusted: boolean };

const KEY = 'northstar-ams:session';
const SIGNED_OUT = 'northstar-ams:signed-out';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

const read = <T,>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
};

export const getSession = () => read<Session>(KEY);
export const wasSignedOut = () => read<boolean>(SIGNED_OUT) === true;

export function useSession() {
  const [s, setS] = useState(getSession);
  useEffect(() => {
    const fn = () => setS(getSession());
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
  }, []);
  return s;
}

/** Records a security event for the Login Activity tab. Browsers can't read their own public IP, so ip is null. */
export async function logEvent(staff_name: string, event: string, trusted = false) {
  try {
    await db.insert('login_events', { staff_name, event, ip: null, user_agent: navigator.userAgent, trusted });
  } catch { /* logging never blocks sign-in */ }
}

export async function signIn(staff_name: string, { trusted = false }: { trusted?: boolean } = {}) {
  write(KEY, { staff_name, signed_in_at: new Date().toISOString(), trusted } satisfies Session);
  write(SIGNED_OUT, null);
  await logEvent(staff_name, 'User Login', trusted);
  emit();
}

export async function signOut() {
  const s = getSession();
  if (s) await logEvent(s.staff_name, 'User Logout', s.trusted);
  write(KEY, null);
  write(SIGNED_OUT, true);
  emit();
}
