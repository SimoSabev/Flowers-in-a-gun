import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/Listing';
import { loadTermPage, termPageParams } from '@/lib/listing';
import { absoluteUrl } from '@/lib/site';

type Props = { params: Promise<{ slug: string; n: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => termPageParams('author');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, n } = await params;
  const data = await loadTermPage('author', slug, Number(n));
  if (!data) return {};
  return {
    title: `${data.term.name}, page ${data.page}`,
    alternates: { canonical: absoluteUrl(`/author/${data.term.slug}/page/${data.page}/`) },
  };
}

export default async function Page({ params }: Props) {
  const { slug, n } = await params;
  const data = await loadTermPage('author', slug, Number(n));
  if (!data) notFound();
  return (
    <Listing
      eyebrow="Author"
      title={data.term.name}
      count={data.count}
      posts={data.posts}
      base={`/author/${data.term.slug}/`}
      page={data.page}
      total={data.total}
    />
  );
}
