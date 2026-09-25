import { Check as CheckIcon, Copy, Download, ExternalLink, KeyRound, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, Pills, Select, useFeedback, type Column } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { downloadCsv, fmtDate, fmtDateTime } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { LoginEvent } from '@/lib/types';
import { CATALOG_BY_KEY } from '@/modules/marketplace/catalog';
import { useIntegrationActions } from '@/modules/marketplace/logic';
import { AppTile } from '@/modules/marketplace/shared';
import { OInput } from '@/modules/accounts/applicant-fields';
import { hashPassword, newTotpSecret, otpauthUri, passwordRules, verifyPassword, verifyTotp } from '@/modules/usersettings/auth';
import { useMySettings } from '@/modules/usersettings/data';
import { H, InfoNote } from '@/modules/usersettings/parts';
import { logEvent, useSession } from '@/modules/usersettings/session';
import { usernameOf } from '@/modules/usersettings/tabs-profile';

export const isAdminRole = (role: string | null | undefined) => role === 'Agency Owner' || role === 'Admin';

// ── Login Activity ──

type Range = '7' | '15' | '30';

/** Short, readable browser/OS summary from a user agent string. */
function agentSummary(ua: string | null) {
  if (!ua) return 'Unknown';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}

export function LoginActivityTab() {
  const { me, staff } = useAppData();
  const admin = isAdminRole(me?.role);
  const [range, setRange] = useState<Range>('7');
  const [who, setWho] = useState<string>(me!.name);
  const since = useMemo(() => new Date(Date.now() - Number(range) * 864e5).toISOString(), [range]);
  const q = useTable('login_events', { order: { column: 'created_at', ascending: false }, ...(admin && who === '__all' ? {} : { eq: { staff_name: admin ? who : me!.name } }) });
  const rows = q.data.filter((r) => r.created_at >= since);

  const columns: Column<LoginEvent>[] = [
    { key: 'date', header: 'Login Date', render: (r) => fmtDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: 'event', header: 'Event', render: (r) => <span className={/Failed/.test(r.event) ? 'text-red-600 font-medium' : ''}>{r.event}</span>, sortValue: (r) => r.event },
    { key: 'user', header: 'User', render: (r) => usernameOf(r.staff_name), sortValue: (r) => r.staff_name },
    { key: 'ip', header: 'IP Address', render: (r) => r.ip ?? <span className="text-ink-400">Not recorded</span> },
    { key: 'agent', header: 'Agent String', render: (r) => <span title={r.user_agent ?? ''}>{agentSummary(r.user_agent)}</span> },
    { key: 'trusted', header: 'Trusted', render: (r) => (r.trusted ? <Badge tone="green">Trusted</Badge> : <Badge>No</Badge>), align: 'center' },
  ];

  return (
    <div>
      <H>Login Activity</H>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pills options={[{ value: '7', label: 'Last 7 days' }, { value: '15', label: 'Last 15 days' }, { value: '30', label: 'Last 30 days' }]} value={range} onChange={setRange} />
        {admin && (
          <Select aria-label="User" value={who} onChange={(e) => setWho(e.target.value)} className="w-56"
            options={[{ value: '__all', label: 'All users' }, ...staff.map((s) => ({ value: s.name, label: s.name }))]} />
        )}
        <div className="flex-1" />
        <Button icon={<Download size={15} />} disabled={!rows.length}
          onClick={() => downloadCsv(`login-activity-${range}d.csv`, rows.map((r) => ({ date: r.created_at, event: r.event, user: usernameOf(r.staff_name), ip: r.ip ?? '', agent: r.user_agent ?? '', trusted: r.trusted ? 'Yes' : 'No' })))}>
          Export CSV
        </Button>
      </div>
      <DataTable columns={columns} rows={rows} loading={q.loading} initialSort={{ key: 'date', dir: 'desc' }}
        empty={<EmptyState title="No activity" message={`No sign-in activity in the last ${range} days.`} />} />
      <p className="text-xs text-ink-500 mt-3">Browsers can't see their own public IP address, so IPs aren't recorded in this training system.</p>
    </div>
  );
}

// ── Two Factor ──

const group = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

export function TwoFactorTab() {
  const { me, row, save } = useMySettings();
  const session = useSession();
  const { toast, confirm } = useFeedback();
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = !!row?.totp_enabled && !!row.totp_secret;
  const trusted = !!session?.trusted;

  const verifyAndEnable = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (!(await verifyTotp(pending, code))) { toast('That code is not valid. Check the time on your device and try again.', 'error'); return; }
      await save({ totp_secret: pending, totp_enabled: true });
      await logEvent(me!.name, 'Two-Factor Enabled', trusted);
      setPending(null); setCode('');
      toast('Two-factor authentication is on.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!row?.totp_secret) return;
    setBusy(true);
    try {
      if (!(await verifyTotp(row.totp_secret, code))) { toast('Enter a current code from your authenticator app to turn two-factor off.', 'error'); return; }
      if (!(await confirm({ title: 'Turn off two-factor?', message: 'Signing in will only need your password.', confirmLabel: 'Turn off', danger: true }))) return;
      await save({ totp_secret: null, totp_enabled: false });
      await logEvent(me!.name, 'Two-Factor Disabled', trusted);
      setCode('');
      toast('Two-factor authentication is off.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast('Copied to clipboard.', 'info'), () => toast('Copy failed. Select the key and copy it manually.', 'error'));
  const codeInput = (
    <div className="w-56">
      <OInput label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(x) => setCode(x.replace(/\D/g, '').slice(0, 6))} />
    </div>
  );

  return (
    <div className="max-w-[760px]">
      <H>Two Factor Authentication</H>
      <InfoNote>Two-factor adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) to sign-in. This is a training sign-in, not secure authentication.</InfoNote>

      {enabled ? (
        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-green-700"><ShieldCheck size={18} /> Two-factor authentication is on</div>
          <p className="text-[13px] text-ink-600 mt-1">You'll be asked for a code each time you sign in.</p>
          <div className="flex flex-wrap items-end gap-3 mt-5">
            {codeInput}
            <Button variant="danger" icon={<ShieldOff size={15} />} loading={busy} disabled={code.length !== 6} onClick={disable}>Turn off</Button>
          </div>
        </div>
      ) : pending ? (
        <div className="rounded border border-ink-200 bg-white p-5">
          <ol className="list-decimal pl-5 space-y-4 text-[14px] text-ink-800">
            <li>
              In your authenticator app, add an account and enter this setup key (time-based):
              <div className="flex items-center gap-2 mt-2">
                <code data-testid="totp-secret" className="font-mono text-[15px] tracking-wider bg-ink-50 border border-ink-200 rounded px-3 py-2 select-all">{group(pending)}</code>
                <Button size="sm" icon={<Copy size={14} />} onClick={() => copy(pending)}>Copy</Button>
              </div>
              <a className="inline-flex items-center gap-1 text-[13px] text-brand-700 hover:underline mt-2" href={otpauthUri(pending, usernameOf(me!.name))}>
                Open in authenticator app <ExternalLink size={12} />
              </a>
              <span className="text-xs text-ink-500 ml-2">(works on phones with an authenticator installed)</span>
            </li>
            <li>
              Enter the 6-digit code the app shows:
              <div className="flex flex-wrap items-end gap-3 mt-3">
                {codeInput}
                <Button variant="primary" icon={<CheckIcon size={15} />} loading={busy} disabled={code.length !== 6} onClick={verifyAndEnable}>Verify &amp; turn on</Button>
                <Button variant="ghost" icon={<X size={15} />} onClick={() => { setPending(null); setCode(''); }}>Cancel</Button>
              </div>
            </li>
          </ol>
        </div>
      ) : (
        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink-800"><ShieldOff size={18} className="text-ink-400" /> Two-factor authentication is off</div>
          <Button variant="primary" className="mt-4" icon={<ShieldCheck size={15} />} onClick={() => { setPending(newTotpSecret()); setCode(''); }}>Set up two-factor</Button>
        </div>
      )}
    </div>
  );
}

// ── Change Password ──

export function ChangePasswordTab() {
  const { me, row, save } = useMySettings();
  const session = useSession();
  const { toast, confirm } = useFeedback();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const has = !!row?.password_hash;
  const rules = passwordRules(pw);
  const allOk = rules.every((r) => r.ok);
  const match = pw.length > 0 && pw === again;

  const checkCurrent = async () => {
    if (!has) return true;
    if (await verifyPassword(cur, row!.password_hash!, row!.password_salt!)) return true;
    toast('Your current password is incorrect.', 'error');
    await logEvent(me!.name, 'Failed Password Change', !!session?.trusted);
    return false;
  };

  const onSave = async () => {
    if (!allOk) { toast('The new password does not meet all the requirements.', 'error'); return; }
    if (!match) { toast('The passwords do not match.', 'error'); return; }
    setBusy(true);
    try {
      if (!(await checkCurrent())) return;
      if (has && (await verifyPassword(pw, row!.password_hash!, row!.password_salt!))) { toast('Choose a password different from your current one.', 'error'); return; }
      const { hash, salt } = await hashPassword(pw);
      await save({ password_hash: hash, password_salt: salt, password_updated_at: new Date().toISOString() });
      await logEvent(me!.name, has ? 'Password Changed' : 'Password Set', !!session?.trusted);
      setCur(''); setPw(''); setAgain('');
      toast(has ? 'Password changed.' : 'Password set. You will need it next time you sign in.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const onRemove = async () => {
    if (!cur) { toast('Enter your current password to remove it.', 'error'); return; }
    setBusy(true);
    try {
      if (!(await checkCurrent())) return;
      if (!(await confirm({ title: 'Remove password?', message: 'Anyone using this browser could sign in as you without a password.', confirmLabel: 'Remove', danger: true }))) return;
      await save({ password_hash: null, password_salt: null, password_updated_at: new Date().toISOString() });
      await logEvent(me!.name, 'Password Removed', !!session?.trusted);
      setCur('');
      toast('Password removed.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-[760px]">
      <H>Change Password</H>
      <InfoNote>
        {has ? <>Your password was last changed {row?.password_updated_at ? fmtDate(row.password_updated_at) : 'at an unknown date'}.</> : <>You don't have a password yet. Setting one makes the sign-in screen ask for it.</>}
        {' '}Passwords are stored as salted PBKDF2 hashes; this is still a training sign-in, not secure authentication.
      </InfoNote>
      <form className="space-y-6 max-w-[380px]" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        {has && <OInput label="Current Password" type="password" required="proceed" value={cur} onChange={setCur} />}
        <OInput label="New Password" type="password" required="proceed" value={pw} onChange={setPw} />
        <OInput label="Confirm New Password" type="password" required="proceed" value={again} onChange={setAgain}
          {...(again && !match ? { level: 'proceed' as const, message: 'Passwords do not match' } : {})} />
        <ul className="text-[13px] space-y-1" aria-label="Password requirements">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? 'text-green-700' : 'text-ink-500'}>
              <span className="inline-block w-4">{r.ok ? '✓' : '•'}</span>{r.label}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" icon={<KeyRound size={15} />} loading={busy} disabled={!allOk || !match || (has && !cur)}>{has ? 'Change password' : 'Set password'}</Button>
          <Button onClick={() => { setCur(''); setPw(''); setAgain(''); }} disabled={busy}>Reset</Button>
          {has && <button type="button" onClick={onRemove} disabled={busy} className="text-[13px] text-red-600 hover:underline disabled:opacity-50">Remove password</button>}
        </div>
      </form>
    </div>
  );
}

// ── Third Party Apps ──

export function ThirdPartyTab() {
  const { me } = useAppData();
  const q = useTable('integrations', { order: { column: 'created_at', ascending: false } });
  const { busyId, togglePause } = useIntegrationActions();
  const { confirm } = useFeedback();
  const mine = q.data.flatMap((r) => {
    const item = CATALOG_BY_KEY.get(r.integration_key);
    return item && (r.activated_by === me!.name || !r.activated_by) ? [{ row: r, item }] : [];
  });

  return (
    <div className="max-w-[900px]">
      <H>Third Party Apps</H>
      <p className="text-[14px] text-ink-600 mb-4">Apps you've connected from the Marketplace. Revoking access pauses the app; you can restore it any time.</p>
      {q.loading && !q.data.length ? null : mine.length === 0 ? (
        <EmptyState title="No connected apps" message="Apps you activate in the Marketplace will show up here."
          action={<a href={href('/marketplace')}><Button variant="primary">Browse Marketplace</Button></a>} />
      ) : (
        <div className="divide-y divide-ink-100 rounded border border-ink-200 bg-white">
          {mine.map(({ row, item }) => (
            <div key={row.id} className="flex flex-wrap items-center gap-4 p-4">
              <AppTile item={item} size={40} />
              <div className="min-w-0 flex-1">
                <a href={href(`/marketplace/app/${item.key}`)} className="text-[14px] font-medium text-ink-900 hover:underline">{item.name}</a>
                <div className="text-xs text-ink-500">{item.category} · connected {fmtDate(row.created_at)}</div>
              </div>
              <Badge tone={row.status === 'Active' ? 'green' : row.status === 'Paused' ? 'gray' : 'amber'}>{row.status === 'Paused' ? 'Access revoked' : row.status}</Badge>
              {row.status === 'Paused' ? (
                <Button size="sm" loading={busyId === row.id} onClick={() => togglePause(item, row)}>Restore access</Button>
              ) : (
                <Button size="sm" variant="danger" loading={busyId === row.id} disabled={row.status !== 'Active'}
                  onClick={async () => { if (await confirm({ title: `Revoke ${item.name}?`, message: 'The app will be paused until you restore access.', confirmLabel: 'Revoke access', danger: true })) togglePause(item, row); }}>
                  Revoke access
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
