import Link from 'next/link';

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link
      href="/"
      className={`display flex items-end whitespace-nowrap text-[26px] leading-none sm:text-[34px] ${inverted ? 'text-white' : 'text-ink'}`}
      aria-label="Flowers in a Gun, home"
    >
      Flowers in a Gun
      <span aria-hidden="true" className="ml-1 inline-block h-[0.9em] w-[0.42em] bg-lime text-ink" />
    </Link>
  );
}
