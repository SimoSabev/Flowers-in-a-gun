import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { TopBar } from '@/components/TopBar';
import { NAV } from '@/lib/site';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  const categories = NAV.filter((n) => 'category' in n).slice(0, 4);
  return (
    <>
      <TopBar />
      <SiteHeader />
      <main id="main" className="wrap">
        <div className="mt-12 border-b-2 border-ink pb-10 lg:mt-20">
          <p className="tag-pill">Error 404</p>
          <h1 className="display mt-5 text-[56px] sm:text-[88px] lg:text-[120px]">
            404: lost
            <br />
            in the pit
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed">
            This page doesn&apos;t exist, or it didn&apos;t survive the move from the old site. Try one of these instead:
          </p>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <li>
            <Link href="/" className="btn btn-primary w-full">
              Home
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="btn btn-secondary w-full">
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
