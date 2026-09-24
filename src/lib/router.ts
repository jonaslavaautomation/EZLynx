import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Routes look like `#/accounts/<id>?tab=policies`.
 * `useRoute()` returns the path segments and query params; `navigate()` changes the hash.
 */

export type Route = { path: string; segments: string[]; params: URLSearchParams };

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const clean = '/' + path.split('/').filter(Boolean).join('/');
  return { path: clean, segments: clean.split('/').filter(Boolean), params: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (opts.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

/** Build an href for an <a> tag. */
export const href = (to: string) => '#' + (to.startsWith('/') ? to : '/' + to);

/** Update one query param on the current route without adding a history entry. */
export function setParam(key: string, value: string | null) {
  const { path, params } = parse();
  if (value === null || value === '') params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  navigate(path + (qs ? '?' + qs : ''), { replace: true });
}
