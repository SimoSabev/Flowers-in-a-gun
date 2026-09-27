import 'server-only';
import { cache } from 'react';
import { createReader } from '@keystatic/core/reader';
import type { Node } from '@markdoc/markdoc';
import keystaticConfig from '@/keystatic.config';
import { bestVariant, isLocalPath, localImage, type LocalImage } from './images';

/**
 * Content layer. Reads the Keystatic collections once per build and derives everything the
 * templates need (sorting, excerpts, cover images, taxonomy counts). Content text is never
 * modified here: derived values only.
 */

const reader = createReader(process.cwd(), keystaticConfig);

export type Comment = { author: string; date: string; depth: number; text: string };

type RawComment = { author: string; date: string; depth: number | null; text: string };
const toComments = (list: readonly RawComment[]): Comment[] =>
  list.map((c) => ({ author: c.author, date: c.date, depth: Math.min(3, Math.max(1, c.depth ?? 1)), text: c.text }));

export type Term = { slug: string; name: string; count: number };

export type Post = {
  kind: 'post';
  slug: string;
  path: string;
  title: string;
  date: string; // YYYY-MM-DD
  author: Term;
  categories: Term[];
  primaryCategory: Term | null;
  tags: Term[];
  venue: string | null;
  excerpt: string;
  cover: LocalImage | null;
  /** True when `cover` is the post's own featured image (vs. borrowed from the body). */
  coverIsFeatured: boolean;
  wpId: number | null;
  originalUrl: string | null;
  comments: Comment[];
  body: () => Promise<Node>;
};

export type Page = {
  kind: 'page';
  slug: string;
  path: string;
  title: string;
  excerpt: string;
  cover: LocalImage | null;
  wpId: number | null;
  originalUrl: string | null;
  comments: Comment[];
  body: () => Promise<Node>;
};

/** Top-level paths owned by other routes; a post or page slug may not take them. */
const RESERVED_SLUGS = new Set(['category', 'tag', 'author', 'page', 'feed', 'contributors', 'keystatic', 'api']);

/** Covers narrower than this are thumbnails; they're upgraded or replaced by a body image. */
const COVER_MIN_WIDTH = 600;
const EXCERPT_WORDS = 30;

function textOf(node: Node): string {
  let out = '';
  for (const n of node.walk()) {
    if (n.type === 'text' && typeof n.attributes.content === 'string') out += n.attributes.content;
    else if (n.type === 'hardbreak' || n.type === 'softbreak') out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** First paragraph that has text, cut to ~30 words. */
function excerptOf(doc: Node): string {
  for (const n of doc.walk()) {
    if (n.type !== 'paragraph') continue;
    const text = textOf(n);
    if (!text) continue;
    const words = text.split(' ');
    return words.length > EXCERPT_WORDS ? `${words.slice(0, EXCERPT_WORDS).join(' ')}…` : text;
  }
  return '';
}

/**
 * Card/hero image: the featured image (upgraded from a WordPress thumbnail to a larger surviving
 * size when possible), else the first surviving body image, else null (typographic fallback).
 */
async function coverOf(
  featured: string | null | undefined,
  doc: Node,
): Promise<{ cover: LocalImage | null; coverIsFeatured: boolean }> {
  const candidates: string[] = [];
  if (featured && isLocalPath(featured)) candidates.push(featured);
  const featuredIndex = candidates.length ? 0 : -1;
  for (const n of doc.walk()) {
    if (n.type === 'image' && typeof n.attributes.src === 'string' && isLocalPath(n.attributes.src)) {
      candidates.push(n.attributes.src);
    }
  }
  let small: { cover: LocalImage; coverIsFeatured: boolean } | null = null;
  for (const [i, src] of candidates.entries()) {
    const img = await bestVariant(src, COVER_MIN_WIDTH);
    if (!img) continue;
    if (img.width >= COVER_MIN_WIDTH) return { cover: img, coverIsFeatured: i === featuredIndex };
    small ??= { cover: img, coverIsFeatured: i === featuredIndex };
  }
  // A small image beats no image only if it is at least card-sized.
  return small && small.cover.width >= 300 ? small : { cover: null, coverIsFeatured: false };
}

const byDateDesc = (a: Post, b: Post) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1);

type Store = {
  posts: Post[];
  pages: Page[];
  categories: Map<string, Term>;
  tags: Map<string, Term>;
  authors: Map<string, Term>;
};

let storePromise: Promise<Store> | null = null;

async function load(): Promise<Store> {
  const [rawPosts, rawPages, rawCategories, rawTags, rawAuthors] = await Promise.all([
    reader.collections.posts.all(),
    reader.collections.pages.all(),
    reader.collections.categories.all(),
    reader.collections.tags.all(),
    reader.collections.authors.all(),
  ]);

  const terms = (rows: { slug: string; entry: { name: string } }[]) =>
    new Map(rows.map((r) => [r.slug, { slug: r.slug, name: r.entry.name, count: 0 } satisfies Term]));
  const categories = terms(rawCategories);
  const tags = terms(rawTags);
  const authors = terms(rawAuthors);

  const lookup = (map: Map<string, Term>, slug: string, what: string, post: string): Term => {
    const t = map.get(slug);
    if (!t) throw new Error(`Post "${post}" references unknown ${what} "${slug}"`);
    return t;
  };

  const posts = await Promise.all(
    rawPosts.map(async ({ slug, entry }): Promise<Post> => {
      const { node } = await entry.content();
      if (!entry.date) throw new Error(`Post "${slug}" has no date`);
      if (!entry.author) throw new Error(`Post "${slug}" has no author`);
      const cats = entry.categories.filter((c): c is string => !!c).map((c) => lookup(categories, c, 'category', slug));
      return {
        kind: 'post',
        slug,
        path: `/${slug}/`,
        title: entry.title,
        date: entry.date,
        author: lookup(authors, entry.author, 'author', slug),
        categories: cats,
        primaryCategory: cats.find((c) => c.slug !== 'uncategorized') ?? cats[0] ?? null,
        tags: entry.tags.filter((t): t is string => !!t).map((t) => lookup(tags, t, 'tag', slug)),
        venue: entry.venue.trim() || null,
        excerpt: entry.excerpt.trim() || excerptOf(node),
        ...(await coverOf(entry.featuredImage, node)),
        wpId: entry.wpId ?? null,
        originalUrl: entry.originalUrl || null,
        comments: toComments(entry.comments),
        body: async () => (await entry.content()).node,
      };
    }),
  );
  posts.sort(byDateDesc);

  const pages = await Promise.all(
    rawPages.map(async ({ slug, entry }): Promise<Page> => {
      const { node } = await entry.content();
      return {
        kind: 'page',
        slug,
        path: `/${slug}/`,
        title: entry.title,
        excerpt: excerptOf(node),
        cover: (await coverOf(entry.featuredImage, node)).cover,
        wpId: entry.wpId ?? null,
        originalUrl: entry.originalUrl || null,
        comments: toComments(entry.comments),
        body: async () => (await entry.content()).node,
      };
    }),
  );

  // URL contract: posts and pages share `/<slug>/`. A clash would silently hide content, so fail loudly.
  const postSlugs = new Set(posts.map((p) => p.slug));
  for (const s of [...postSlugs, ...pages.map((p) => p.slug)]) {
    if (RESERVED_SLUGS.has(s)) throw new Error(`Slug "${s}" collides with a reserved route`);
  }
  const clash = pages.filter((p) => postSlugs.has(p.slug)).map((p) => p.slug);
  if (clash.length) throw new Error(`Post and page share a slug: ${clash.join(', ')}`);

  for (const p of posts) {
    p.author.count++;
    p.categories.forEach((c) => c.count++);
    p.tags.forEach((t) => t.count++);
  }

  return { posts, pages, categories, tags, authors };
}

const store = () => (storePromise ??= load());

export const getPosts = cache(async () => (await store()).posts);
export const getPages = cache(async () => (await store()).pages);

export const getEntry = cache(async (slug: string): Promise<Post | Page | null> => {
  const s = await store();
  return s.posts.find((p) => p.slug === slug) ?? s.pages.find((p) => p.slug === slug) ?? null;
});

export type TaxonomyKind = 'category' | 'tag' | 'author';

export const getTerms = cache(async (kind: TaxonomyKind): Promise<Term[]> => {
  const s = await store();
  const map = kind === 'category' ? s.categories : kind === 'tag' ? s.tags : s.authors;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
});

export const getTerm = cache(async (kind: TaxonomyKind, slug: string) =>
  (await getTerms(kind)).find((t) => t.slug === slug) ?? null,
);

export const getPostsFor = cache(async (kind: TaxonomyKind, slug: string): Promise<Post[]> => {
  const posts = await getPosts();
  if (kind === 'author') return posts.filter((p) => p.author.slug === slug);
  if (kind === 'category') return posts.filter((p) => p.categories.some((c) => c.slug === slug));
  return posts.filter((p) => p.tags.some((t) => t.slug === slug));
});

export async function getPostsInCategories(slugs: readonly string[]): Promise<Post[]> {
  return (await getPosts()).filter((p) => p.categories.some((c) => slugs.includes(c.slug)));
}

export { localImage };
