import type { Metadata, Viewport } from 'next';
import { Anton, Archivo } from 'next/font/google';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

/** Share image for pages without a photo of their own (built by design/og/build-og.mjs). */
const DEFAULT_SHARE_IMAGE = { url: '/brand/og-default.png', width: 1200, height: 630, alt: SITE_NAME };

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton', display: 'swap' });
const archivo = Archivo({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: music journalism from New York`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { types: { 'application/rss+xml': [{ url: '/feed/', title: SITE_NAME }] } },
  openGraph: { siteName: SITE_NAME, type: 'website', locale: 'en_US', images: [DEFAULT_SHARE_IMAGE] },
  twitter: { card: 'summary_large_image', images: [DEFAULT_SHARE_IMAGE.url] },
};

export const viewport: Viewport = { themeColor: '#0d0d0c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
