import { getPostsFor, getTerm, getTerms, type TaxonomyKind } from './content';
import { PAGE_SIZE } from './site';

export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));

/** Static params for `/<kind>/<slug>/`. */
export async function termParams(kind: TaxonomyKind) {
  return (await getTerms(kind)).map((t) => ({ slug: t.slug }));
}

/** Static params for `/<kind>/<slug>/page/<n>/` (n >= 2). */
export async function termPageParams(kind: TaxonomyKind) {
  const out: { slug: string; n: string }[] = [];
  for (const t of await getTerms(kind)) {
    for (let n = 2; n <= pageCount(t.count); n++) out.push({ slug: t.slug, n: String(n) });
  }
  return out;
}

export async function loadTermPage(kind: TaxonomyKind, rawSlug: string, n: number) {
  const slug = safeDecode(rawSlug);
  const term = await getTerm(kind, slug);
  if (!term) return null;
  const posts = await getPostsFor(kind, slug);
  const total = pageCount(posts.length);
  if (!Number.isInteger(n) || n < 1 || n > total) return null;
  return { term, posts: posts.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE), page: n, total, count: posts.length };
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
