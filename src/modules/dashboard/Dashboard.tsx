import {
  ArrowLeft, ArrowRight, BarChart3, Calculator, CalendarClock, CheckCircle2, ClipboardList, FolderOpen, PlugZap, ShieldAlert, Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, StatCard, cx, useFeedback } from '@/components/ui';
import { useAlerts } from '@/components/Layout';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { commissionOf } from '@/lib/domain';
import { accountName, daysUntil, fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { useESignCounts } from '@/modules/documents';
import { href, navigate } from '@/lib/router';
import type { ESignStatus } from '@/lib/types';
import { Card, ClaimsDownloads, PerformanceGoals, PolicyDownloads, StatRow, UnderwritingRequests, dash } from '@/modules/dashboard/widgets';

const SLIDES = [
  { kicker: 'COMPARATIVE RATER', title: <>Quote smarter.<br /><em>Bind faster.</em></>, cta: 'Start a quote', to: '/quotes/new', bg: '#351018', img: 'https://images.pexels.com/photos/7731330/pexels-photo-7731330.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { kicker: 'RENEWALS QUEUE', title: <>Never miss<br /><em>a renewal.</em></>, cta: 'Open renewals', to: '/policies?view=renewals', bg: '#5e1216', img: 'https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { kicker: 'REPORTS', title: <>Know your<br /><em>book cold.</em></>, cta: 'View reports', to: '/reports', bg: '#3d0b0e', img: 'https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
];

function Promo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, []);
  const s = SLIDES[i];
  return (
    <div className="promo-wrap xl:col-span-2">
      <button className="carousel-arrow left" onClick={() => setI((i + SLIDES.length - 1) % SLIDES.length)} aria-label="Previous"><ArrowLeft size={18} /></button>
      <div className="promo-card" style={{ background: s.bg }}>
        <div className="promo-image" style={{ ['--promo-img' as string]: `url('${s.img}')` }} />
        <div className="promo-copy">
          <span className="promo-kicker">{s.kicker}</span>
          <h1>{s.title}</h1>
          <button className="learn-button" onClick={() => navigate(s.to)}>{s.cta} <ArrowRight size={15} /></button>
        </div>
        <div className="promo-dots">{SLIDES.map((_, k) => <button key={k} className={k === i ? 'active' : ''} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}</div>
      </div>
      <button className="carousel-arrow right" onClick={() => setI((i + 1) % SLIDES.length)} aria-label="Next"><ArrowRight size={18} /></button>
    </div>
  );
}

export function Dashboard() {
  const { me, settings, appointedCarriers, staffColor } = useAppData();
  const { toast } = useFeedback();
  const policies = useTable('policies', {});
  const activities = useTable('activities', { eq: { status: 'Open' } }, ['activities']);
  const inProgress = useTable('activities', { eq: { status: 'In Progress' } });
  const messages = useTable('messages', {});
  const claims = useTable('claims', {});
  const quotes = useTable('quotes', {});
  const accounts = useTable('accounts', {});
  const alerts = useAlerts();

  const names = useMemo(() => new Map(accounts.data.map((a) => [a.id, accountName(a)])), [accounts.data]);
  const active = policies.data.filter((p) => p.status === 'Active');
  const written = active.reduce((s, p) => s + Number(p.premium), 0);
  const commission = active.reduce((s, p) => s + commissionOf(p), 0);


  const renewals = active
    .map((p) => ({ p, d: daysUntil(p.expiration_date) ?? 999 }))
    .filter((x) => x.d >= 0 && x.d <= (settings?.renewal_reminder_days ?? 60))
    .sort((a, b) => a.d - b.d);

  const myTasks = [...activities.data, ...inProgress.data]
    .filter((a) => !me || a.assigned_to === me.name)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const overdue = myTasks.filter((a) => (daysUntil(a.due_date) ?? 1) < 0).length;

  const esign = useESignCounts();

  const sms = messages.data.filter((m) => m.channel === 'SMS');
  const unresolved = messages.data.filter((m) => m.direction === 'Inbound' && !m.read).length;
  const openClaims = claims.data.filter((c) => c.status === 'Open' || c.status === 'Under Review').length;
  const openQuotes = quotes.data.filter((q) => q.status === 'Draft' || q.status === 'Rated').length;

  const complete = async (id: string) => {
    try {
      await db.update('activities', id, { status: 'Completed', completed_at: new Date().toISOString() });
      toast('Task completed');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-[1500px]">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{greeting}{me ? `, ${me.name.split(' ')[0]}` : ''}</h1>
          <p className="text-[13px] text-ink-400">{settings?.name ?? 'Your agency'} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Active policies" value={fmtNumber(active.length)} hint={`${fmtNumber(accounts.data.filter((a) => a.status === 'Active').length)} active clients`} icon={<FolderOpen size={17} />} onClick={() => navigate('/policies?view=active')} />
        <StatCard label="Written premium" value={fmtMoney(written)} hint={`${fmtMoney(commission)} est. commission`} icon={<BarChart3 size={17} />} tone="green" onClick={() => navigate('/reports?report=book')} />
        <StatCard label="My open tasks" value={myTasks.length} hint={overdue ? <span className="text-red-600">{overdue} overdue</span> : 'None overdue'} icon={<ClipboardList size={17} />} tone="amber" onClick={() => navigate('/activities')} />
        <StatCard label="Open quotes · claims" value={`${openQuotes} · ${openClaims}`} hint="Pipeline and claims in progress" icon={<Calculator size={17} />} tone="purple" onClick={() => navigate('/quotes')} />
      </div>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-5 items-start">
        <Promo />

        <Card title="Need Help Getting Started?">
          <p className="teal-intro">Set up your agency</p>
          <div className="help-links">
            <a href={href('/settings?tab=agency')}>Agency profile & users</a>
            <a href={href('/settings?tab=carriers')}>Carrier appointments</a>
            <a href={href('/accounts/new?type=Personal')}>Add your first account</a>
            <a href={href('/settings?tab=data')}>Import data or load samples</a>
          </div>
          <button className="ask-button" onClick={() => navigate('/quotes/new')}><Sparkles size={16} /> Run a quote</button>
        </Card>

        <PerformanceGoals />

        <Card title="Text Messages">
          <StatRow label="Sent / Received" value={dash(sms.length)} to="/messages" />
          <StatRow label="Unresolved" value={dash(unresolved)} to="/messages" />
          <StatRow label="Email sent" value={dash(messages.data.filter((m) => m.channel === 'Email').length)} to="/messages" />
        </Card>


        <Card title="Carrier Integration" action={<PlugZap size={18} className="text-ink-400" />}>
          <p className="text-xs leading-relaxed text-ink-600 mb-3">{appointedCarriers.length} appointed carriers · {appointedCarriers.filter((c) => c.downloads_enabled).length} with policy downloads enabled.</p>
          <div className="flex flex-wrap gap-1.5 mb-4">{appointedCarriers.slice(0, 6).map((c) => <Badge key={c.id} tone="teal">{c.name}</Badge>)}</div>
          <button className="extension-button" onClick={() => navigate('/settings?tab=carriers')}>Manage Carriers</button>
        </Card>

        <Card title="eSignature">
          {(['Completed', 'Pending', 'Canceled', 'Declined', 'Expired', 'Failed'] as ESignStatus[]).map((s) => <StatRow key={s} label={s} value={dash(esign[s])} to="/documents?tab=esign" />)}
          <StatRow label="All Envelopes" value={dash(esign.total)} to="/documents?tab=esign" />
        </Card>

        <UnderwritingRequests />

        <PolicyDownloads />

        <ClaimsDownloads />

        <Card title="Upcoming Renewals" action={<a className="text-xs font-semibold" href={href('/policies?view=renewals')}>Queue</a>}>
          <p className="card-note">Next {settings?.renewal_reminder_days ?? 60} days · {renewals.length} policies · {fmtMoney(renewals.reduce((s, r) => s + Number(r.p.premium), 0))}</p>
          {renewals.length === 0 && <div className="text-xs text-ink-400 py-4">No renewals coming up.</div>}
          {renewals.slice(0, 6).map(({ p, d }) => (
            <a key={p.id} href={href(`/policies/${p.id}`)} className="stat-row px-1 -mx-1">
              <span className="min-w-0 truncate"><span className="text-ink-900">{names.get(p.account_id) ?? '—'}</span> <span className="text-ink-400">· {p.line_of_business}</span></span>
              <strong className={cx(d <= 14 && 'text-red-600')}>{d === 0 ? 'Today' : `${d}d`}</strong>
            </a>
          ))}
        </Card>

        <Card title="Alerts" action={<ShieldAlert size={18} className="text-ink-400" />}>
          <StatRow label="New" value={dash(alerts.length)} />
          {alerts.slice(0, 5).map((a) => (
            <a key={a.id} href={href(a.to)} className="stat-row px-1 -mx-1"><span className="truncate">{a.title}</span><ArrowRight size={13} className="text-ink-300 shrink-0" /></a>
          ))}
        </Card>

        <Card title="My Tasks" className="md:col-span-2 xl:col-span-3" action={<a className="text-xs font-semibold" href={href('/activities')}>All activities</a>}>
          {myTasks.length === 0 && <div className="flex items-center gap-2 text-[13px] text-ink-400 py-6 justify-center"><CheckCircle2 size={18} className="text-emerald-500" /> Nothing on your plate.</div>}
          <div className="divide-y divide-ink-50 -mx-1">
            {myTasks.slice(0, 7).map((t) => {
              const d = daysUntil(t.due_date);
              return (
                <div key={t.id} className="flex items-center gap-3 px-1 py-2">
                  <input type="checkbox" className="w-4 h-4 accent-[#dc2626] shrink-0" aria-label={`Complete ${t.subject}`} checked={false} onChange={() => void complete(t.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink-900 truncate">{t.subject}</div>
                    <div className="text-xs text-ink-400 truncate">
                      {t.type}{t.account_id && <> · <a href={href(`/accounts/${t.account_id}`)}>{names.get(t.account_id) ?? 'Account'}</a></>}
                    </div>
                  </div>
                  {t.priority === 'High' && <Badge tone="red">High</Badge>}
                  <span className={cx('text-xs tabular-nums whitespace-nowrap flex items-center gap-1', d !== null && d < 0 ? 'text-red-600 font-semibold' : d === 0 ? 'text-amber-600 font-semibold' : 'text-ink-400')}>
                    <CalendarClock size={12} />{d === null ? 'No date' : d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : fmtDate(t.due_date)}
                  </span>
                  <Avatar name={t.assigned_to} color={staffColor(t.assigned_to)} size={22} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
