import { Settings } from 'lucide-react';
import { PageHeader, Tabs } from '@/components/ui';
import { setParam, useRoute } from '@/lib/router';
import { AgencyTab } from './agency';
import { CarriersTab } from './carriers';
import { DataTab } from './data';
import { UsersTab } from './users';

type Tab = 'agency' | 'users' | 'carriers' | 'data';
const TABS: { value: Tab; label: string }[] = [
  { value: 'agency', label: 'Agency Profile' },
  { value: 'users', label: 'Users' },
  { value: 'carriers', label: 'Carriers' },
  { value: 'data', label: 'Data & Integrations' },
];

export function SettingsPage() {
  const { params } = useRoute();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'agency') as Tab;
  return (
    <div>
      <PageHeader title="Settings" subtitle="Agency profile, users, carrier appointments and data management" icon={<Settings size={20} />} />
      <Tabs className="mb-4" tabs={TABS} value={tab} onChange={(t) => setParam('tab', t === 'agency' ? null : t)} />
      {tab === 'agency' && <AgencyTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'carriers' && <CarriersTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
