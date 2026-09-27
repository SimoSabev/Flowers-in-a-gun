import Link from 'next/link';
import { AdSlot } from '@/components/AdSlot';
import { BandOfTheWeek } from '@/components/BandOfTheWeek';
import { Cover } from '@/components/Cover';
import { ListItem } from '@/components/ListItem';
import { PostCard } from '@/components/PostCard';
import { SectionHeader } from '@/components/SectionHeader';
import { getPosts, type Post } from '@/lib/content';
import { formatDate } from '@/lib/format';
import { CATEGORY, PAGE_SIZE, absoluteUrl } from '@/lib/site';

export const metadata = { alternates: { canonical: absoluteUrl('/') } };

/** Hero needs a real photo, not an upscaled thumbnail. */
const HERO_MIN_WIDTH = 800;

const inAny = (p: Post, slugs: string[]) => p.categories.some((c) => slugs.includes(c.slug));

export default async function Home() {
  const posts = await getPosts();
  const used = new Set<string>();
  const take = (pool: Post[], n: number) => {
    const out = pool.filter((p) => !used.has(p.slug)).slice(0, n);
    out.forEach((p) => used.add(p.slug));
    return out;
  };

  const [hero] = take(posts.filter((p) => (p.cover?.width ?? 0) >= HERO_MIN_WIDTH), 1);
  const pit = take(posts.filter((p) => inAny(p, [CATEGORY.live, CATEGORY.rock])), 4);
  const jazz = take(posts.filter((p) => inAny(p, [CATEGORY.jazz])), 6);
  const more = take(posts, 6);
  const hasArchive = posts.length > PAGE_SIZE;

  return (
    <div className="wrap">
      {hero && <Hero post={hero} />}

      {pit.length > 0 && (
        <section className="section" aria-labelledby="pit">
          <SectionHeader id="pit" title="Last night in the pit" href={`/category/${CATEGORY.live}/`} linkLabel="All live reviews" />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {pit.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="section">
        <BandOfTheWeek />
      </div>

      {jazz.length > 0 && (
        <section className="section" aria-labelledby="jazz">
          <SectionHeader id="jazz" title="Jazz after midnight" href={`/category/${CATEGORY.jazz}/`} linkLabel="All jazz" />
          <div className="grid gap-6 lg:grid-cols-12">
            {jazz.slice(0, 2).map((p, i) => (
              <Link
                key={p.slug}
                href={p.path}
                className={`group block ${i === 0 ? 'lg:col-span-5' : 'lg:col-span-4'}`}
              >
                <Cover
                  image={p.cover}
                  title={p.title}
                  category={p.primaryCategory?.name}
                  ratio="16 / 10"
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="border-2 border-ink"
                />
                <h3 className="mt-3 text-[18px] font-bold leading-snug group-hover:underline sm:text-[21px]">{p.title}</h3>
              </Link>
            ))}
            {jazz.length > 2 && (
              <ul className="lg:col-span-3">
                {jazz.slice(2).map((p) => (
                  <ListItem key={p.slug} post={p} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <AdSlot size="billboard" mobileSize="mobile" className="section" />

      {more.length > 0 && (
        <section className="section" aria-labelledby="more">
          <SectionHeader id="more" title="More stories" href={hasArchive ? '/page/2/' : undefined} linkLabel="Older stories" />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {more.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} showDate />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Hero({ post }: { post: Post }) {
  const isLive = post.categories.some((c) => c.slug === CATEGORY.live);
  return (
    <section aria-labelledby="hero" className="mt-8 grid gap-6 lg:mt-11 lg:grid-cols-12 lg:items-center lg:gap-6">
      <Link href={post.path} className="block lg:col-span-8" tabIndex={-1} aria-hidden="true">
        <Cover image={post.cover} title={post.title} ratio="3 / 2" priority sizes="(min-width: 1024px) 66vw, 100vw" className="border-2 border-ink" />
      </Link>
      <div className="lg:col-span-4">
        <div className="flex flex-wrap items-center gap-3">
          {post.primaryCategory && (
            <Link href={`/category/${post.primaryCategory.slug}/`} className="tag-pill">
              {post.primaryCategory.name}
            </Link>
          )}
          {post.venue && <span className="label text-muted">{post.venue}</span>}
        </div>
        <h1 id="hero" className="display mt-4 text-[38px] lg:text-[52px] xl:text-[60px]">
          <Link href={post.path} className="hover:underline decoration-lime decoration-[6px] underline-offset-4">
            {post.title}
          </Link>
        </h1>
        {post.excerpt && <p className="mt-5 text-[16px] leading-relaxed text-muted">{post.excerpt}</p>}
        <p className="mt-4 text-[13px] text-muted">
          By {post.author.name} · {formatDate(post.date)}
        </p>
        <Link href={post.path} className="btn btn-primary mt-5">
          {isLive ? 'Read the review' : 'Read the story'} <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </div>
    </section>
  );
}
