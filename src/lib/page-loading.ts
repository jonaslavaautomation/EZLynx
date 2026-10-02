// Brief "Loading…" cover over the page area when a section is opened from the left navigation,
// so moving between sections feels like the real web app loading a page.
export const PAGE_LOADING_EVENT = 'lava:page-loading';

export function showPageLoading() {
  window.dispatchEvent(new Event(PAGE_LOADING_EVENT));
}

/** Somewhere between 1 and 1.8 seconds, like a real page load. */
export const loadingDelay = () => 1000 + Math.round(Math.random() * 800);
