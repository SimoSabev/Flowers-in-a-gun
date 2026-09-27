import legacyRedirects from './redirects.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // URL contract: WordPress `/%postname%/` permalinks, every URL ends with `/`.
  trailingSlash: true,
  // Old WordPress image paths are served as-is from public/, never through the image optimiser.
  images: { unoptimized: true },
  poweredByHeader: false,
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
