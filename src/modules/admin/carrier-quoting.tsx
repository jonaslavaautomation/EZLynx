import { KeyRound, Pencil, ShieldCheck, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorBanner, Field, Input, Menu, Modal, Panel, Pills, useFeedback, type Column, type Tone } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { useTable } from '@/lib/hooks';
import { href } from '@/lib/router';
import type { Carrier, CarrierRatingSetup } from '@/lib/types';
import { AdminHeader, Toggle } from './shared';

type Status = 'Ready' | 'Login required' | 'Disabled' | 'Not set up';
const TONES: Record<Status, Tone> = { Ready: 'green', 'Login required': 'amber', Disabled: 'gray', 'Not set up': 'red' };

type Row = { id: string; carrier: Carrier; setup: CarrierRatingSetup | null; status: Status };

const statusOf = (s: CarrierRatingSetup | null): Status => (!s ? 'Not set up' : !s.active ? 'Disabled' : !s.login_set ? 'Login required' : s.enabled_lines.length ? 'Ready' : 'Disabled');

/** Creates or updates the setup row for a carrier (one row per carrier name). */
async function upsertSetup(carrier: Carrier, existing: CarrierRatingSetup | null, patch: Partial<CarrierRatingSetup>) {
  if (existing) return db.update('carrier_rating_setup', existing.id, patch);
  const [dup] = await db.list('carrier_rating_setup', { eq: { carrier: carrier.name } });
  if (dup) return db.update('carrier_rating_setup', dup.id, patch);
  return db.insert('carrier_rating_setup', { carrier: carrier.name, username: null, agency_code: null, login_set: false, enabled_lines: [...carrier.lines], active: true, ...patch });
}

export function CarrierQuotingPage() {
  const { toast, confirm } = useFeedback();
  const { appointedCarriers, loading } = useAppData();
  const setup = useTable('carrier_rating_setup', { order: { column: 'carrier' } });
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [login, setLogin] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const m = new Map(setup.data.map((s) => [s.carrier, s]));
    return appointedCarriers.map((c) => { const s = m.get(c.name) ?? null; return { id: c.id, carrier: c, setup: s, status: statusOf(s) }; });
  }, [appointedCarriers, setup.data]);
  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;

  const setActive = async (r: Row, active: boolean) => {
    if (busy) return;
    setBusy(r.id);
    try { await upsertSetup(r.carrier, r.setup, { active }); toast(`${r.carrier.name} ${active ? 'enabled' : 'disabled'} for rating`); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const clearLogin = async (r: Row) => {
    if (!r.setup) return;
    const ok = await confirm({ title: `Remove ${r.carrier.name} login?`, message: 'The carrier will show “Login required” and stop returning quotes until a login is set again.', confirmLabel: 'Remove login', danger: true });
    if (!ok) return;
    try { await db.update('carrier_rating_setup', r.setup.id, { login_set: false, username: null }); toast('Login removed'); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const columns: Column<Row>[] = [
    { key: 'carrier', header: 'Carrier', sortValue: (r) => r.carrier.name, render: (r) => <div><div className="font-semibold text-ink-900">{r.carrier.name}</div><div className="text-xs text-ink-400">NAIC {r.carrier.naic ?? '—'}</div></div> },
    { key: 'user', header: 'Login username', render: (r) => (r.setup?.login_set ? <span className="inline-flex items-center gap-1"><KeyRound size={12} className="text-emerald-600" />{r.setup.username || '—'}</span> : <span className="text-ink-300">Not set</span>) },
    { key: 'code', header: 'Agency / producer code', render: (r) => r.setup?.agency_code || <span className="text-ink-300">—</span> },
    {
      key: 'lines', header: 'Lines for rating', className: 'max-w-[280px]',
      render: (r) => {
        const on = r.setup ? r.setup.enabled_lines.filter((l) => r.carrier.lines.includes(l as never)) : r.carrier.lines;
        return <div className="flex flex-wrap gap-1">{on.slice(0, 3).map((l) => <Badge key={l}>{l}</Badge>)}{on.length > 3 && <Badge>+{on.length - 3}</Badge>}<span className="text-[11px] text-ink-400 self-center">{on.length}/{r.carrier.lines.length}</span></div>;
      },
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <Badge tone={TONES[r.status]}>{r.status}</Badge> },
    { key: 'active', header: 'Active', align: 'center', render: (r) => <Toggle label={`${r.carrier.name} active for rating`} checked={r.setup ? r.setup.active : false} disabled={busy === r.id || !r.setup} onChange={(v) => void setActive(r, v)} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end items-center gap-1">
          <Button size="sm" variant={r.setup?.login_set ? 'secondary' : 'primary'} icon={<KeyRound size={13} />} onClick={() => setLogin(r)}>{r.setup?.login_set ? 'Update login' : 'Set login'}</Button>
          <Menu items={[
            { label: 'Edit code & lines', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
            { label: 'Remove login', danger: true, disabled: !r.setup?.login_set, onClick: () => void clearLogin(r) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl">
      <AdminHeader title="Carrier Quoting Setup" subtitle="Carrier logins and rating options — a carrier must have a login set to return quotes in the rater" icon={<Zap size={20} />} />
      {!setup.loading && setup.data.length === 0 && (
        <div className="text-[13px] text-sky-800 bg-sky-50 border border-sky-200 rounded px-3 py-2 mb-3">
          No carriers are set up yet, so the rater currently offers every appointed carrier. Once any carrier is set up here, only <b>Ready</b> carriers are rated for the lines enabled.
        </div>
      )}
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-100">
          <Pills value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: rows.length }, { value: 'Ready', label: 'Ready', count: count('Ready') },
            { value: 'Login required', label: 'Login required', count: count('Login required') }, { value: 'Not set up', label: 'Not set up', count: count('Not set up') },
            { value: 'Disabled', label: 'Disabled', count: count('Disabled') },
          ]} />
          <span className="ml-auto text-xs text-ink-400">Appointments are managed in <a className="text-brand-600 hover:underline" href={href('/settings?tab=carriers')}>Manage Carriers/Markets</a></span>
        </div>
        <ErrorBanner message={setup.error} />
        <DataTable columns={columns} rows={shown} loading={setup.loading || loading} initialSort={{ key: 'carrier', dir: 'asc' }}
          empty={<EmptyState icon={<Zap size={22} />} title={rows.length ? 'No carriers match' : 'No appointed carriers'} message={rows.length ? undefined : 'Appoint carriers under Manage Carriers/Markets first.'} />} />
      </Panel>
      {login && <LoginModal row={login} onClose={() => setLogin(null)} />}
      {editing && <SetupModal row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LoginModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { toast } = useFeedback();
  const [username, setUsername] = useState(row.setup?.username ?? '');
  // The password lives only in this component's state for the length of the dialog — it is never saved.
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(row.setup?.agency_code ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!username.trim()) return setErr('Enter the carrier portal username');
    if (password.length < 4) return setErr('Enter the carrier portal password');
    setBusy(true);
    setErr(null);
    try {
      await new Promise((r) => setTimeout(r, 700)); // simulated connection check
      await upsertSetup(row.carrier, row.setup, { username: username.trim(), agency_code: code.trim() || null, login_set: true, active: row.setup?.active ?? true });
      setPassword('');
      toast(`${row.carrier.name} login verified — ready to rate`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={`Set login — ${row.carrier.name}`} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<ShieldCheck size={14} />} loading={busy} onClick={() => void save()}>Verify & save login</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorBanner message={err} />
        <Field label="Username" required><Input autoFocus autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Password" required><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Agency / producer code"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <div className="text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded px-3 py-2">
          Credentials are held by the carrier connection, not by this system: only the username and the fact that a login was set are saved. The password is discarded when this dialog closes. (Carrier connections are simulated in this training system.)
        </div>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}

function SetupModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { toast } = useFeedback();
  const [code, setCode] = useState(row.setup?.agency_code ?? '');
  const [lines, setLines] = useState<string[]>(row.setup ? row.setup.enabled_lines.filter((l) => row.carrier.lines.includes(l as never)) : [...row.carrier.lines]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    if (!lines.length) return setErr('Enable at least one line — or turn the carrier off with the Active toggle.');
    setBusy(true);
    setErr(null);
    try {
      await upsertSetup(row.carrier, row.setup, { agency_code: code.trim() || null, enabled_lines: lines });
      toast(`${row.carrier.name} rating setup saved`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={`Rating setup — ${row.carrier.name}`} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-3">
        <ErrorBanner message={err} />
        <Field label="Agency / producer code"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Lines enabled for rating</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-ink-100 rounded p-3">
            {row.carrier.lines.map((l) => <Checkbox key={l} label={l} checked={lines.includes(l)} onChange={(on) => setLines((x) => (on ? [...x, l] : x.filter((y) => y !== l)))} />)}
          </div>
          <div className="text-[11px] text-ink-400 mt-1">Only lines this carrier writes (from Manage Carriers/Markets) are listed.</div>
        </div>
      </div>
    </Modal>
  );
}
