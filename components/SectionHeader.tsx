import Link from 'next/link';

export function SectionHeader({ title, href, linkLabel, id }: { title: string; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b-2 border-ink pb-4 lg:mb-7">
      <h2 id={id} className="display text-[30px] lg:text-[40px]">
        {title}
      </h2>
      {href && linkLabel && (
        <Link href={href} className="label shrink-0 pb-1 text-green-text hover:underline">
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
