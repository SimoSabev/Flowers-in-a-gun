import { getPosts } from '@/lib/content';
import { rfc822 } from '@/lib/format';
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/site';

// RSS 2.0 at /feed/, as on the original WordPress site.
export const dynamic = 'force-static';

const FEED_SIZE = 20;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const posts = (await getPosts()).slice(0, FEED_SIZE);
  const items = posts
    .map((p) => {
      const url = absoluteUrl(p.path);
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <dc:creator>${esc(p.author.name)}</dc:creator>
${p.categories.map((c) => `      <category>${esc(c.name)}</category>`).join('\n')}
      <description>${esc(p.excerpt)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${esc(absoluteUrl('/'))}</link>
    <atom:link href="${esc(absoluteUrl('/feed/'))}" rel="self" type="application/rss+xml" />
    <description>${esc(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    ${posts[0] ? `<lastBuildDate>${rfc822(posts[0].date)}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
