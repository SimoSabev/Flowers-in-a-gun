# Design spec — "Stage, light"

Martina picked the brutalist direction with the lime-green accent, but asked for it **lighter and more corporate**. The approved desktop homepage is `reference-home.html` (open it in a browser; images load from `../public`). Build everything else in the same language. Where this file and the mockup disagree, this file wins.

## Character in one line
A clean, light, confident music magazine: hard black rules, square corners, big condensed headlines, lime used like a highlighter. Serious enough for a journalist's portfolio, loud enough for a music blog.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#F6F6F2` | page background (warm paper white) |
| `--surface` | `#FFFFFF` | cards, header, ad slots |
| `--ink` | `#0D0D0C` | text, 2px rules, primary buttons, top bar, footer |
| `--muted` | `#5C5B55` | meta text (dates, venues, bylines) |
| `--rule-soft` | `#D9D8D0` | 1px dividers inside lists |
| `--lime` | `#D8FF3C` | accent **fills only**: tags, highlight blocks, Band of the Week, focus ring |
| `--green-text` | `#3D5A00` | links and accent text on light backgrounds (7:1 contrast) |

Rules:
- Lime is never text on a light background (fails contrast). Lime text only on `--ink`.
- On lime, text is always `--ink`.
- No gradients, no shadows, no rounded corners (radius 0 everywhere), no emoji.
- Structural borders are `2px solid var(--ink)`; soft list dividers are `1px var(--rule-soft)`.

## Type
- Display: **Anton**, uppercase, `font-weight: 400`. Only for H1, H2 and big section banners. Line-height 0.95–1.
- Text/UI: **Archivo** 400/500/600/700.
- Scale (desktop → mobile): H1 hero 60 → 38; H1 article 64 → 40; H2 section 40 → 30; card title 20–22 → 18; body 18 → 17 with line-height 1.65; meta and labels 12–14, uppercase, letter-spacing 0.08–0.12em, weight 700.
- Article body width: max 680px.

## Layout
- Max content width 1280, side padding 56 desktop / 20 tablet / 16 phone. 12-column grid, 24px gutters.
- Section header pattern: Anton H2 on the left, "All … →" link on the right in `--green-text`, 2px ink rule under it.
- Generous vertical rhythm: 72px between sections on desktop, 48 on mobile. This whitespace is what makes it read "corporate", so don't compress it.

## Components
- **Top bar** (ink, 12px uppercase): tagline left; Instagram / Advertise / Newsletter right (Newsletter in lime). Hidden on phones. Links: Instagram → `https://www.instagram.com/flowersinagun/`; Advertise → `mailto:` from `NEXT_PUBLIC_CONTACT_EMAIL`; Newsletter → hide until a newsletter exists. "Contributors" (footer) → a generated `/contributors/` page listing all authors with post counts.
- **Header** (white, 2px ink bottom border): Martina's original 2014–2018 logo (black gun barrel, "flowersinagun" with red "in", daisies), recreated as SVG in `public/brand/` (`design/logo/`); the full lockup with tagline from 1024px, the compact one below. It replaces the earlier Anton wordmark, at Martina's request. Nav row under the logo: Live, Jazz, Rock/Metal, Experimental, Band of the Week, About. On phones: compact logo + 44×44 menu button opening a full-screen ink panel with the nav in Anton. Favicon: the big daisy.
- **Category → nav mapping**: Live = `concert-reviews-more`; Jazz = `jazz-2`; Rock/Metal = `rockalternative`; Experimental = `avant-gardeexperimental`; Band of the Week = `band-of-the-week-2` (plus the Hall of Fame page). All 23 categories stay reachable at `/category/<slug>/` and are listed in the footer.
- **Tag pill**: lime fill, 2px ink border, 12px uppercase bold. Used for the primary category on the hero and article.
- **Post card**: white, 2px ink border, image 16:10 with 2px ink bottom border, venue/category label in `--green-text`, title 20px bold. Hover: title underline + lime 4px bar on the card top. Whole card is one link.
- **List item** (secondary stories): title only, 17px/600, soft divider.
- **Buttons**: primary = ink fill + white text; secondary = white + 2px ink border; on lime blocks the primary stays ink. Height ≥ 44px. Uppercase 14px bold.
- **Band of the Week block**: full lime panel, 2px ink border, huge Anton title, short text, two buttons (Submit your band → mailto for now; Hall of Fame → `/band-of-the-week-hall-of-fame/`).
- **Ad slot**: white box, 1px dashed `#8C8B84`, tiny "Advertisement" label. Sizes: leaderboard 728×90, billboard 970×250, rectangle 300×250, halfpage 300×600, mobile 320×100.
- **Missing image fallback**: ink box with the category in lime and the post title in white Anton. Never a broken image.
- **Focus**: 3px lime outline + 2px ink offset, visible on every interactive element.

## Templates
1. **Home** (as the mockup): hero = latest post with a usable image (image 8 cols + text 4 cols), then "Last night in the pit" (next 4 posts from Live and Rock/Metal), Band of the Week, "Jazz after midnight" (2 large + 4 list from Jazz), billboard ad, "More stories" (next 6 posts, 3-column card grid), footer. Every section is filled from real content by category and date; don't hardcode posts.
2. **Article**: breadcrumb (category), tag pill, Anton H1, byline "By <Author> · <Date>", featured image full width (max 1152) with 2px border, body 680px, pull quotes in Anton 34px with a lime left bar, embeds full width of the body column, tags as outline pills, author box, "More from <category>" (3 cards), archived comments, sidebar on desktop ≥1200px with the halfpage ad and a list of the latest 5 posts. On phones the sidebar drops below the body.
3. **Category / Tag / Author listing**: Anton H1 with the name and post count, 3-column card grid (1 column on phones), pagination with big square numbered buttons. A leaderboard ad after the first 6 cards.
4. **Band of the Week Hall of Fame** and other pages: article template without byline and sidebar.
5. **About**: article template. Content comes from `content/pages/about.mdoc`.
6. **404**: Anton "404 — lost in the pit", a search box or links to the 4 main categories and the home page.
7. **Footer** (ink): logo, "Founded by Mart Kawaii", all categories in columns, About / Contributors / Advertise / Instagram, © year.

## Responsive
Breakpoints: phone < 640, tablet 640–1023, desktop ≥ 1024. Test at 390, 768, 1280 and 1440. No horizontal scroll at any width. Card grid 4→2→1, hero stacks image over text on tablet and phone.
