'use client';

import { makePage } from '@keystatic/next/ui/app';
import config from '@/keystatic.config';

const KeystaticPage = makePage(config);

/**
 * The site uses `trailingSlash: true`, so a hard load of /keystatic/collection/posts arrives as
 * /keystatic/collection/posts/. Keystatic's router reads that trailing slash as an empty path
 * segment and shows "Not found", so drop it before Keystatic reads the URL. Its own in-app
 * navigation never adds one.
 */
function stripTrailingSlash() {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    window.history.replaceState(window.history.state, '', pathname.replace(/\/+$/, '') + search + hash);
  }
}

export default function Keystatic() {
  stripTrailingSlash();
  return <KeystaticPage />;
}
