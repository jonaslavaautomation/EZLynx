import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Avatar, ErrorBanner, cx } from '@/components/ui';
import { db } from '@/lib/db';
import type { Staff, UserSettings } from '@/lib/types';
import { verifyPassword, verifyTotp } from '@/modules/usersettings/auth';
import { logEvent, signIn } from '@/modules/usersettings/session';

/** Training sign-in: pick your user; enter a password and authenticator code if you set them in User Settings. */
export function SignInScreen() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [settings, setSettings] = useState<Map<string, UserSettings>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([db.list('staff', { order: { column: 'name' } }), db.list('user_settings')]).then(([s, u]) => {
      setStaff(s.filter((x) => x.active));
      setSettings(new Map(u.map((r) => [r.staff_name, r])));
    }).catch((e: Error) => setError(e.message));
  }, []);

  const row = picked ? settings.get(picked) ?? null : null;
  const needsPassword = !!row?.password_hash;
  const needsCode = !!row?.totp_enabled && !!row.totp_secret;
  useEffect(() => { setPassword(''); setCode(''); setError(null); if (picked) setTimeout(() => pwRef.current?.focus(), 50); }, [picked]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (needsPassword && !(await verifyPassword(password, row!.password_hash!, row!.password_salt!))) {
        await logEvent(picked, 'Failed Login', trusted);
        setError('Incorrect password.');
        return;
      }
      if (needsCode && !(await verifyTotp(row!.totp_secret!, code))) {
        await logEvent(picked, 'Failed Login (two-factor)', trusted);
        setError('That authenticator code is not valid. Codes change every 30 seconds.');
        return;
      }
      await signIn(picked, { trusted });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[var(--vh100)] grid place-items-center bg-[#f8f6f6] p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-md shadow-pop border border-ink-100 p-7">
        <div className="flex items-center gap-3 mb-5">
          <Logo size={44} />
          <div>
            <h1 className="text-xl font-semibold text-ink-900">Sign in</h1>
            <p className="text-[13px] text-ink-500">Choose your user to continue.</p>
          </div>
        </div>
        <ErrorBanner message={error} />
        <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto" role="radiogroup" aria-label="User">
          {staff.length === 0 && !error && <div className="flex items-center gap-2 text-[13px] text-ink-500 py-4"><Loader2 size={15} className="animate-spin" /> Loading users…</div>}
          {staff.map((s) => {
            const r = settings.get(s.name);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={picked === s.name} onClick={() => setPicked(s.name)}
                className={cx('w-full flex items-center gap-3 rounded !border px-3 py-2.5 text-left transition-colors', picked === s.name ? '!border-brand-400 !bg-brand-50' : '!border-ink-200 !bg-white hover:!border-ink-300')}>
                <Avatar name={s.name} color={s.color} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-900">{s.name}</span>
                  <span className="block text-xs text-ink-500">{s.role}</span>
                </span>
                {r?.password_hash && <KeyRound size={14} className="text-ink-400" aria-label="Password protected" />}
                {r?.totp_enabled && <ShieldCheck size={14} className="text-ink-400" aria-label="Two-factor enabled" />}
              </button>
            );
          })}
        </div>

        {picked && needsPassword && (
          <label className="block mt-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Password</span>
            <input ref={pwRef} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 rounded border border-ink-300 px-3 text-[14px] outline-none focus:border-brand-500" />
          </label>
        )}
        {picked && needsCode && (
          <label className="block mt-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Authenticator code</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="w-full h-10 rounded border border-ink-300 px-3 text-[14px] tracking-[0.3em] outline-none focus:border-brand-500" />
          </label>
        )}
        {picked && (
          <label className="flex items-center gap-2 mt-4 text-[13px] text-ink-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#dc2626]" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} /> Trust this computer
          </label>
        )}
        <button type="submit" disabled={!picked || busy} className="mt-5 w-full h-10 rounded bg-brand-500 hover:bg-brand-600 text-white text-[14px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={15} className="animate-spin" />}Sign in
        </button>
        <p className="text-[11px] text-ink-400 mt-4">This is a training sign-in for the demo agency, not secure authentication. Set a password or two-factor under User Settings.</p>
      </form>
    </div>
  );
}
