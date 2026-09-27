import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '@/keystatic.config';

/**
 * Keystatic API. In production it needs the GitHub App env vars (see README.md "Keystatic setup").
 * Until they exist the editor answers 503 instead of breaking the whole build.
 */
const configured =
  config.storage.kind !== 'github' ||
  Boolean(
    process.env.KEYSTATIC_GITHUB_CLIENT_ID && process.env.KEYSTATIC_GITHUB_CLIENT_SECRET && process.env.KEYSTATIC_SECRET,
  );

const notConfigured = () =>
  new Response('Keystatic is not configured: set the KEYSTATIC_* environment variables (see README.md).', {
    status: 503,
  });

export const { GET, POST } = configured ? makeRouteHandler({ config }) : { GET: notConfigured, POST: notConfigured };
