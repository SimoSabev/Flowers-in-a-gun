import legacyRedirects from './redirects.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // URL contract: WordPress `/%postname%/` permalinks, every URL ends with `/`.
  trailingSlash: true,
  // Old WordPress image paths are served as-is from public/, never through the image optimiser.
  images: { unoptimized: true },
  poweredByHeader: false,
  // Don't let `next dev` append its own agent rules to CLAUDE.md (the project spec).
  agentRules: false,
  // Keystatic's GitHub App setup must run on http://127.0.0.1:3000; without this, `next dev` blocks
  // its own scripts for that origin and /keystatic renders blank. Dev only, no effect on builds.
  allowedDevOrigins: ['127.0.0.1'],
  async redirects() {
    return [
      ...legacyRedirects,
      // WordPress served page 1 of any listing at the listing root.
      { source: '/page/1', destination: '/', permanent: true },
      { source: '/:kind(category|tag|author)/:slug/page/1', destination: '/:kind/:slug/', permanent: true },
    ];
  },
  outputFileTracingExcludes: {
    // Keep the 500 MB photo archive and the recovery pipeline out of serverless bundles.
    '*': ['public/wp-content/**', 'tools/**', 'design/**'],
  },
};

export default nextConfig;
