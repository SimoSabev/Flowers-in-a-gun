# flowersinagun.com

The restored Flowers in a Gun music blog: Next.js (App Router) + Keystatic + Tailwind, statically
generated and deployed on Vercel. The project brief is `CLAUDE.md`, the design spec is `design/DESIGN.md`,
and the current state is `STATUS.md`.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in what you need; everything has a safe default
npm run dev                  # http://localhost:3000, editor at http://localhost:3000/keystatic
npm run build                # prebuild: resized photos -> build -> postbuild: route check
npm start
```

| Script | What it does |
|---|---|
| `npm run build` | `scripts/make-derivatives.ts` (640/1280 px copies of oversized photos into `public/_img/`, ~10 s), `next build`, then `scripts/check-routes.ts`, which fails the build if any original URL or redirect target has no route |
| `npm run check-routes` | Route check only (needs a finished build) |
| `npm run typecheck` | `tsc --noEmit` |

## Layout

| Path | What |
|---|---|
| `app/(site)/` | Public templates: home, `[slug]` (posts and pages), `[slug]/[month]` (WordPress `/yyyy/mm/` archives), `category`, `tag`, `author` (each with `/page/<n>/`), `page/[n]` (home archive), `contributors` |
| `app/feed/`, `app/sitemap.ts`, `app/robots.ts` | `/feed/` (RSS 2.0), `/sitemap.xml`, `/robots.txt` |
| `app/keystatic/`, `app/api/keystatic/` | Keystatic editor and API |
| `lib/content.ts` | Reads Keystatic content, sorts, counts, derives excerpts and cover images. Fails the build on slug clashes |
| `lib/images.ts` | Checks every image on disk at build time: missing files are dropped, present ones get width/height |
| `lib/markdoc.tsx` | Markdoc to React: embeds, images, links, pull quotes. Never renders raw HTML |
| `components/` | Design system pieces (`AdSlot`, `PostCard`, `Cover`, `SiteHeader`, ...) |
| `content/` | Posts, pages, authors, categories, tags (Keystatic format) |
| `public/wp-content/uploads/` | Recovered images on their original WordPress paths. Do not move or rename them |
| `redirects.mjs` | 186 permanent redirects from the exporter (`?p=ID` shortlinks etc.) |
| `tools/verify/` | Wayback recovery pipeline and `05_verify.py` (checks a deployed site against the archive) |

## Environment variables

See `.env.example`. None are needed for a working preview build.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, sitemap, RSS. Default `https://www.flowersinagun.com` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | "Advertise" and "Submit your band" links. They are hidden while this is empty |
| `NEXT_PUBLIC_ADS_ENABLED` | `true` shows the reserved ad slots. Default off |
| `NEXT_PUBLIC_KEYSTATIC_GITHUB_REPO` | Repo the editor commits to. Default `SimoSabev/Flowers-in-a-gun` |
| `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | The editor in production. Until they are set, `/api/keystatic` answers 503 and the rest of the site works normally |

## Keystatic setup (one time, done by a person)

In development the editor writes straight to the files in `content/`. In production it commits to
GitHub through a GitHub App, and every commit triggers a Vercel rebuild.

1. Locally, with the repo cloned: `NEXT_PUBLIC_KEYSTATIC_STORAGE=github npm run dev`, then open
   `http://127.0.0.1:3000/keystatic` and follow **Create GitHub App**. Create it under the account that
   owns the repo. Keystatic writes the four `KEYSTATIC_*` values into `.env`.
2. In the GitHub App's settings, add the callback URL for each domain you'll edit from:
   `https://<domain>/api/keystatic/github/oauth/callback` (production domain, plus the Vercel preview
   domain if you want to edit there).
3. Install the app on this repository only.
4. Add the four variables (and `NEXT_PUBLIC_KEYSTATIC_GITHUB_REPO` if the repo moves) to the Vercel
   project for Production (and Preview), then redeploy.
5. Give Martina's GitHub account write access to the repo. She signs in at `/keystatic` with GitHub.

New images uploaded in the editor go to `public/images/posts/`. Old images stay where they are.

## Ads

`components/AdSlot.tsx` reserves the exact box for each size (leaderboard, billboard, rectangle, halfpage,
mobile). With `NEXT_PUBLIC_ADS_ENABLED` unset nothing renders in production (a dashed placeholder
shows in dev). To add a network, load its script once in `app/layout.tsx` and render its unit inside
the `data-ad-slot` element. Vercel Hobby is non-commercial: move to Pro before ads go live.

## Verify a deployment

```bash
cd tools/verify && python -m pip install -r requirements.txt
python 05_verify.py --base https://<preview-url> --no-variants
```
