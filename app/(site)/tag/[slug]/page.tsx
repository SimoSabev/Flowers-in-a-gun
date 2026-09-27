import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/Listing';
import { loadTermPage, termParams } from '@/lib/listing';
import { absoluteUrl } from '@/lib/site';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => termParams('tag');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadTermPage('tag', (await params).slug, 1);
  if (!data) return {};
  const path = `/tag/${data.term.slug}/`;
  return {
    title: data.term.name,
    description: `Tag ${data.term.name}: ${data.count} stories on Flowers in a Gun.`,
    alternates: { canonical: absoluteUrl(path) },
  };
}

export default async function Page({ params }: Props) {
  const data = await loadTermPage('tag', (await params).slug, 1);
  if (!data) notFound();
  return (
    <Listing
      eyebrow="Tag"
      title={data.term.name}
      count={data.count}
      posts={data.posts}
      base={`/tag/${data.term.slug}/`}
      page={1}
      total={data.total}
    />
  );
}
