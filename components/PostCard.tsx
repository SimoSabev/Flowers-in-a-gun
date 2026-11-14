import Link from 'next/link';
import type { Post } from '@/lib/content';
import { formatDate } from '@/lib/format';
import { Cover } from './Cover';

/**
 * Label shown on a card: the venue if known, else the post's first category that isn't implied by
 * where the card sits (`exclude`, e.g. the category page it's listed on), else nothing.
 */
export function cardLabel(post: Post, exclude: readonly string[] = []): string | null {
  if (post.venue) return post.venue;
  const cat = post.categories.find((c) => c.slug !== 'uncategorized' && !exclude.includes(c.slug));
  return cat?.name ?? null;
}

export function PostCard({
  post,
  showDate = false,
  headingLevel = 3,
  exclude = [],
}: {
  post: Post;
  showDate?: boolean;
  headingLevel?: 2 | 3;
  /** Category slugs the surrounding section already implies; they're not repeated on the card. */
  exclude?: readonly string[];
}) {
  const label = cardLabel(post, exclude);
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Link href={post.path} className="card">
      <Cover image={post.cover} title={post.title} fallback="brand" className="border-b-2 border-ink" />
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {label && <p className="label text-green-text">{label}</p>}
        <H className="card-title text-[18px] font-bold leading-snug sm:text-[20px]">{post.title}</H>
        {showDate && <p className="mt-auto pt-1 text-[13px] text-muted">{formatDate(post.date)}</p>}
      </div>
    </Link>
  );
}
