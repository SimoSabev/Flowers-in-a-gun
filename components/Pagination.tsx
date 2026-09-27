import Link from 'next/link';

/** Big square numbered buttons. `base` is the listing root, e.g. "/category/jazz-2/" or "/". */
export function Pagination({ base, current, total }: { base: string; current: number; total: number }) {
  if (total <= 1) return null;
  const href = (n: number) => (n === 1 ? base : `${base}page/${n}/`);

  // 1 … c-1 c c+1 … total
  const pages: (number | 'gap')[] = [];
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || Math.abs(n - current) <= 1) pages.push(n);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  const box = 'flex h-12 min-w-12 items-center justify-center border-2 border-ink px-3 text-[16px] font-bold';
  return (
    <nav aria-label="Pagination" className="section">
      <ul className="flex flex-wrap items-center gap-2">
        {current > 1 && (
          <li>
            <Link href={href(current - 1)} className={`${box} bg-surface hover:bg-lime`} rel="prev">
              <span aria-hidden="true">←</span>
              <span className="sr-only">Previous page</span>
            </Link>
          </li>
        )}
        {pages.map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} className="px-1 text-muted" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              {p === current ? (
                <span aria-current="page" className={`${box} bg-ink text-white`}>
                  {p}
                </span>
              ) : (
                <Link href={href(p)} className={`${box} bg-surface hover:bg-lime`}>
                  <span className="sr-only">Page </span>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
        {current < total && (
          <li>
            <Link href={href(current + 1)} className={`${box} bg-surface hover:bg-lime`} rel="next">
              <span aria-hidden="true">→</span>
              <span className="sr-only">Next page</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
