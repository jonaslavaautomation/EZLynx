import { Building2, ChevronDown, ChevronUp, ExternalLink, Phone, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader, Panel, Pills, SearchInput, StatusBadge } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { accountName, fmtDate, fmtMoney, fmtPhone } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Account, Carrier, Policy } from '@/lib/types';
import { safeWebsite } from './lib';

type Filter = 'all' | 'appointed' | 'downloads' | 'not-appointed';

export function CarrierLibrary() {
  const { carriers, loading } = useAppData();
  const policies = useTable('policies');
  const accounts = useTable('accounts');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const byCarrier = useMemo(() => {
    const m = new Map<string, Policy[]>();
    for (const p of policies.data) {
      const k = p.carrier.trim().toLowerCase();
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [policies.data]);
  const accountMap = useMemo(() => new Map<string, Account>(accounts.data.map((a) => [a.id, a])), [accounts.data]);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return carriers
      .filter((c) => filter === 'all' || (filter === 'appointed' ? c.appointed : filter === 'downloads' ? c.downloads_enabled : !c.appointed))
      .filter((c) => {
        const hay = [c.name, c.naic ?? '', c.phone ?? '', c.website ?? '', ...c.lines].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      });
  }, [carriers, q, filter]);

  const counts = {
    all: carriers.length,
    appointed: carriers.filter((c) => c.appointed).length,
    downloads: carriers.filter((c) => c.downloads_enabled).length,
    'not-appointed': carriers.filter((c) => !c.appointed).length,
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Support', href: href('/support') }]}
        title="Carrier Library"
        subtitle="Contacts, NAIC codes and lines for every carrier, with your agency's book at each."
        icon={<Building2 size={20} />}
        actions={<Button onClick={() => navigate('/settings?tab=carriers')}>Manage Carriers/Markets</Button>}
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, NAIC, line…" className="w-full sm:w-80" />
        <Pills<Filter> value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'appointed', label: 'Appointed', count: counts.appointed },
          { value: 'downloads', label: 'Downloads on', count: counts.downloads },
          { value: 'not-appointed', label: 'Not appointed', count: counts['not-appointed'] },
        ]} />
      </div>
      <ErrorBanner message={policies.error} />
      {loading ? <LoadingBlock /> : rows.length === 0 ? (
        <Panel><EmptyState icon={<Building2 size={20} />} title={carriers.length ? 'No carriers match' : 'No carriers yet'} message={carriers.length ? 'Clear the search or filter.' : 'Add carriers under Settings → Manage Carriers/Markets.'} /></Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((c) => (
            <CarrierCard key={c.id} c={c} policies={byCarrier.get(c.name.trim().toLowerCase()) ?? []} loadingPolicies={policies.loading}
              open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} nameOf={(id) => accountName(accountMap.get(id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function CarrierCard({ c, policies, loadingPolicies, open, onToggle, nameOf }: { c: Carrier; policies: Policy[]; loadingPolicies: boolean; open: boolean; onToggle: () => void; nameOf: (id: string) => string }) {
  const active = policies.filter((p) => p.status === 'Active');
  const premium = active.reduce((s, p) => s + Number(p.premium || 0), 0);
  const site = safeWebsite(c.website);
  const tel = c.phone?.replace(/[^\d+]/g, '');
  const sorted = [...policies].sort((a, b) => b.effective_date.localeCompare(a.effective_date));

  return (
    <Panel className="flex flex-col" bodyClassName="p-4 flex-1 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink-900 truncate">{c.name}</div>
          <div className="text-xs text-ink-400">NAIC {c.naic || '—'} · {c.commission_rate}% default commission</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge tone={c.appointed ? 'green' : 'gray'}>{c.appointed ? 'Appointed' : 'Not appointed'}</Badge>
          <Badge tone={c.downloads_enabled ? 'blue' : 'gray'}>{c.downloads_enabled ? 'Downloads on' : 'No downloads'}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2.5">
        {c.lines.length ? c.lines.map((l) => <span key={l} className="text-[11px] bg-ink-50 border border-ink-100 text-ink-600 rounded px-1.5 py-px">{l}</span>) : <span className="text-xs text-ink-400">No lines listed</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-[13px]">
        <div className="rounded bg-ink-50/70 px-2.5 py-1.5"><div className="text-[11px] text-ink-400 uppercase font-semibold tracking-wide">Policies</div><div className="font-semibold tabular-nums">{loadingPolicies ? '…' : `${active.length} active`}<span className="text-xs font-normal text-ink-400"> / {policies.length}</span></div></div>
        <div className="rounded bg-ink-50/70 px-2.5 py-1.5"><div className="text-[11px] text-ink-400 uppercase font-semibold tracking-wide">Active premium</div><div className="font-semibold tabular-nums">{loadingPolicies ? '…' : fmtMoney(premium)}</div></div>
      </div>
      <div className="flex flex-col gap-1 mt-3 text-[13px]">
        {c.phone && tel ? <a href={`tel:${tel}`} className="inline-flex items-center gap-1.5"><Phone size={13} /> {fmtPhone(c.phone)}</a> : <span className="text-ink-400 text-xs">No phone on file</span>}
        {site ? <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 truncate"><ExternalLink size={13} /> {site.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <span className="text-ink-400 text-xs">No website on file</span>}
      </div>
      <div className="flex flex-wrap gap-2 mt-auto pt-3">
        <Button size="sm" icon={<Settings2 size={13} />} onClick={() => navigate('/admin/carrier-quoting')}>Quoting setup</Button>
        <Button size="sm" variant="ghost" icon={open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} disabled={!policies.length} onClick={onToggle}>
          {open ? 'Hide policies' : 'Policies'}
        </Button>
      </div>
      {open && (
        <div className="mt-3 border-t border-ink-100 pt-2">
          <ul className="divide-y divide-ink-50">
            {sorted.slice(0, 8).map((p) => (
              <li key={p.id}>
                <a href={href(`/policies/${p.id}`)} className="flex items-center justify-between gap-2 py-1.5 no-underline hover:bg-brand-50/50">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink-900 truncate">{nameOf(p.account_id)}</span>
                    <span className="block text-[11px] text-ink-400 truncate">{p.policy_number} · {p.line_of_business} · eff {fmtDate(p.effective_date)}</span>
                  </span>
                  <span className="flex flex-col items-end shrink-0"><span className="text-xs tabular-nums">{fmtMoney(p.premium)}</span><StatusBadge status={p.status} /></span>
                </a>
              </li>
            ))}
          </ul>
          {policies.length > 8 && <div className="text-xs text-ink-400 mt-1">Showing 8 of {policies.length}. See <a href={href('/policies')}>All Policies</a> and filter by carrier.</div>}
        </div>
      )}
    </Panel>
  );
}
