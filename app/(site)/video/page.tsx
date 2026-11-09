import type { Metadata } from 'next';
import { VideoCard } from '@/components/VideoCard';
import { getVideos, type VideoSection } from '@/lib/content';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Video',
  description: 'Video reports by Mart Kawaii from New York: Fashion Week, the Tribeca Film Festival and the city.',
  alternates: { canonical: absoluteUrl('/video/') },
};

const SECTIONS: { key: VideoSection; label: string }[] = [
  { key: 'fashion', label: 'New York Fashion Week' },
  { key: 'film', label: 'Film & Tribeca' },
  { key: 'new-york', label: 'New York' },
];

export default async function VideoPage() {
  const videos = await getVideos();
  const sections = SECTIONS.map((s) => ({ ...s, items: videos.filter((v) => v.section === s.key) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <div className="wrap">
      <header className="mt-10 border-b-2 border-ink pb-6 lg:mt-14">
        <p className="label text-green-text">On camera</p>
        <h1 className="display mt-3 text-[40px] sm:text-[52px] lg:text-[64px]">Video</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed">
          Video reports by Mart Kawaii from New York: runways, red carpets and the city.
        </p>
        <p className="mt-3 text-[14px] font-semibold text-muted">{videos.length} videos</p>
        {sections.length > 1 && (
          <nav aria-label="Video sections" className="mt-5">
            <ul className="flex flex-wrap gap-3">
              {sections.map((s) => (
                <li key={s.key}>
                  <a href={`#${s.key}`} className="tag-pill">
                    {s.label} ({s.items.length})
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {sections.map((s) => (
        <section key={s.key} id={s.key} aria-labelledby={`${s.key}-h`} className="mt-10 scroll-mt-6">
          <h2 id={`${s.key}-h`} className="display text-[30px] sm:text-[36px]">
            {s.label}
          </h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {s.items.map((v) => (
              <li key={v.slug}>
                <VideoCard
                  title={v.title}
                  outlet={v.outlet}
                  embed={v.embed!}
                  poster={v.poster}
                  description={v.description}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
