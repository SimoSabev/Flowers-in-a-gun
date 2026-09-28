# STATUS

## Done
- **Repo layout** as `CLAUDE.md` describes: the exported site (`content/`, `public/`, `keystatic.config.ts`, `redirects.*`) moved from `build/site/` to the root. The recovery pipeline and its data moved to `tools/verify/`. `build/` was dropped: it held WordPress-variant leftovers and a duplicate of `public/wp-content`, is regenerable, and is gitignored. Junk post `content/posts/-a href=.mdoc` deleted.
- **URL contract**: `trailingSlash`. Posts and pages at `/<slug>/`. `/category|tag|author/<slug>/` and `/page/<n>/` pagination (12 per page). `/feed/` (RSS 2.0), `sitemap.xml`, `robots.txt` (disallows `/keystatic`), canonical URLs from `NEXT_PUBLIC_SITE_URL`, `dynamicParams = false` plus a real 404. Also:
  - the 186 legacy redirects;
  - `/…/page/1/` redirects to the listing root;
  - WordPress monthly archives `/<yyyy>/<mm>/`, which the Wayback inventory shows the old site had.
- **The build fails** on a post/page slug clash, a slug that collides with a reserved route, or a reference to an unknown author, category or tag.
- **Route check** (`scripts/check-routes.ts`, runs after every build): **0 missing** of 183 `originalUrl`s and **0 broken** of 186 redirect targets. It also reports on the Wayback inventory without failing the build: 183 of 184 article/page URLs resolve (see Content problems). Of 244 listing URLs, 36 are missing, all empty months, empty categories or old deep pagination (`/page/86/`).
- **Rendering**:
  - Every local image is checked on disk at build time. Missing ones are dropped and present ones get width/height. Measured layout shift is 0 on the home page, a long photo post and a listing, with ads on and off.
  - Hot-linked external images remove themselves if they fail to load.
  - Embeds: iframes for YouTube, Vimeo, SoundCloud, Bandcamp, Spotify and Mixcloud, only from those providers' own hosts. Instagram posts render as caption cards; anything else (MySpace) becomes a plain link.
  - No raw HTML is rendered, and the archived comments are read-only.
- **Images**: 244 resized copies (640 and 1280px) of the ~120 camera originals wider than 1400px are generated at build time into gitignored `public/_img/` and used through `srcset`. The hero went from 4.3 MB to 56 KB. Originals are untouched.
- **Design** ("Stage, light"): all templates are built: home, article, page, category/tag/author, contributors, 404, mobile menu.
  - Tested at 390, 768, 1024, 1280 and 1440px.
  - At 390px, 353 routes were checked (every post, page, category and author, plus 40 tags): no horizontal scroll.
- **Ads**: `AdSlot` placeholders at the positions in `DESIGN.md`: billboard on home, leaderboard after 6 cards, halfpage in the article sidebar (rectangle on phones). Off unless `NEXT_PUBLIC_ADS_ENABLED=true`, with one marked place to add a network.
- **Keystatic**:
  - `/keystatic` works in local mode; a post was edited and saved there. The round-trip is lossless: body and comment text are unchanged and only the YAML quoting changes.
  - Optional `venue` and `excerpt` fields were added for the design.
  - In production the editor API answers 503 until the GitHub App env vars exist, so preview builds don't need them.

### Round 2: logo, comments, text check
- **Logo**: the 2014–2018 logo (`cropped-header22.jpg`) is rebuilt as clean SVG on the original's 1254×127 grid. The daisies are fitted to the original pixels; the text is outlined from Source Sans 3 because the original Myriad can't be embedded. Files in `public/brand/`: full and compact versions, each with red "in" (the original) or lime "in". Switch with `LOGO_IN_COLOR` in `lib/site.ts`; it is **red for now, pick one**. The header shows the full logo with the navigation in a row below from 1024px, and the compact logo below that. The footer shows the logo on a white plate. The favicon, `favicon.ico` and the Apple touch icon come from the big daisy. Generator and notes: `design/logo/`.
- **About**: shows `flowers_in_a_barrel_12.jpg` as "The original 2013 header".
- **Comments**: all **46** recovered with author, date ("March 31, 2014 at 3:44 pm") and reply threading. The first export missed the theme's markup and skipped the About page's 15. `tools/verify/03_parse.py` is fixed, and `tools/verify/fix_comments.py` rewrote only the `comments:` blocks of 15 files. It verifies that every existing comment's words are unchanged, and a separate check confirmed the bodies are byte-identical.
- **The 4 posts at 85–90% of the original word count**: no article text was lost. The gaps were:
  - Instagram captions the export dropped (kmfdm, modest-mouse, mark-zaleski). All 5 Instagram embeds now show their caption and credit as a card (`tools/verify/fix_embeds.py`).
  - A self-hosted video the export dropped (mark-zaleski). It's back in place in the post, but the file must be downloaded (see below).
  - billy-roberts: fallback text inside its 3 Bandcamp iframes, which readers never saw. All 3 players are present.

  Across all 172 posts, the site now shows at least 98.9% of the original words; what's left is Instagram's "View this post on Instagram" button text.

## Not done / needs a person
- **Mark Zaleski video**: `web.archive.org` is blocked from the build environment. The archive captured the URL **with `?_=1`**. The first command in this file left that off, which is why the file committed on `site-v1` is a Wayback HTML page, not a video. It isn't merged, and the site ignores files that aren't real media. From any machine, run:
  `curl -L -o public/wp-content/uploads/2017/10/VID_28561110_005603_267.mp4 "https://web.archive.org/web/20180213080202id_/http://www.flowersinagun.com/wp-content/uploads/2017/10/VID_28561110_005603_267.mp4?_=1"`
  then check it with `file public/wp-content/uploads/2017/10/VID_28561110_005603_267.mp4`, which must say "ISO Media", before committing.
- **Keystatic GitHub App**: create it, set the env vars and add Martina as a collaborator (steps in `README.md`). The OAuth callback goes through the trailing-slash redirect (`/callback` → `/callback/`). I expect that to work, but it's unverified until the app exists.
- **Vercel preview**, then `tools/verify/05_verify.py --base <preview> --no-variants`. Also check on the first deploy:
  1. that the ~540 MB `public/` is accepted;
  2. that `public/_img/`, generated during the build, is served. If it isn't, pages still work and fall back to the full-size originals.
- `design/reference-home.html` was never in the repo. The design follows `DESIGN.md` plus the approved screenshot.
- `NEXT_PUBLIC_CONTACT_EMAIL` is unknown. Until it's set, "Advertise" and "Submit your band" are hidden. The Newsletter link is hidden per `DESIGN.md`.
- No site search: optional in `CLAUDE.md`. The 404 page links to the home page and the four main categories.

## Content problems (not changed; need Martina's decision)
1. **Comments (decided)**: the About page's 15 comments (2011 banter, including Martina's personal email) are **kept in `content/pages/about.mdoc` but hidden** from the site (`hideComments: true`, a checkbox in the editor). The 2 spam comments ("co op inspection", "search") are **deleted**. Email addresses are **redacted** in every displayed comment ("[email removed]"); the content files keep the originals.
2. **Hall of Fame links to 6 posts that weren't recovered**, so those links 404: `/band-of-the-week-1-viewer/`, `/radio-radio/`, `/black-eskimo/`, `/o-h/`, `/the-clover-club/`, `/and-the-new-band-of-the-week-winner-is/`. Other dead internal links:
   - `/kid-tested/` (in `the-insurance-salesmen`);
   - `/fixe-fetish-party-june-26th-one-one-nyc/` (in `fixe-magazine-party-tammany-hall`);
   - old attachment pages under `/2013/01/21/…` (in `interview-with-michael-gira-from-swans` and `life-along-the-borderline-…`);
   - two hrefs that were broken on the original site (`…/Jazz Standard`, `…/Fay Victor`).
3. **Links typed without `http://`** (`/the-divers/www.facebook.com/…` and about 20 like it, plus 2 email addresses) are repaired at render time only. The files are unchanged.
4. **Pages whose plugins are gone**: `/my-instagram-feed/` (one sentence; the feed widget is lost) and `/yop-poll-archive/` (only poll pagination links remain). Kept because they are original URLs. Should they stay, redirect to Instagram or the home page, or be removed?
5. **Near-empty posts** whose media was lost or hot-linked: `autumn-in-central-park`, `photo-of-the-night-1-siouxsie-by-pierre-et-gilles`, `whos-ted-bundy`, `my-favourite-valentines-card`, `song-of-the-night-54-pj-harvey-you-said-something`, `song-of-the-night-60-john-maus-dear-moon`.
6. **Lost photos**: 605 of 920 local image references point to files that don't exist. 85 posts are affected (see `missing_photos_for_martina.csv`) and 12 posts end up with no image at all.
   - 13 posts have a `featuredImage` whose file is missing, so the card falls back to a body image or the typographic card: `12-muse-of-the-brighton-bathhouse`, `a-moment-with-spirit-of`, `autumn-in-central-park`, `band-of-the-week`, `bushwick-burlesque-bizarre-and-wildly-entertaining`, `chvrches-shows-out-in-nyc-opener-potty-mouth-nearly-stole-the-show`, `dave-strykers-cd-release-jazz-standard-interview-for-flowers-in-a-gun`, `financial-district-looking-like-a-ghost-town-on-halloween-after-hurricane-sandy`, `im-having-a-great-time-in-sofia`, `photos-from-bulgaria-2013`, `st-patricks-parade-nyc-2013`, `the-last-city-2`, `urban-saints`.
7. **125 hot-linked external images**: mostly Facebook CDN and Dropbox, almost all dead. Two hosts look like leftovers from the 2018 hack and should probably be removed:
   - `img0.ibank.toxity.biz` in `balkansky-brat`;
   - `redirect.bloggenpucky.net` in `joy-division-disorder-song-review`.
8. **Title check**: `12-muse-of-the-brighton-bathhouse` has the title `# 12 Muse of the Brighton Bathhouse` (the body says `#012`).
9. **Slugs ending in `-2`** (`christmas-and-video-game-cheats-2`, `the-last-city-2`) suggest the `-1` versions were lost or never existed.
10. **Missing article**: the one Wayback article URL with no content, `/ducati-james-president-trump/`, was captured in 2025 after the hosting expired and failed download as "too small". It is probably squatter spam, so it's not restored.
11. **The category pill shows the first category listed** in a post (e.g. Modest Mouse shows "Alternative/Rock/Metal", not "Concerts"). Reorder categories in the editor to change it.
12. **Non-ASCII slug** `the-partizan-song-песня-партизана` works (percent-encoded), just noting it.

## Env vars
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_ADS_ENABLED`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_REPO`, `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`. The last four are only needed for the production editor. Details in `README.md` and `.env.example`.

## Next steps
1. Import the repo in Vercel, deploy a preview and run `05_verify.py` against it.
2. Set up the Keystatic GitHub App and env vars; have Martina make a test edit.
3. Martina picks the red or lime logo, reviews the content problems above (especially 2, 4 and 7) and looks for lost photos using `missing_photos_for_martina.csv`.
4. Download the Mark Zaleski video (corrected command above, with `?_=1`).
5. At launch: point DNS at Vercel, make `www.flowersinagun.com` the primary domain (apex redirects to it) and move to Vercel Pro before ads go live.
