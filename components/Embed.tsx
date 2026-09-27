/**
 * Markdoc `{% embed provider src caption credit %}` block. Live providers render a responsive, lazy
 * iframe whose box is reserved up front; dead or unknown providers (MySpace, Instagram posts, ...)
 * render a plain link, never a broken iframe. The iframe host must match the provider.
 * Instagram posts with a recovered caption render as a caption card. Self-hosted audio/video
 * (`/wp-content/...`) render native players; lib/markdoc.tsx drops them if the file is missing.
 */

type Spec = { hosts: string[]; label: string } & ({ ratio: number } | { height: (url: URL) => number });

const PROVIDERS: Record<string, Spec> = {
  youtube: { hosts: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'], label: 'YouTube', ratio: 16 / 9 },
  vimeo: { hosts: ['player.vimeo.com'], label: 'Vimeo', ratio: 16 / 9 },
  soundcloud: {
    hosts: ['w.soundcloud.com'],
    label: 'SoundCloud',
    height: (u) => (/\/(playlists|users)\//.test(decodeURIComponent(u.search)) ? 450 : 166),
  },
  bandcamp: {
    hosts: ['bandcamp.com'],
    label: 'Bandcamp',
    height: (u) => (/size=large/.test(u.pathname) && !/artwork=(small|none)/.test(u.pathname) ? 470 : 120),
  },
  spotify: { hosts: ['open.spotify.com', 'embed.spotify.com'], label: 'Spotify', height: () => 352 },
  mixcloud: { hosts: ['www.mixcloud.com', 'player-widget.mixcloud.com'], label: 'Mixcloud', height: () => 120 },
};

const LINK_LABELS: Record<string, string> = {
  instagram: 'View on Instagram',
  facebook: 'View on Facebook',
  reverbnation: 'Listen on ReverbNation',
};

function parse(src: string): URL | null {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export function Embed({
  provider,
  src,
  caption,
  credit,
}: {
  provider?: string;
  src?: string;
  caption?: string;
  credit?: string;
}) {
  if (src && src.startsWith('/') && !src.startsWith('//')) {
    if (provider === 'video') {
      return (
        <div className="embed" style={{ aspectRatio: '1 / 1', maxWidth: 480 }}>
          <video src={src} controls preload="metadata" playsInline className="block h-full w-full" />
        </div>
      );
    }
    if (provider === 'audio') return <audio src={src} controls preload="metadata" className="w-full" />;
    return null;
  }
  const url = src ? parse(src) : null;
  if (!url) return null;
  const spec = provider ? PROVIDERS[provider] : undefined;

  if (provider === 'instagram' && caption) {
    return (
      <figure className="embed-card border-2 border-ink bg-surface p-5">
        <p className="label text-green-text">Instagram</p>
        <p className="mt-3 whitespace-pre-line text-[17px] leading-relaxed">{caption}</p>
        {credit && <figcaption className="mt-3 text-[13px] text-muted">{credit}</figcaption>}
        <p className="mt-4 text-[15px] font-bold">
          <a href={url.href} rel="noopener noreferrer">
            View on Instagram →
          </a>
        </p>
      </figure>
    );
  }

  if (!spec || !spec.hosts.includes(url.hostname)) {
    return (
      <p className="embed-link">
        <a href={url.href} rel="noopener noreferrer">
          {(provider && LINK_LABELS[provider]) || `Open original media (${url.hostname.replace(/^www\./, '')})`} →
        </a>
      </p>
    );
  }

  url.protocol = 'https:';
  const title = `${spec.label} embed`;
  if ('ratio' in spec) {
    return (
      <div className="embed" style={{ aspectRatio: String(spec.ratio) }}>
        <iframe
          src={url.href}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  const height = spec.height(url);
  return (
    <div className="embed" style={{ height }} data-provider={provider}>
      <iframe src={url.href} title={title} loading="lazy" allow="autoplay; encrypted-media" />
    </div>
  );
}
