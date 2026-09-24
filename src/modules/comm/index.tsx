import { Button, EmptyState } from '@/components/ui';
import { navigate, useRoute } from '@/lib/router';
import { CampaignBuilder, CampaignDetail, CampaignsPage } from './Campaigns';
import { CommDashboard } from './Dashboard';
import { ESignTemplatesPage } from './ESignTemplates';
import { RecipientListsPage } from './Lists';
import { MailboxPage } from './Mailbox';
import { EmailSettingsPage } from './Settings';
import { SuppressionPage } from './SuppressionList';
import { TemplatesPage } from './Templates';

export { resolveRecipients } from './shared';

/** Communication Center router. `segments` are the path parts after `comm`. */
export function CommRoutes({ segments }: { segments: string[] }) {
  const { params } = useRoute();
  const [section, id, action] = segments;
  switch (section) {
    case undefined: return <CommDashboard />;
    case 'campaigns':
      if (!id) return <CampaignsPage />;
      if (id === 'new') return <CampaignBuilder key="new" id={null} initialListId={params.get('list')} />;
      if (action === 'edit') return <CampaignBuilder key={id} id={id} initialListId={null} />;
      return <CampaignDetail key={id} id={id} />;
    case 'lists': return <RecipientListsPage />;
    case 'suppression': return <SuppressionPage />;
    case 'settings': return <EmailSettingsPage />;
    case 'templates': return <TemplatesPage />;
    case 'mailbox': return <MailboxPage />;
    case 'esign-templates': return <ESignTemplatesPage />;
    default:
      return <EmptyState title="Page not found" message="This Communication Center page doesn't exist." action={<Button size="sm" onClick={() => navigate('/comm')}>Go to Communication Center</Button>} />;
  }
}
