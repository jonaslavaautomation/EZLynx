import { Button, EmptyState } from '@/components/ui';
import { navigate } from '@/lib/router';
import { ApiDocs } from './api';
import { CarrierLibrary } from './carriers';
import { KbArticlePage, KbBrowse } from './kbpages';
import { BlogIndex, BlogPostPage, WhatsNew } from './news';
import { SupportNav } from './shared';
import { SolutionCenter, TicketDetail, TicketsIndex } from './tickets';
import { CoursePage, InstructorLed, University } from './training';

export { SupportChatHost } from './chat';

/* Support: Solution Center (KB + tickets), Carrier Library, product news, training and API documentation. */

const API_SLUGS = ['policy', 'discussion', 'applicant', 'web-services'];

function Page({ segments }: { segments: string[] }) {
  const [section, sub] = segments;
  switch (section) {
    case undefined: return <SolutionCenter />;
    case 'kb': return sub ? <KbArticlePage key={sub} slug={sub} /> : <KbBrowse />;
    case 'tickets': return sub ? <TicketDetail key={sub} id={sub} /> : <TicketsIndex />;
    case 'carriers': return <CarrierLibrary />;
    case 'whats-new': return <WhatsNew />;
    case 'blog': return sub ? <BlogPostPage key={sub} slug={sub} /> : <BlogIndex />;
    case 'university': return sub ? <CoursePage key={sub} slug={sub} /> : <University />;
    case 'instructor-led': return <InstructorLed />;
    case 'api':
      if (!sub) return <ApiDocs slug="" />;
      if (API_SLUGS.includes(sub)) return <ApiDocs key={sub} slug={sub} />;
      break;
  }
  return <EmptyState title="Page not found" message="That Support page doesn't exist." action={<Button onClick={() => navigate('/support')}>Go to Solution Center</Button>} />;
}

export function SupportRoutes({ segments }: { segments: string[] }) {
  return (
    <div>
      <SupportNav segments={segments} />
      <Page segments={segments} />
    </div>
  );
}
