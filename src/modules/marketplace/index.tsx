import { Button, EmptyState } from '@/components/ui';
import { navigate } from '@/lib/router';
import { IntegrationDetail } from './Detail';
import { MarketplaceHome } from './Home';
import { MyIntegrations } from './Mine';

/** Marketplace router. `segments` are the path parts after `marketplace`. */
export function MarketplaceRoutes({ segments }: { segments: string[] }) {
  const [section, key] = segments;
  switch (section) {
    case undefined: return <MarketplaceHome />;
    case 'mine': return <MyIntegrations />;
    case 'app':
      if (key) return <IntegrationDetail key={key} itemKey={key} />;
      break;
  }
  return <EmptyState title="Page not found" message="This Marketplace page doesn't exist." action={<Button size="sm" onClick={() => navigate('/marketplace')}>Go to Marketplace</Button>} />;
}
