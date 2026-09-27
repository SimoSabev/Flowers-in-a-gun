# Logo

Martina's 2014–2018 logo (`public/wp-content/uploads/2014/01/cropped-header22.jpg`, a 1254×127 JPEG)
rebuilt as clean SVG on the same 1254×127 grid, so proportions are identical.

| File | Use |
|---|---|
| `public/brand/logo.svg` | Full lockup with tagline, red "in" (original) |
| `public/brand/logo-lime.svg` | Same, "in" in site lime `#D8FF3C` |
| `public/brand/logo-compact.svg`, `-lime.svg` | Shortened barrel, no tagline: phones, footer |
| `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` | Favicon from the big daisy |

Pick the variant for the site in `lib/site.ts` (`LOGO_IN_COLOR`).

How it was made:
- Colours sampled from the original: bar `#231F20`, red `#D8252D`.
- Barrel, sight, muzzle, stems: measured geometry.
- Daisies: parametric petals fitted to the original pixels (`fit-daisies.mjs`).
- Type: the original uses a Myriad-style sans, which can't be embedded. The text is outlined from
  Source Sans 3 (SIL Open Font License) and fitted to the original text boxes. The SVGs contain
  paths only, no fonts.

Regenerate (the tooling is not a project dependency):

```bash
npm i --no-save opentype.js @fontsource/source-sans-3
node design/logo/build-logo.mjs     # writes public/brand/*.svg and the app/ icons
node design/logo/fit-daisies.mjs    # optional: re-fit petals, paste the result into build-logo.mjs
```
