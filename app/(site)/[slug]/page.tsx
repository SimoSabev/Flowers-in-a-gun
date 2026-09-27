import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdSlot } from '@/components/AdSlot';
import { ArchivedComments } from '@/components/ArchivedComments';
import { Cover } from '@/components/Cover';
import { PostCard } from '@/components/PostCard';
import { SectionHeader } from '@/components/SectionHeader';
import { getEntry, getPages, getPosts, getPostsFor, type Page, type Post } from '@/lib/content';
import { formatDate } from '@/lib/format';
import { safeDecode } from '@/lib/listing';
import { renderMarkdoc } from '@/lib/markdoc';
import { SITE_NAME, absoluteUrl } from '@/lib/site';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  const [posts, pages] = await Promise.all([getPosts(), getPages()]);
  return [...posts, ...pages].map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await getEntry(safeDecode((await params).slug));
  if (!entry) return {};
  const image = entry.cover ? [{ url: absoluteUrl(entry.cover.src), width: entry.cover.width, height: entry.cover.height }] : undefined;
  return {
    title: entry.title,
    description: entry.excerpt || undefined,
    alternates: { canonical: absoluteUrl(entry.path) },
    openGraph:
      entry.kind === 'post'
        ? { type: 'article', title: entry.title, description: entry.excerpt, url: entry.path, images: image, publishedTime: entry.date, authors: [entry.author.name] }
        : { title: entry.title, description: entry.excerpt, url: entry.path, images: image },
  };
}

export default async function EntryPage({ params }: Props) {
  const entry = await getEntry(safeDecode((await params).slug));
  if (!entry) notFound();
  return entry.kind === 'post' ? <PostView post={entry} /> : <PageView page={entry} />;
}

async function PostView({ post }: { post: Post }) {
  const [body, latest, related] = await Promise.all([
    post.body().then(renderMarkdoc),
    getPosts().then((all) => all.filter((p) => p.slug !== post.slug).slice(0, 5)),
    post.primaryCategory
      ? getPostsFor('category', post.primaryCategory.slug).then((all) => all.filter((p) => p.slug !== post.slug).slice(0, 3))
      : Promise.resolve([] as Post[]),
  ]);
  const cat = post.primaryCategory;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    author: { '@type': 'Person', name: post.author.name, url: absoluteUrl(`/author/${post.author.slug}/`) },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: absoluteUrl(post.path),
    image: post.cover ? absoluteUrl(post.cover.src) : undefined,
  };

  return (
    <article className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="mx-auto mt-8 max-w-[1152px] lg:mt-12">
        {cat && (
          <nav aria-label="Breadcrumb" className="label text-muted">
            <ol className="flex flex-wrap gap-2">
              <li><Link href="/" className="hover:text-ink hover:underline">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link href={`/category/${cat.slug}/`} className="text-green-text hover:underline">{cat.name}</Link></li>
            </ol>
          </nav>
        )}
        {cat && (
          <Link href={`/category/${cat.slug}/`} className="tag-pill mt-5">
            {cat.name}
          </Link>
        )}
        <h1 className="display mt-4 max-w-[1000px] text-[40px] sm:text-[52px] lg:text-[64px]">{post.title}</h1>
        <p className="mt-4 text-[14px] text-muted">
          By{' '}
          <Link href={`/author/${post.author.slug}/`} className="font-semibold text-ink hover:underline">
            {post.author.name}
          </Link>{' '}
          · <time dateTime={post.date}>{formatDate(post.date)}</time>
          {post.venue && <> · {post.venue}</>}
        </p>
      </header>

      {post.cover && post.coverIsFeatured && (
        <figure className="mx-auto mt-8 max-w-[1152px]">
          <Cover image={post.cover} title={post.title} ratio={`${post.cover.width} / ${post.cover.height}`} priority fit="contain" className="max-h-[80vh] border-2 border-ink" />
        </figure>
      )}

      <div className="mx-auto mt-10 max-w-[1152px] wide:grid wide:grid-cols-[minmax(0,680px)_300px] wide:justify-between wide:gap-12">
        <div className="min-w-0 max-w-[680px]">
          <div className="prose">{body}</div>

          {post.tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((t) => (
                <li key={t.slug}>
                  <Link href={`/tag/${t.slug}/`} className="tag-outline">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <AuthorBox post={post} />
          <ArchivedComments comments={post.comments} />
        </div>

        <aside className="mt-12 wide:mt-0" aria-label="Sidebar">
          <div className="flex flex-col gap-10 wide:sticky wide:top-6">
            <AdSlot size="halfpage" mobileSize="rectangle" />
            <section aria-labelledby="latest">
              <h2 id="latest" className="display border-b-2 border-ink pb-3 text-[30px]">
                Latest
              </h2>
              <ul>
                {latest.map((p) => (
                  <li key={p.slug} className="border-b border-rule-soft">
                    <Link href={p.path} className="block py-3 text-[16px] font-semibold leading-snug hover:underline">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>
      </div>

      {cat && related.length > 0 && (
        <section className="section mx-auto max-w-[1152px]" aria-labelledby="related">
          <SectionHeader id="related" title={`More from ${cat.name}`} href={`/category/${cat.slug}/`} linkLabel="All" />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {related.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} showDate />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function AuthorBox({ post }: { post: Post }) {
  const { author } = post;
  return (
    <section aria-label="About the author" className="mt-12 flex flex-col gap-4 border-2 border-ink bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="label text-green-text">Written by</p>
        <p className="display mt-2 text-[32px]">{author.name}</p>
        <p className="mt-1 text-[14px] text-muted">
          {author.count} {author.count === 1 ? 'story' : 'stories'} on Flowers in a Gun
          {author.slug === 'admin' && ' · Founder'}
        </p>
      </div>
      <Link href={`/author/${author.slug}/`} className="btn btn-secondary self-start sm:self-auto">
        All by {author.name.split(' ')[0]} <span aria-hidden="true" className="ml-2">→</span>
      </Link>
    </section>
  );
}

async function PageView({ page }: { page: Page }) {
  const body = await renderMarkdoc(await page.body());
  return (
    <article className="wrap">
      <header className="mx-auto mt-8 max-w-[680px] lg:mt-12">
        <h1 className="display text-[40px] sm:text-[52px] lg:text-[64px]">{page.title}</h1>
      </header>
      <div className="prose mx-auto mt-8 max-w-[680px]">{body}</div>
    </article>
  );
}
