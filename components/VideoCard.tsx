'use client';

import { useState } from 'react';

/**
 * Click-to-play video card. Until clicked it is a plain poster (or the typographic card if the
 * poster can't load), so a page of 60+ videos doesn't load 60 players. The 16:9 box is reserved
 * up front, so swapping in the iframe causes no layout shift.
 */
export function VideoCard({
  title,
  outlet,
  embed,
  poster,
  description,
}: {
  title: string;
  outlet: string;
  embed: string;
  poster: string | null;
  description: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(!poster);

  return (
    <figure className="border-2 border-ink bg-surface">
      <div className="relative overflow-hidden bg-ink" style={{ aspectRatio: '16 / 9' }}>
        {playing ? (
          <iframe
            src={embed}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex h-full w-full flex-col justify-end text-left"
            aria-label={`Play: ${title}`}
          >
            {!posterFailed && poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                onError={() => setPosterFailed(true)}
                ref={(el) => {
                  if (el && el.complete && el.naturalWidth === 0) setPosterFailed(true);
                }}
              />
            )}
            {posterFailed && (
              <span className="display relative line-clamp-3 p-5 pb-16 text-[24px] text-white">{title}</span>
            )}
            <span
              aria-hidden="true"
              className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center bg-lime text-ink transition-transform group-hover:scale-110"
            >
              <svg width="16" height="18" viewBox="0 0 16 18">
                <path d="M0 0l16 9-16 9z" fill="currentColor" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <figcaption className="p-4">
        <p className="label text-[11px] text-green-text">{outlet}</p>
        <h3 className="mt-2 text-[17px] font-bold leading-snug">{title}</h3>
        {description && <p className="mt-2 text-[14px] text-muted">{description}</p>}
      </figcaption>
    </figure>
  );
}
