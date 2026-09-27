'use client';

import { useState } from 'react';

/**
 * Images hot-linked from other sites (Facebook CDN, Dropbox, old blogs). Most are long dead and
 * can't be checked at build time, so the image removes itself if it fails to load: readers never
 * see a broken-image icon.
 */
export function ExternalImage({ src, alt }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      ref={(el) => {
        // An error that fired before hydration never reaches onError.
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
