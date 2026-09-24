import { CalendarClock, FilePen, ListFilter, Mail, MailCheck, MailX, Plus, Send, ShieldOff } from 'lucide-react';
import { useMemo } from 'react';
import { Button, EmptyState, ErrorBanner, PageHeader, Panel, StatCard } from '@/components/ui';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import { CampaignsTable } from './Campaigns';
import { useScheduledRunner } from './parts';
import { SIMULATED_NOTE } from './shared';

export function CommDashboard() {
  const campaigns = useTable('email_campaigns', { order: { column: 'created_at', ascending: false } });
  const lists = useTable('recipient_lists');
  const suppressions = useTable('suppressions');
  useScheduledRunner(campaigns.data);

  const stats = useMemo(() => {
    const c = campaigns.data;
    const sent = c.filter((x) => x.status === 'Sent');
    return {
      sent: sent.length,
      delivered: sent.reduce((s, x) => s + Number(x.sent_count || 0), 0),
      suppressed: sent.reduce((s, x) => s + Number(x.suppressed_count || 0), 0),
      scheduled: c.filter((x) => x.status === 'Scheduled').length,
      drafts: c.filter((x) => x.status === 'Draft').length,
      supList: suppressions.data.filter((x) => x.channel === 'Email').length,
      smsList: suppressions.data.filter((x) => x.channel === 'SMS').length,
    };
  }, [campaigns.data, suppressions.data]);

  const upcoming = useMemo(() => campaigns.data.filter((c) => c.status === 'Scheduled').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')).slice(0, 4), [campaigns.data]);
  const listName = (id: string | null) => (id ? lists.data.find((l) => l.id === id)?.name ?? 'Deleted list' : 'No list');

  return (
    <div className="min-w-0">
      <PageHeader
        title="Email Campaigns"
        icon={<Mail size={20} />}
        subtitle="Communication Center dashboard — bulk email, recipient lists and suppression"
        actions={<>
          <Button icon={<ListFilter size={14} />} onClick={() => navigate('/comm/lists')}>Recipient lists</Button>
          <Button icon={<ShieldOff size={14} />} onClick={() => navigate('/comm/suppression?channel=Email')}>Suppression list</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/comm/campaigns/new')}>New campaign</Button>
        </>}
      />
      <ErrorBanner message={campaigns.error || suppressions.error} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <StatCard label="Campaigns sent" value={fmtNumber(stats.sent)} icon={<Send size={17} />} tone="brand" onClick={() => navigate('/comm/campaigns?status=Sent')} />
        <StatCard label="Emails delivered" value={fmtNumber(stats.delivered)} icon={<MailCheck size={17} />} tone="green" />
        <StatCard label="Suppressed" value={fmtNumber(stats.suppressed)} icon={<MailX size={17} />} tone="amber" hint="Skipped at send time" />
        <StatCard label="Scheduled" value={fmtNumber(stats.scheduled)} icon={<CalendarClock size={17} />} tone="blue" onClick={() => navigate('/comm/campaigns?status=Scheduled')} />
        <StatCard label="Drafts" value={fmtNumber(stats.drafts)} icon={<FilePen size={17} />} tone="purple" onClick={() => navigate('/comm/campaigns?status=Draft')} />
        <StatCard label="Suppression list" value={fmtNumber(stats.supList)} icon={<ShieldOff size={17} />} tone="red" hint={`${stats.smsList} SMS opt-outs`} onClick={() => navigate('/comm/suppression?channel=Email')} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Recent campaigns" actions={<a href={href('/comm/campaigns')} className="text-xs font-semibold text-brand-600 hover:underline">View all</a>} bodyClassName="p-0">
          <CampaignsTable
            rows={campaigns.data}
            loading={campaigns.loading}
            listName={listName}
            compact
            empty={<EmptyState icon={<Mail size={22} />} title="No campaigns yet" message="Pick a recipient list, write a message and send it to your clients." action={<Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/comm/campaigns/new')}>New campaign</Button>} />}
          />
        </Panel>
        <div className="space-y-4 min-w-0">
          <Panel title="Up next">
            {upcoming.length === 0 ? <p className="text-[13px] text-ink-400">No campaigns scheduled.</p> : (
              <ul className="space-y-2">
                {upcoming.map((c) => (
                  <li key={c.id}>
                    <a href={href(`/comm/campaigns/${c.id}`)} className="flex items-center gap-3 rounded border border-ink-100 px-3 py-2 hover:border-brand-200">
                      <CalendarClock size={16} className="text-sky-600 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ink-900 truncate">{c.name}</span><span className="block text-xs text-ink-400">{fmtDateTime(c.scheduled_at)} · {listName(c.recipient_list_id)}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Quick actions">
            <div className="grid gap-2">
              {[
                { label: 'New campaign', to: '/comm/campaigns/new', icon: <Plus size={15} /> },
                { label: 'Recipient lists', to: '/comm/lists', icon: <ListFilter size={15} /> },
                { label: 'Email suppression list', to: '/comm/suppression?channel=Email', icon: <ShieldOff size={15} /> },
                { label: 'Email templates', to: '/comm/templates?channel=Email', icon: <FilePen size={15} /> },
                { label: 'Email settings', to: '/comm/settings', icon: <Mail size={15} /> },
              ].map((a) => (
                <a key={a.to} href={href(a.to)} className="flex items-center gap-2 rounded border border-ink-100 px-3 py-2 text-[13px] font-semibold text-ink-800 hover:border-brand-200 hover:text-brand-700">
                  <span className="text-brand-600">{a.icon}</span>{a.label}
                </a>
              ))}
            </div>
            <p className="text-[11px] text-ink-400 mt-3">{SIMULATED_NOTE}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
