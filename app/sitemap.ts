import type { MetadataRoute } from 'next';
import { getPages, getPosts, getTerms } from '@/lib/content';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, pages, categories, tags, authors] = await Promise.all([
    getPosts(),
    getPages(),
    getTerms('category'),
    getTerms('tag'),
    getTerms('author'),
  ]);
  const latest = posts[0]?.date;
  return [
    { url: absoluteUrl('/'), lastModified: latest, changeFrequency: 'weekly', priority: 1 },
    ...posts.map((p) => ({ url: absoluteUrl(p.path), lastModified: p.date, priority: 0.8 })),
    ...pages.map((p) => ({ url: absoluteUrl(p.path), priority: 0.5 })),
    { url: absoluteUrl('/contributors/'), priority: 0.3 },
    ...categories.filter((t) => t.count > 0).map((t) => ({ url: absoluteUrl(`/category/${t.slug}/`), priority: 0.5 })),
    ...authors.filter((t) => t.count > 0).map((t) => ({ url: absoluteUrl(`/author/${t.slug}/`), priority: 0.4 })),
    ...tags.filter((t) => t.count > 0).map((t) => ({ url: absoluteUrl(`/tag/${t.slug}/`), priority: 0.2 })),
  ];
}
