import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useAppData } from '@/lib/app-context';
import { useTable } from '@/lib/hooks';
import { SignInScreen } from '@/modules/usersettings/SignInScreen';
import { signIn, useSession, wasSignedOut } from '@/modules/usersettings/session';

// One automatic sign-in per page load (StrictMode runs effects twice).
let autoSigning = false;

/**
 * Shows the training sign-in screen when nobody is signed in on this browser. First visits sign in automatically
 * as the agency's current user, unless that user protected their account with a password or two-factor,
 * or someone signed out here on purpose.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const { staff, settings, loading } = useAppData();
  const userSettings = useTable('user_settings', {});
  const current = session ? staff.find((s) => s.name === session.staff_name && s.active) : undefined;
  const fallback = staff.find((s) => s.active && s.name === settings?.current_user_name) ?? staff.find((s) => s.active);
  const fallbackRow = fallback ? userSettings.data.find((r) => r.staff_name === fallback.name) : undefined;
  const ready = !loading && !userSettings.loading;
  const canAuto = ready && !current && !wasSignedOut() && !!fallback && !fallbackRow?.password_hash && !fallbackRow?.totp_enabled;

  useEffect(() => {
    if (!canAuto || autoSigning || !fallback) return;
    autoSigning = true;
    signIn(fallback.name).finally(() => { autoSigning = false; });
  }, [canAuto, fallback]);

  if (current) return <>{children}</>;
  // No staff at all (empty agency): nothing to sign in as, so let the app run with its own empty states.
  if (ready && staff.length === 0) return <>{children}</>;
  if (!ready || canAuto) {
    return <div className="min-h-[var(--vh100)] grid place-items-center bg-[#f8f6f6] text-[13px] text-ink-500"><span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-brand-500" /> Signing in…</span></div>;
  }
  return <SignInScreen />;
}
