import { ChevronDown, Pencil, Phone, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, DescriptionList, EmptyState, ErrorBanner, LoadingBlock, Menu, PageHeader, Panel, StatusBadge, useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/domain';
import { accountName, fmtDate, fmtDateTime, fmtMoney, fmtPhone } from '@/lib/format';
import { useRow } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { ClaimStatus } from '@/lib/types';
import { ActivityList } from '@/modules/activities';
import { ClaimFormModal } from './ClaimFormModal';
import { claimLabel, daysOpen, isOpenClaim } from './constants';

export function ClaimDetail({ id }: { id: string }) {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const claim = useRow('claims', id);
  const c = claim.data;
  const account = useRow('accounts', c?.account_id);
  const policy = useRow('policies', c?.policy_id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (claim.loading && !c) return <LoadingBlock />;
  if (!c) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorBanner message={claim.error} />
        <EmptyState icon={<ShieldAlert size={22} />} title="Claim not found" message="It may have been deleted." action={<Button onClick={() => navigate('/claims')}>Back to Claims</Button>} />
      </div>
    );
  }

  const setStatus = async (status: ClaimStatus, verb: string) => {
    if (status === c.status) return;
    setBusy(true);
    try {
      await db.update('claims', c.id, { status });
      await logActivity({ subject: `Claim ${claimLabel(c)} ${verb}`, description: `Status changed from ${c.status} to ${status}.`, account_id: c.account_id, policy_id: c.policy_id, assigned_to: me?.name ?? null });
      toast(`Claim ${verb}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete claim?', message: `Claim ${claimLabel(c)} will be permanently removed. Related activities stay on the account.`, confirmLabel: 'Delete Claim', danger: true });
    if (!ok) return;
    try {
      await db.remove('claims', c.id);
      await logActivity({ subject: `Claim ${claimLabel(c)} deleted`, account_id: c.account_id, policy_id: c.policy_id, assigned_to: me?.name ?? null });
      toast('Claim deleted');
      navigate('/claims');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const open = isOpenClaim(c);
  const days = daysOpen(c);
  const statusItems = [
    { label: 'Mark Under Review', onClick: () => setStatus('Under Review', 'marked Under Review'), disabled: c.status === 'Under Review' },
    { label: 'Mark Paid', onClick: () => setStatus('Paid', 'marked Paid'), disabled: c.status === 'Paid' },
    { label: 'Mark Closed', onClick: () => setStatus('Closed', 'closed'), disabled: c.status === 'Closed' },
    { label: 'Mark Denied', onClick: () => setStatus('Denied', 'denied'), disabled: c.status === 'Denied', danger: true },
    'divider' as const,
    { label: 'Reopen', icon: <RotateCcw size={14} />, onClick: () => setStatus('Open', 'reopened'), disabled: c.status === 'Open' },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Claims', href: href('/claims') }]}
        icon={<ShieldAlert size={20} />}
        title={<span className="flex items-center gap-2 flex-wrap">{claimLabel(c)} <StatusBadge status={c.status} /></span>}
        subtitle={<span className="flex flex-wrap gap-x-2">
          {account.data ? <a href={href(`/accounts/${account.data.id}`)} className="text-brand-600 hover:underline">{accountName(account.data)}</a> : <span>Unknown account</span>}
          {policy.data && <>· <a href={href(`/policies/${policy.data.id}`)} className="text-brand-600 hover:underline">{policy.data.policy_number}</a> <span>{policy.data.line_of_business} · {policy.data.carrier}</span></>}
        </span>}
        actions={<>
          <Menu align="right" items={statusItems} trigger={<Button loading={busy} icon={<ChevronDown size={14} />}>Change Status</Button>} />
          <Button icon={<Pencil size={14} />} onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 size={14} />} onClick={remove}>Delete</Button>
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Panel title="Loss Details" className="lg:col-span-2">
          <DescriptionList
            columns={3}
            items={[
              { label: 'Claim Number', value: c.claim_number ?? <span className="text-ink-400 italic">Not yet assigned</span> },
              { label: 'Loss Type', value: c.loss_type },
              { label: 'Status', value: <StatusBadge status={c.status} /> },
              { label: 'Date of Loss', value: fmtDate(c.date_of_loss) },
              { label: 'Reported', value: fmtDate(c.reported_date) },
              { label: 'Days Open', value: open ? days : 'Closed' },
              { label: 'Policy', value: policy.data ? `${policy.data.policy_number} · ${policy.data.line_of_business}` : null },
              { label: 'Carrier', value: policy.data?.carrier },
              { label: 'Entered', value: fmtDateTime(c.created_at) },
            ]}
          />
          <div className="mt-4 pt-4 border-t border-ink-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Description</div>
            <p className="text-[13px] text-ink-800 whitespace-pre-wrap break-words">{c.description || <span className="text-ink-400">No description provided.</span>}</p>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Financials">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Reserved', value: <span className="text-base font-semibold tabular-nums">{fmtMoney(c.amount_reserved)}</span> },
                { label: 'Paid', value: <span className="text-base font-semibold tabular-nums text-emerald-700">{fmtMoney(c.amount_paid)}</span> },
                { label: 'Outstanding', value: c.amount_reserved != null ? fmtMoney(Math.max(0, Number(c.amount_reserved) - Number(c.amount_paid ?? 0))) : null },
              ]}
            />
          </Panel>
          <Panel title="Adjuster">
            {c.adjuster_name || c.adjuster_phone ? (
              <div className="space-y-1">
                <div className="text-[13px] font-semibold text-ink-900">{c.adjuster_name ?? 'Unnamed adjuster'}</div>
                {c.adjuster_phone && <a href={`tel:${c.adjuster_phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-[13px] text-brand-600 hover:underline"><Phone size={13} /> {fmtPhone(c.adjuster_phone)}</a>}
              </div>
            ) : (
              <div className="text-[13px] text-ink-400">No adjuster assigned yet. <button type="button" className="text-brand-600 hover:underline bg-transparent" onClick={() => setEditing(true)}>Add adjuster</button></div>
            )}
          </Panel>
        </div>
      </div>

      <h2 className="text-[15px] font-semibold text-ink-900 mb-2">Account Activity</h2>
      <ActivityList accountId={c.account_id} />

      {editing && <ClaimFormModal claim={c} onClose={() => setEditing(false)} />}
    </div>
  );
}
