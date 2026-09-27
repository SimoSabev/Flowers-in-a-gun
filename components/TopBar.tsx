import { INSTAGRAM_URL, SITE_TAGLINE, mailto } from '@/lib/site';

export function TopBar() {
  const advertise = mailto('Advertising on Flowers in a Gun');
  return (
    <div className="hidden bg-ink text-white sm:block">
      <div className="wrap flex h-9 items-center justify-between gap-4">
        <p className="label truncate text-[11px]">{SITE_TAGLINE}</p>
        <ul className="label flex shrink-0 gap-5 text-[11px]">
          <li>
            <a href={INSTAGRAM_URL} rel="noopener noreferrer" className="hover:text-lime">
              Instagram
            </a>
          </li>
          {advertise && (
            <li>
              <a href={advertise} className="hover:text-lime">
                Advertise
              </a>
            </li>
          )}
          {/* Newsletter: hidden until a newsletter exists (DESIGN.md). */}
        </ul>
      </div>
    </div>
  );
}
