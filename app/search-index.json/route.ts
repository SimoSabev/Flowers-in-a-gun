import { getPages, getPosts, getVideos } from '@/lib/content';

// Static title index for the header search (fetched by the browser on first open). No search backend.
export const dynamic = 'force-static';

export type SearchItem = { t: string; p: string; k: string; d?: string };

export async function GET() {
  const [posts, pages, videos] = await Promise.all([getPosts(), getPages(), getVideos()]);
  const items: SearchItem[] = [
    ...posts.map((p) => ({ t: p.title, p: p.path, k: p.venue ?? p.primaryCategory?.name ?? 'Story', d: p.date })),
    ...pages.map((p) => ({ t: p.title, p: p.path, k: 'Page' })),
    ...videos.map((v) => ({ t: v.title, p: `/video/#${v.slug}`, k: `Video · ${v.outlet}` })),
  ];
  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
  });
}
