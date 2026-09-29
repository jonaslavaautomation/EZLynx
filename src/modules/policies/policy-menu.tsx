import { MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { accountName } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { Account, Policy, PolicyTransaction } from '@/lib/types';
import { coverageTable, esc, openDocumentFile, shell } from '@/modules/documents/shared';
import { ChangeRequestModal, CompareModal, FlyoutMenu, exportPolicyCsv, isAutoLine, lobTitle, logPolicy, mdy, type MenuNode } from './extras';
import { policyPath } from './record';
import { canDo, type PolicyAction } from './shared';
import { TransactionModal } from './transactions';

/** EZLynx policy card ⋮ menu: Compare, Edit, Service ▸ (Audit … Renew), Other ▸. */
export function PolicyCardMenu({ policy: p, account, policies, txns }: { policy: Policy; account: Account; policies: Policy[]; txns: PolicyTransaction[] }) {
  const { settings, me } = useAppData();
  const { toast } = useFeedback();
  const [tx, setTx] = useState<PolicyAction | null>(null);
  const [dialog, setDialog] = useState<'compare' | 'request' | null>(null);
  const mine = txns.filter((t) => t.policy_id === p.id);
  const lastCancel = mine.find((t) => t.type === 'Cancellation' && !t.description?.startsWith('Non-renewal'));
  const act = (kind: PolicyAction, label: string): MenuNode => ({ label, disabled: !canDo(kind, p.status), onClick: () => setTx(kind) });

  const createApplication = async () => {
    const win = window.open('', '_blank');
    try {
      const [vehicles, drivers] = isAutoLine(p) ? await Promise.all([db.list('vehicles', { eq: { account_id: account.id } }), db.list('drivers', { eq: { account_id: account.id } })]) : [[], []];
      const html = shell(`${lobTitle(p)} Application`, settings, `
<h2>Applicant</h2><div class="grid"><div><div class="lbl">Named insured</div><div class="val">${esc(accountName(account))}</div></div><div><div class="lbl">Address</div><div class="val">${esc([account.address, account.city, account.state, account.zip].filter(Boolean).join(', '))}</div></div>
<div><div class="lbl">Email</div><div class="val">${esc(account.email)}</div></div><div><div class="lbl">Phone</div><div class="val">${esc(account.mobile_phone || account.phone || '')}</div></div></div>
<h2>Policy</h2><div class="grid"><div><div class="lbl">Carrier</div><div class="val">${esc(p.carrier)}</div></div><div><div class="lbl">Policy number</div><div class="val">${esc(p.policy_number)}</div></div>
<div><div class="lbl">Term</div><div class="val">${esc(mdy(p.effective_date))} – ${esc(mdy(p.expiration_date))}</div></div><div><div class="lbl">Billing</div><div class="val">${esc(p.billing_type)} · ${esc(p.payment_plan || '')}</div></div></div>
<h2>Coverages</h2>${coverageTable(p, false)}
${vehicles.length ? `<h2>Vehicles</h2><table><thead><tr><th>#</th><th>Year / make / model</th><th>VIN</th><th>Use</th></tr></thead><tbody>${vehicles.map((v, i) => `<tr><td>${i + 1}</td><td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.vin || '')}</td><td>${esc(v.usage || '')}</td></tr>`).join('')}</tbody></table>` : ''}
${drivers.length ? `<h2>Drivers</h2><table><thead><tr><th>#</th><th>Name</th><th>Date of birth</th><th>License</th></tr></thead><tbody>${drivers.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.first_name)} ${esc(d.last_name)}</td><td>${esc(mdy(d.dob))}</td><td>${esc([d.license_state, d.license_number].filter(Boolean).join(' '))}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>Signatures</h2><p>Applicant signature: ________________________________ Date: ____________</p><p>Producer signature: ________________________________ Date: ____________</p>`);
      const name = `${lobTitle(p)} Application - ${p.policy_number}.html`;
      const meta = await db.uploadFile(new File([html], name, { type: 'text/html' }));
      const doc = await db.insert('documents', { ...meta, name, category: 'Application', account_id: account.id, policy_id: p.id, esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null });
      await logPolicy(p, `Application created — ${p.policy_number}`, name, me?.name ?? null);
      toast('Application created in Documents');
      if (win) await openDocumentFile(doc, false, win).catch(() => win.close());
    } catch (e) { win?.close(); toast((e as Error).message, 'error'); }
  };

  const items: MenuNode[] = [
    { label: 'Compare', onClick: () => setDialog('compare') },
    { label: 'Edit', onClick: () => navigate(policyPath(p, 'edit')) },
    {
      label: 'Service', children: [
        act('audit', 'Audit'),
        act('cancel', 'Cancel'),
        { label: 'Change', disabled: !canDo('endorse', p.status), onClick: () => navigate(policyPath(p, 'change')) },
        { label: 'Change request', onClick: () => setDialog('request') },
        { label: 'Create application', onClick: () => void createApplication() },
        { label: 'Export policy information', onClick: () => void exportPolicyCsv(p, account).then(() => toast('Policy information exported')) },
        act('renew', 'Renew'),
      ],
    },
    {
      label: 'Other', children: [
        { label: 'View policy', onClick: () => navigate(policyPath(p)) },
        { label: 'Transactions', onClick: () => navigate(policyPath(p, 'summary', 'ptab=history')) },
        act('reinstate', 'Reinstate'),
        act('nonrenew', 'Non-renew'),
        { label: 'Proof of insurance / ID cards', onClick: () => navigate(`/accounts/${account.id}?tab=documents`) },
        { label: 'Remarket / requote', onClick: () => navigate(`/quotes/new?account=${account.id}&line=${encodeURIComponent(p.line_of_business)}`) },
        { label: 'Log activity', onClick: () => navigate(`/accounts/${account.id}?tab=activities`) },
      ],
    },
  ];

  return (
    <>
      <FlyoutMenu label="Policy actions menu" items={items} trigger={<button type="button" aria-label="Policy actions" className="w-8 h-8 grid place-items-center rounded hover:bg-ink-100"><MoreVertical size={18} /></button>} />
      {tx && <TransactionModal kind={tx} policy={p} lastCancel={lastCancel} txns={mine} onClose={() => setTx(null)} />}
      {dialog === 'compare' && <CompareModal policy={p} policies={policies} onClose={() => setDialog(null)} />}
      {dialog === 'request' && <ChangeRequestModal policy={p} account={account} onClose={() => setDialog(null)} />}
    </>
  );
}
