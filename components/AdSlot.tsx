import { ADS_ENABLED } from '@/lib/site';

/**
 * Ad placeholder. Reserves the exact box so nothing shifts when an ad network is added.
 *
 * - NEXT_PUBLIC_ADS_ENABLED unset/false: renders nothing in production (a dashed placeholder in dev).
 * - NEXT_PUBLIC_ADS_ENABLED=true: renders the reserved, labelled slot.
 *
 * To wire an ad network later, render its unit inside the `data-ad-slot` element below
 * (and load its script once in app/layout.tsx). Nothing else needs to change.
 */

const SIZES = {
  leaderboard: { width: 728, height: 90 },
  billboard: { width: 970, height: 250 },
  rectangle: { width: 300, height: 250 },
  halfpage: { width: 300, height: 600 },
  mobile: { width: 320, height: 100 },
} as const;

export type AdSize = keyof typeof SIZES;

export function AdSlot({
  size,
  mobileSize,
  className = '',
}: {
  size: AdSize;
  /** Swap to this size below 768px (e.g. billboard -> mobile). */
  mobileSize?: AdSize;
  className?: string;
}) {
  const isDev = process.env.NODE_ENV === 'development';
  if (!ADS_ENABLED && !isDev) return null;

  const box = (s: AdSize, display: string) => {
    const { width, height } = SIZES[s];
    return (
      <div className={`mx-auto max-w-full flex-col items-center ${display}`} style={{ width }}>
        <span className="label mb-1 self-start text-[10px] text-muted">Advertisement</span>
        <div
          data-ad-slot={s}
          className="flex max-w-full items-center justify-center border border-dashed border-ad-rule bg-surface text-[11px] text-muted"
          style={{ width, height }}
        >
          {isDev && !ADS_ENABLED ? `${s} ${width}×${height}` : null}
        </div>
      </div>
    );
  };

  return (
    <aside aria-label="Advertisement" className={className}>
      {mobileSize ? (
        <>
          {box(mobileSize, 'flex md:hidden')}
          {box(size, 'hidden md:flex')}
        </>
      ) : (
        box(size, 'flex')
      )}
    </aside>
  );
}
