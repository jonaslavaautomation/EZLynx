// Brief "Loading…" cover over the page area when a data-heavy section is opened from the left navigation,
// so it feels like the real web app fetching that page. Shown only the first time each section is opened
// in a session; quick pages (forms, settings, help) and repeat visits open instantly.
export const PAGE_LOADING_EVENT = 'lava:page-loading';

// Sections that load a lot of data. Matched on the path without its ?query, so e.g. all report
// categories share one first-time load.
const HEAVY = ['/reports', '/policies', '/accounts', '/quotes', '/claims', '/accounting', '/marketplace',
  '/policy-mgmt/downloads', '/policy-mgmt/transactions', '/policy-mgmt/claim-transactions', '/policy-mgmt/statements'];

const loaded = new Set<string>();

export function showPageLoading(to: string) {
  const path = to.split('?')[0];
  if (!HEAVY.includes(path) || loaded.has(path)) return;
  loaded.add(path);
  window.dispatchEvent(new Event(PAGE_LOADING_EVENT));
}

/** Somewhere between 1 and 1.8 seconds, like a real page load. */
export const loadingDelay = () => 1000 + Math.round(Math.random() * 800);
