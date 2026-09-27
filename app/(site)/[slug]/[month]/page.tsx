import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/Listing';
import { getPosts } from '@/lib/content';
import { absoluteUrl } from '@/lib/site';

/**
 * WordPress monthly archives, `/<yyyy>/<mm>/`. Not linked from the design, but the old site had
 * them and the Wayback inventory shows inbound links. The year sits in the `[slug]` segment
 * because Next.js requires one parameter name per level.
 */
type Props = { params: Promise<{ slug: string; month: string }> };

export const dynamicParams = false;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function generateStaticParams() {
  const keys = new Set((await getPosts()).map((p) => p.date.slice(0, 7)));
  return [...keys].map((k) => ({ slug: k.slice(0, 4), month: k.slice(5, 7) }));
}

async function load(params: Props['params']) {
  const { slug: year, month } = await params;
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return null;
  const posts = (await getPosts()).filter((p) => p.date.startsWith(`${year}-${month}`));
  return posts.length ? { year, month, posts, title: `${MONTHS[Number(month) - 1]} ${year}` } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  return { title: data.title, alternates: { canonical: absoluteUrl(`/${data.year}/${data.month}/`) } };
}

export default async function MonthArchive({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  return (
    <Listing
      eyebrow="Archive"
      title={data.title}
      count={data.posts.length}
      posts={data.posts}
      base={`/${data.year}/${data.month}/`}
      page={1}
      total={1}
    />
  );
}
