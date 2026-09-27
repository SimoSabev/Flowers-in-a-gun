import type { LocalImage } from '@/lib/images';

/**
 * Post image in a fixed-ratio box (space is reserved before it loads). Without a surviving image
 * it renders the typographic fallback: ink box, category in lime, title in white Anton.
 */
export function Cover({
  image,
  title,
  category,
  ratio = '16 / 10',
  priority = false,
  className = '',
  titleSize = 'text-[26px]',
  fit = 'cover',
}: {
  image: LocalImage | null;
  title: string;
  category?: string | null;
  ratio?: string;
  priority?: boolean;
  className?: string;
  titleSize?: string;
  fit?: 'cover' | 'contain';
}) {
  if (!image) {
    return (
      <div
        className={`flex flex-col justify-end gap-2 overflow-hidden bg-ink p-5 ${className}`}
        style={{ aspectRatio: ratio }}
        aria-hidden="true"
      >
        {category && <span className="label text-lime">{category}</span>}
        <span className={`display line-clamp-4 text-white ${titleSize}`}>{title}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={`block w-full bg-ink ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
      style={{ aspectRatio: ratio }}
    />
  );
}
