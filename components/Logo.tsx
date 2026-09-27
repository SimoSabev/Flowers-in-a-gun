import Link from 'next/link';
import { LOGO_IN_COLOR } from '@/lib/site';

/** Intrinsic sizes of the SVGs in public/brand/ (see design/logo/build-logo.mjs). */
const FULL = { w: 1254, h: 127 };
const COMPACT = { w: 484, h: 101 };

const file = (kind: 'logo' | 'logo-compact') => `/brand/${kind}${LOGO_IN_COLOR === 'lime' ? '-lime' : ''}.svg`;

/**
 * The original 2014–2018 logo, recreated as SVG. `responsive` shows the compact lockup below
 * 1024px and the full one (with tagline) above; `compact` always shows the compact one.
 * Heights are set by the caller via `className` (width follows the aspect ratio).
 */
export function Logo({ variant = 'responsive', className = '' }: { variant?: 'responsive' | 'compact' | 'full'; className?: string }) {
  const img = (src: string, size: { w: number; h: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size.w} height={size.h} alt="Flowers in a Gun" className={`block w-auto max-w-full object-contain object-left ${className}`} />
  );
  return (
    <Link href="/" aria-label="Flowers in a Gun, home" className="block min-w-0">
      {variant === 'responsive' ? (
        <picture>
          <source media="(min-width: 1024px)" srcSet={file('logo')} width={FULL.w} height={FULL.h} />
          {img(file('logo-compact'), COMPACT)}
        </picture>
      ) : variant === 'full' ? (
        img(file('logo'), FULL)
      ) : (
        img(file('logo-compact'), COMPACT)
      )}
    </Link>
  );
}
