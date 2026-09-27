import Link from 'next/link';
import type { Post } from '@/lib/content';
import { formatDate } from '@/lib/format';
import { Cover } from './Cover';

export function PostCard({ post, showDate = false, headingLevel = 3 }: { post: Post; showDate?: boolean; headingLevel?: 2 | 3 }) {
  const label = post.venue ?? post.primaryCategory?.name ?? null;
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Link href={post.path} className="card">
      <Cover
        image={post.cover}
        title={post.title}
        category={post.primaryCategory?.name}
        className="border-b-2 border-ink"
        titleSize="text-[24px]"
      />
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {label && <p className="label text-green-text">{label}</p>}
        <H className="card-title text-[18px] font-bold leading-snug sm:text-[20px]">{post.title}</H>
        {showDate && <p className="mt-auto pt-1 text-[13px] text-muted">{formatDate(post.date)}</p>}
      </div>
    </Link>
  );
}
