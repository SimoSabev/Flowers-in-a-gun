'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV } from '@/lib/site';
import { Logo } from './Logo';

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href);

  return (
    <header className="border-b-2 border-ink bg-surface">
      <div className="wrap flex h-[72px] items-center justify-between gap-6 lg:h-[90px]">
        <Logo />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className="label py-2 text-[13px] text-ink decoration-lime decoration-4 underline-offset-8 hover:underline aria-[current=page]:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center border-2 border-ink bg-surface lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
            <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink text-white lg:hidden"
        >
          <div className="wrap flex h-[72px] shrink-0 items-center justify-between">
            <Logo inverted />
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center border-2 border-white"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              autoFocus
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1 1l14 14M15 1L1 15" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>
          <nav aria-label="Main" className="wrap mt-8 pb-12">
            <ul className="flex flex-col gap-3">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`display block py-1 text-[44px] ${isActive(item.href) ? 'text-lime' : 'text-white'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
