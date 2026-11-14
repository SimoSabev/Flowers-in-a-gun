'use client';

import { useEffect } from 'react';
import { makePage } from '@keystatic/next/ui/app';
import config from '@/keystatic.config';

const KeystaticPage = makePage(config);

/**
 * The site uses `trailingSlash: true`, so a hard load of /keystatic/setup arrives as
 * /keystatic/setup/. Keystatic's router reads that trailing slash as an empty path segment and
 * shows "Not found". Its own in-app navigation never adds one.
 *
 * Stripping it once during render is not enough: Next's router writes the slashed URL back after
 * hydration. So strip it again after Next has committed, then fire `popstate`, which is what
 * Keystatic's router listens to, so it re-reads the corrected URL.
 */
function stripTrailingSlash(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname, search, hash } = window.location;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    window.history.replaceState(window.history.state, '', pathname.replace(/\/+$/, '') + search + hash);
    return true;
  }
  return false;
}

export default function Keystatic() {
  stripTrailingSlash();
  useEffect(() => {
    const fix = () => {
      if (stripTrailingSlash()) window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    };
    fix();
    const t = setTimeout(fix, 0);
    return () => clearTimeout(t);
  }, []);
  return <KeystaticPage />;
}
