/**
 * Turns the link an editor pastes (a normal YouTube/Vimeo/Spotify/SoundCloud/Mixcloud page URL)
 * into the provider's embeddable player URL, and works out the provider from the host when the
 * editor left it on "auto". URLs that are already player URLs (all the recovered posts) come back
 * unchanged, so existing embeds render exactly as before.
 */

export type ResolvedEmbed = { provider: string; url: URL };

const host = (u: URL) => u.hostname.replace(/^(www|m|music)\./, '');

function youtubeId(u: URL): string | null {
  const h = host(u);
  if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (h !== 'youtube.com' && h !== 'youtube-nocookie.com') return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function detect(u: URL): string | null {
  const h = host(u);
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'youtube-nocookie.com') return 'youtube';
  if (h === 'vimeo.com' || h === 'player.vimeo.com') return 'vimeo';
  if (h === 'soundcloud.com' || h === 'w.soundcloud.com' || h === 'on.soundcloud.com') return 'soundcloud';
  if (h === 'open.spotify.com' || h === 'embed.spotify.com') return 'spotify';
  if (h === 'mixcloud.com' || h === 'player-widget.mixcloud.com') return 'mixcloud';
  if (h.endsWith('bandcamp.com')) return 'bandcamp';
  if (h === 'instagram.com') return 'instagram';
  if (h === 'facebook.com') return 'facebook';
  return null;
}

export function resolveEmbed(provider: string | undefined, u: URL): ResolvedEmbed {
  const detected = detect(u);
  const p = !provider || provider === 'auto' || provider === 'other' ? (detected ?? 'other') : provider;

  switch (detected === p ? p : null) {
    case 'youtube': {
      const id = youtubeId(u);
      if (!id || u.pathname.startsWith('/embed/')) return { provider: p, url: u };
      const out = new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);
      const t = u.searchParams.get('t') ?? u.searchParams.get('start');
      const seconds = t ? Number.parseInt(t, 10) : NaN;
      if (Number.isFinite(seconds) && seconds > 0) out.searchParams.set('start', String(seconds));
      return { provider: p, url: out };
    }
    case 'vimeo': {
      const m = host(u) === 'vimeo.com' ? u.pathname.match(/^\/(?:.*\/)?(\d+)/) : null;
      return { provider: p, url: m ? new URL(`https://player.vimeo.com/video/${m[1]}`) : u };
    }
    case 'spotify': {
      const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
      return { provider: p, url: m ? new URL(`https://open.spotify.com/embed/${m[1]}/${m[2]}`) : u };
    }
    case 'soundcloud': {
      if (u.hostname === 'w.soundcloud.com') return { provider: p, url: u };
      const page = `https://soundcloud.com${u.pathname}`;
      return { provider: p, url: new URL(`https://w.soundcloud.com/player/?url=${encodeURIComponent(page)}`) };
    }
    case 'mixcloud': {
      if (u.hostname === 'player-widget.mixcloud.com' || u.pathname.startsWith('/widget/')) return { provider: p, url: u };
      const out = new URL('https://player-widget.mixcloud.com/widget/iframe/');
      out.searchParams.set('feed', u.pathname);
      out.searchParams.set('hide_cover', '1');
      out.searchParams.set('mini', '1');
      return { provider: p, url: out };
    }
    default:
      return { provider: p, url: u };
  }
}
