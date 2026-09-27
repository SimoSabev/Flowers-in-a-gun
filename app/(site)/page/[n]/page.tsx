import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/Listing';
import { getPosts } from '@/lib/content';
import { pageCount } from '@/lib/listing';
import { PAGE_SIZE, absoluteUrl } from '@/lib/site';

type Props = { params: Promise<{ n: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  const total = pageCount((await getPosts()).length);
  return Array.from({ length: Math.max(0, total - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = Number((await params).n);
  return { title: `All stories, page ${n}`, alternates: { canonical: absoluteUrl(`/page/${n}/`) } };
}

export default async function Page({ params }: Props) {
  const n = Number((await params).n);
  const posts = await getPosts();
  const total = pageCount(posts.length);
  if (!Number.isInteger(n) || n < 2 || n > total) notFound();
  return (
    <Listing
      eyebrow="Archive"
      title="All stories"
      count={posts.length}
      posts={posts.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE)}
      base="/"
      page={n}
      total={total}
    />
  );
}
