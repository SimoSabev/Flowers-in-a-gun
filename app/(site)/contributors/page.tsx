import type { Metadata } from 'next';
import Link from 'next/link';
import { getTerms } from '@/lib/content';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contributors',
  description: 'The writers and photographers behind Flowers in a Gun.',
  alternates: { canonical: absoluteUrl('/contributors/') },
};

export default async function Contributors() {
  const authors = (await getTerms('author')).filter((a) => a.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return (
    <div className="wrap">
      <header className="mt-10 border-b-2 border-ink pb-6 lg:mt-14">
        <p className="label text-green-text">The team</p>
        <h1 className="display mt-3 text-[40px] sm:text-[52px] lg:text-[64px]">Contributors</h1>
        <p className="mt-3 text-[14px] font-semibold text-muted">{authors.length} writers. Founded by Mart Kawaii.</p>
      </header>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {authors.map((a) => (
          <li key={a.slug}>
            <Link href={`/author/${a.slug}/`} className="card p-5">
              <h2 className="card-title display text-[30px]">{a.name}</h2>
              <p className="mt-2 text-[14px] text-muted">
                {a.count} {a.count === 1 ? 'story' : 'stories'}
                {a.slug === 'admin' && ' · Founder'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
