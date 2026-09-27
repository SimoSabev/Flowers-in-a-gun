import Link from 'next/link';
import { HALL_OF_FAME_PATH, mailto } from '@/lib/site';

export function BandOfTheWeek() {
  const submit = mailto('Band of the Week submission');
  return (
    <section aria-labelledby="botw" className="border-2 border-ink bg-lime text-ink">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-12 lg:py-12">
        <h2 id="botw" className="display text-[56px] leading-[0.92] sm:text-[80px] lg:text-[96px]">
          Band of
          <br />
          the week
        </h2>
        <div>
          <p className="max-w-md text-[17px] leading-relaxed">
            One independent band every week. Send us your music: the winners go straight into the Hall of Fame.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {submit && (
              <a href={submit} className="btn btn-primary">
                Submit your band
              </a>
            )}
            <Link href={HALL_OF_FAME_PATH} className="btn btn-secondary">
              Hall of Fame
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
