# flowersinagun.com — restored music blog

## What this is
Flowers in a Gun is a music journalism blog (concert reviews, interviews, records; roughly 2012–2018) run by Martina Dechevska, whose pen name on the blog was "Mart Kawaii" (author slug `admin`). The site died when its hosting expired and no backups existed. All content in this repo was recovered from the Wayback Machine and exported to Keystatic format. **The recovered content is the product. Never invent, rewrite or "improve" article text, titles, dates or authors.**

Goals, in priority order:
1. Every old URL works again with the same path, because other sites link to these articles and they are her portfolio.
2. She can write new posts herself in a simple editor (Keystatic at `/keystatic`).
3. It looks like the approved design (see `design/`).
4. Ad slots are ready for when the blog earns traffic (no ad network wired yet).

## What is already in the repo
| Path | What |
|---|---|
| `content/posts/*.mdoc` | 179 posts (Markdoc + YAML frontmatter: title, date, author, categories, tags, featuredImage, wpId, originalUrl, comments) |
| `content/posts/-a href=.mdoc` | **junk**: an archived 404 page, not a post. Delete it (`git rm`) and make sure nothing links to it |
| `content/pages/*.mdoc` | 4 pages: about, band-of-the-week-hall-of-fame, my-instagram-feed, yop-poll-archive |
| `content/authors`, `categories`, `tags` | yaml, `name:` only (15 / 23 / 756) |
| `public/wp-content/uploads/**` | 1 486 images on their **original WordPress paths** (527 MB). Do not move or rename them |
| `keystatic.config.ts` | schema already written (posts, pages, authors, categories, tags, Markdoc `embed` block). Storage: local in dev, GitHub in prod. Replace `OWNER/flowersinagun` with the real repo (read from env, e.g. `KEYSTATIC_GITHUB_REPO`) |
| `redirects.mjs` / `.csv` | 186 permanent redirects (mostly `?p=ID` shortlinks → slug). Use in `next.config.mjs` |
| `export_notes.txt` | wiring notes from the exporter. Read it |
| `unresolved_images.csv` | 824 image references whose file does not exist (lost from the archive) |
| `missing_photos_for_martina.csv` | per-post list of lost photos, for Martina to find in her own archive. Not used by the site |
| `tools/verify/` | `05_verify.py` checks every archived URL against a deployed site (see Verify) |
| `design/` | `DESIGN.md` (the spec) and `reference-home.html` (approved homepage mockup, open it in a browser) |

## Stack (decided, do not change)
- Next.js (App Router, latest stable), TypeScript, deployed on Vercel.
- Keystatic (`@keystatic/core`, `@keystatic/next`) + `@markdoc/markdoc` to render content.
- Styling: Tailwind CSS with the design tokens from `design/DESIGN.md` as CSS variables. No component library.
- Google Fonts via `next/font/google` (Anton, Archivo).
- Images: plain `<img loading="lazy" decoding="async">`, not `next/image` (the Vercel image quota on small plans is too low for 1 500 photos).
- No database, no auth other than Keystatic's.

## URL contract (the most important part)
- `trailingSlash: true`. Every URL ends with `/`.
- Posts **and** pages live in the same space: `/<slug>/` (WordPress `/%postname%/`). Slug = filename without `.mdoc`. Posts win over pages on conflict (there should be none; fail the build if there is).
- `/category/<slug>/`, `/tag/<slug>/`, `/author/<slug>/`, each paginated as `/…/page/<n>/`. Home is paginated as `/page/<n>/`.
- `/feed/` = RSS 2.0 of the latest posts (the old site had it and feed readers may still hit it).
- `?p=<wpId>` → slug: already in `redirects.mjs`.
- Images: `/wp-content/uploads/...` served as-is from `public/`.
- Everything statically generated (`generateStaticParams`, `dynamicParams = false`), with a real 404 page for anything else.
- `sitemap.xml` and `robots.txt` (allow all; disallow `/keystatic`).
- Canonical URL on each page = `https://www.flowersinagun.com/<path>/` (read the base from `NEXT_PUBLIC_SITE_URL`).

## Content rendering rules
- Render Markdoc with the `embed` block mapped to a React `<Embed provider src>`: responsive iframes for YouTube/Vimeo/SoundCloud/Bandcamp/Spotify/Mixcloud; for dead or unknown providers show a plain link, never a broken iframe.
- **Missing images** (see `unresolved_images.csv`): never show a broken image icon. At build time check whether the file exists under `public/`; if not, drop the `<img>` (keep the caption, if any). If the post's `featuredImage` is missing, fall back to the first existing image in the body, else a typographic card (see DESIGN.md).
- The old site was hacked in 2018; the export stripped all scripts. Never render raw HTML from content with `dangerouslySetInnerHTML` unless sanitized.
- `comments` in frontmatter: show read-only under the post as "Comments from the original site". No new comments system.
- Dates: show as "October 13, 2018".
- Post excerpt: the first paragraph of text, ~30 words, for cards and meta description.

## Ads
- `<AdSlot size="leaderboard|billboard|rectangle|halfpage|mobile" />` placeholder components at the positions in DESIGN.md.
- Reserve the exact box size (no layout shift). Render nothing visible to readers unless `NEXT_PUBLIC_ADS_ENABLED=true`, except a light dashed placeholder in development.
- No AdSense or other script yet. Leave one clear place to add it later.

## Keystatic
- `/keystatic` admin, local mode in dev, GitHub mode in production (env: `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`). Document the one-time GitHub App setup in `README.md`; do not try to create the app yourself.
- New images uploaded in the editor go to `public/images/posts/` (already configured). Old images stay where they are.
- Keep the existing schema. You may add fields only if the design needs them (e.g. `excerpt` override), always optional.

## Verify before you say you're done
1. `npm run build` passes with no type errors and generates every post, page, category, tag and author route.
2. A small script (`scripts/check-routes.ts` or similar) that lists every `originalUrl` path from `content/**` and asserts the matching route exists in the build output. Print the failures.
3. Lighthouse-level sanity on the home page and one long photo post: no layout shift from images or ad slots, images lazy-loaded, headings in order.
4. After a Vercel preview exists, Simo runs: `cd tools/verify && python -m pip install -r requirements.txt && python 05_verify.py --base https://<preview-url> --no-variants`.

## Working rules
- Work on a branch, commit in small logical steps, open a PR.
- Do not touch `content/` except: deleting the junk file above, and scripted, reviewable fixes you list in the PR description.
- When something in the content is ambiguous (odd slugs, duplicate titles, empty posts), don't guess: list it in `STATUS.md`.
- At the end write `STATUS.md`: what is done, what is not, known content problems, env vars needed, next steps. Keep it short.

## Out of scope (don't build)
Personal site martinadechevska.com (separate project), newsletter backend, search backend (a simple client-side title search is fine if cheap), comments, analytics beyond Vercel's, ad network code.

## Business notes (context only)
- Vercel Hobby is for non-commercial use. When ads go live the project must be on Vercel Pro. Not a code task, just don't design around Hobby-only features.
- Domain flowersinagun.com is Martina's. DNS gets pointed at Vercel at launch, not now.
