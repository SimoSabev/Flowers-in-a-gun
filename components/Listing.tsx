import { Fragment } from 'react';
import type { Post } from '@/lib/content';
import { AdSlot } from './AdSlot';
import { Pagination } from './Pagination';
import { PostCard } from './PostCard';

/** Category / tag / author / archive listing: Anton H1 with count, 3-col card grid, leaderboard after 6 cards. */
export function Listing({
  eyebrow,
  title,
  count,
  posts,
  base,
  page,
  total,
}: {
  eyebrow: string;
  title: string;
  count: number;
  posts: Post[];
  base: string;
  page: number;
  total: number;
}) {
  return (
    <div className="wrap">
      <header className="mt-10 border-b-2 border-ink pb-6 lg:mt-14">
        <p className="label text-green-text">{eyebrow}</p>
        <h1 className="display mt-3 text-[40px] sm:text-[52px] lg:text-[64px]">{title}</h1>
        <p className="mt-3 text-[14px] font-semibold text-muted">
          {count} {count === 1 ? 'story' : 'stories'}
          {total > 1 && ` · Page ${page} of ${total}`}
        </p>
      </header>
      {posts.length === 0 ? (
        <p className="section text-[17px]">No stories here yet.</p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-6">
          {posts.map((p, i) => (
            <Fragment key={p.slug}>
              <li>
                <PostCard post={p} showDate headingLevel={2} />
              </li>
              {i === 5 && posts.length > 6 && (
                <li className="sm:col-span-2 lg:col-span-3">
                  <AdSlot size="leaderboard" mobileSize="mobile" className="py-2" />
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      )}
      <Pagination base={base} current={page} total={total} />
    </div>
  );
}
