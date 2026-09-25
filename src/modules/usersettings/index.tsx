import { Settings } from 'lucide-react';
import { EmptyState, LoadingBlock, Tabs } from '@/components/ui';
import { setParam, useRoute } from '@/lib/router';
import { AccountTab, PreferencesTab } from '@/modules/usersettings/tabs-profile';
import { AcordTab, EmailSignatureTab } from '@/modules/usersettings/tabs-signatures';
import { ChangePasswordTab, LoginActivityTab, ThirdPartyTab, TwoFactorTab } from '@/modules/usersettings/tabs-security';
import { useMySettings } from '@/modules/usersettings/data';

export { SignInScreen } from '@/modules/usersettings/SignInScreen';
export { getSession, signIn, signOut, useSession, wasSignedOut } from '@/modules/usersettings/session';
export { useUserPreferences } from '@/modules/usersettings/data';

/* User Settings: the signed-in user's own profile, preferences, signatures and security settings. */

const TABS = [
  { value: 'account', label: 'Account' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'acord', label: 'ACORD Forms' },
  { value: 'email-signature', label: 'Email Signature' },
  { value: 'login-activity', label: 'Login Activity' },
  { value: 'two-factor', label: 'Two Factor' },
  { value: 'password', label: 'Change Password' },
  { value: 'apps', label: 'Third Party Apps' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function UserSettingsPage() {
  const { params } = useRoute();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'account') as Tab;
  const { me, row, loading } = useMySettings();

  if (!me) return <EmptyState title="Not signed in" message="Sign in to manage your settings." />;
  return (
    <div className="-mx-5 -mt-4">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2 bg-[#f5f5f5]">
        <Settings size={30} className="text-ink-500" />
        <h1 className="text-[22px] font-medium text-ink-900">User Settings</h1>
      </div>
      <div className="bg-[#f5f5f5] px-3 sm:px-5 border-b border-ink-200">
        <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setParam('tab', t === 'account' ? null : t)} className="border-b-0" />
      </div>
      <div className="px-3 sm:px-5 py-5 max-w-[1200px]">
        {loading && !row ? <LoadingBlock /> : (
          // Remount per user + tab so drafts reset cleanly.
          <div key={`${me.name}:${tab}:${row?.id ?? 'new'}`}>
            {tab === 'account' && <AccountTab />}
            {tab === 'preferences' && <PreferencesTab />}
            {tab === 'acord' && <AcordTab />}
            {tab === 'email-signature' && <EmailSignatureTab />}
            {tab === 'login-activity' && <LoginActivityTab />}
            {tab === 'two-factor' && <TwoFactorTab />}
            {tab === 'password' && <ChangePasswordTab />}
            {tab === 'apps' && <ThirdPartyTab />}
          </div>
        )}
      </div>
    </div>
  );
}
