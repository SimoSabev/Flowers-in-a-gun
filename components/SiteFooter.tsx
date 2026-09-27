import Link from 'next/link';
import { getTerms } from '@/lib/content';
import { INSTAGRAM_URL, mailto } from '@/lib/site';
import { Logo } from './Logo';

export async function SiteFooter() {
  const categories = await getTerms('category');
  const advertise = mailto('Advertising on Flowers in a Gun');
  const year = new Date().getFullYear();
  return (
    <footer className="section bg-ink text-white">
      <div className="wrap py-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-xs">
            <Logo inverted />
            <p className="mt-4 text-[15px] text-white/80">Founded by Mart Kawaii.</p>
            <ul className="label mt-6 flex flex-wrap gap-x-5 gap-y-3">
              <li><Link href="/about/" className="hover:text-lime">About</Link></li>
              <li><Link href="/contributors/" className="hover:text-lime">Contributors</Link></li>
              {advertise && <li><a href={advertise} className="hover:text-lime">Advertise</a></li>}
              <li><a href={INSTAGRAM_URL} rel="noopener noreferrer" className="hover:text-lime">Instagram</a></li>
              <li><a href="/feed/" className="hover:text-lime">RSS</a></li>
            </ul>
          </div>
          <nav aria-label="Categories" className="lg:max-w-[760px] lg:flex-1">
            <h2 className="label text-lime">Categories</h2>
            <ul className="mt-4 columns-1 gap-8 text-[15px] min-[400px]:columns-2 md:columns-3">
              {categories.map((c) => (
                <li key={c.slug} className="break-inside-avoid py-1">
                  <Link href={`/category/${c.slug}/`} className="hover:text-lime hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-12 border-t border-white/20 pt-6 text-[13px] text-white/70">
          © 2012–{year} Flowers in a Gun. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
