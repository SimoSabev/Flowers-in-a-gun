/**
 * Rebuilds the 2014–2018 Flowers in a Gun logo (public/wp-content/uploads/2014/01/cropped-header22.jpg,
 * 1254×127 px) as clean vector SVGs, on the original's own coordinate grid so proportions match 1:1.
 *
 * - Barrel, sight, muzzle and stems: plain geometry measured from the original pixels.
 * - Daisies: parametric petals (angle, length, half-width per petal) fitted to the original
 *   (see design/logo/README.md).
 * - Type: the original is set in a Myriad-style humanist sans. Myriad can't be embedded, so the
 *   text is converted to outlines from Source Sans 3 (SIL OFL), fitted to the original's text boxes.
 *   The SVGs contain paths only: no font files, no <text>.
 *
 * Run (one-off; the tooling is deliberately not a project dependency):
 *   npm i --no-save opentype.js @fontsource/source-sans-3
 *   node design/logo/build-logo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

export const COLORS = {
  ink: '#231F20', // the original's "rich black" bar (measured 35,31,32)
  red: '#D8252D', // flower centres, "in", "music blog" (measured on the flower centres, least JPEG bleed)
  lime: '#D8FF3C', // site accent, for the alternative "in"
  white: '#FFFFFF',
};

/* ---------- geometry measured on the original (1254×127 grid) ---------- */

export const GEOMETRY = {
  bar: { top: 62.8, bottom: 96.4 },
  muzzle: { cx: 1074, cy: 80, r: 14, gap: 5 }, // bar end is a concave arc r + gap around the muzzle
  sight: { x0: 1043.5, x1: 1053.5, top: 45 },
  stemWidth: 2.8,
  outline: 2.5,
  stems: [
    'M1083,76 C1095,70.5 1108,65 1121,57', // to the top daisy
    'M1086,80.5 C1110,83 1150,83.5 1180,77', // to the big daisy
    'M1083,86 C1093,87 1101,89.5 1108.5,94.5', // to the small daisy
  ],
  // white "bore" slits inside the muzzle, between the three stems
  bore: ['M1068,74.6 L1089,73.2', 'M1076,79.4 L1089,79.2', 'M1071,84.4 L1089,85.4'],
};

/** Petals: [axis° (screen, clockwise from +x), tip distance, half-width]. Fitted by fit-daisies.mjs. */
export const DAISIES = {
  top: { cx: 1130.2, cy: 46.1, center: 6.1, petals: [[40, 30.5, 7.35], [95.5, 29, 7.75], [157.5, 27, 7], [213.5, 31, 7.35], [273.5, 27.5, 7], [343, 22, 6.65]] },
  big: { cx: 1200.6, cy: 62.3, center: 10.4, petals: [[56, 40, 14.6], [113.5, 37.5, 11.25], [176, 42, 12.75], [232, 38, 11.95], [294, 42, 12], [353.5, 39, 12]] },
  small: { cx: 1114.5, cy: 99.5, center: 2.7, petals: [[24.5, 16, 4], [78, 13.5, 4], [146, 13.5, 4.75], [198, 13, 4], [263, 13, 3.65], [305, 13, 4], [345, 12.5, 4]] },
};

/* ---------- type ---------- */

const fontFile = (w) => require.resolve(`@fontsource/source-sans-3/files/source-sans-3-latin-${w}-normal.woff`);
let fonts;
function loadFonts() {
  if (!fonts) {
    const load = (w) => opentype.parse(fs.readFileSync(fontFile(w)).buffer.slice(0));
    fonts = { bold: load(700), regular: load(400) };
  }
  return fonts;
}

/**
 * Lays out runs of [text, font, fill] on one baseline so that the ink box spans exactly
 * x0..x1, with font size chosen so the x-height matches `xHeight`.
 */
function setType(runs, { x0, x1, baseline, xHeight }) {
  const f = loadFonts();
  const size = xHeight / (f.bold.tables.os2.sxHeight / f.bold.unitsPerEm);
  // natural width, then spread the difference as tracking between glyphs
  // plain cmap lookup: no shaping needed for lowercase Latin, and it avoids opentype.js GSUB gaps
  const glyphsOf = (t, font) => [...t].map((ch) => font.charToGlyph(ch));
  const all = runs.flatMap(([t, w]) => glyphsOf(t, f[w]).map((g) => ({ g, font: f[w] })));
  const advance = (i) => (all[i].g.advanceWidth * size) / all[i].font.unitsPerEm;
  const first = all[0].g.getBoundingBox();
  const last = all[all.length - 1].g.getBoundingBox();
  const lsb = (first.x1 * size) / all[0].font.unitsPerEm;
  let natural = 0;
  for (let i = 0; i < all.length - 1; i++) natural += advance(i);
  const inkNatural = natural + (last.x2 * size) / all[all.length - 1].font.unitsPerEm - lsb;
  const tracking = (x1 - x0 - inkNatural) / (all.length - 1);

  const out = [];
  let x = x0 - lsb;
  let gi = 0;
  for (const [text, weight, fill] of runs) {
    let d = '';
    for (const g of glyphsOf(text, f[weight])) {
      d += g.getPath(x, baseline, size).toPathData(2);
      x += advance(gi++) + tracking;
    }
    out.push({ d, fill });
  }
  return out;
}

/* ---------- drawing ---------- */

const r2 = (n) => Math.round(n * 100) / 100;

function petalPath(cx, cy, inner, [angle, tip, half]) {
  // an ellipse from `inner` to `tip` along the axis, rotated into place
  const rx = (tip - inner) / 2;
  const d = inner + rx;
  const t = (angle * Math.PI) / 180;
  const ex = cx + d * Math.cos(t);
  const ey = cy + d * Math.sin(t);
  return `<ellipse cx="${r2(ex)}" cy="${r2(ey)}" rx="${r2(rx)}" ry="${r2(half)}" transform="rotate(${r2(angle)} ${r2(ex)} ${r2(ey)})"/>`;
}

export function daisy({ cx, cy, center, petals }, { outline, red, ink, white }) {
  const inner = center * 0.5;
  return [
    `<g fill="${white}" stroke="${ink}" stroke-width="${outline}" stroke-linejoin="round">`,
    ...petals.map((p) => petalPath(cx, cy, inner, p)),
    `<circle cx="${cx}" cy="${cy}" r="${center}" fill="${red}"/>`,
    `</g>`,
  ].join('');
}

function artwork({ inColor, dx = 0, tagline = true, daisies = DAISIES, geometry = GEOMETRY }) {
  const { bar, muzzle, sight } = geometry;
  const c = { ...COLORS, outline: geometry.outline };
  const R = muzzle.r + muzzle.gap;
  const yTop = bar.top - muzzle.cy;
  const yBot = bar.bottom - muzzle.cy;
  const xTop = muzzle.cx - Math.sqrt(R * R - yTop * yTop) + dx;
  const xBot = muzzle.cx - Math.sqrt(R * R - yBot * yBot) + dx;
  const move = dx ? ` transform="translate(${dx} 0)"` : '';

  const word = setType(
    [
      ['flowers', 'bold', COLORS.white],
      ['in', 'bold', inColor],
      ['agun', 'bold', COLORS.white],
    ],
    { x0: 32, x1: 246.5, baseline: 88.4, xHeight: 17 },
  );
  const tag = tagline
    ? setType(
        [
          ['badass ', 'regular', COLORS.white],
          ['music blog', 'bold', COLORS.red],
          [' and more', 'regular', COLORS.white],
        ],
        { x0: 813, x1: 1030.5, baseline: 83.6, xHeight: 8.4 },
      )
    : [];

  return [
    // barrel with the concave crown around the muzzle
    `<path fill="${c.ink}" d="M0,${bar.top} H${r2(xTop)} A${R},${R} 0 0 0 ${r2(xBot)},${bar.bottom} H0 Z"/>`,
    `<g${move}>`,
    `<path fill="${c.ink}" d="M${sight.x0},${bar.top + 1} V${sight.top + (sight.x1 - sight.x0) / 2} A${(sight.x1 - sight.x0) / 2},${(sight.x1 - sight.x0) / 2} 0 0 1 ${sight.x1},${sight.top + (sight.x1 - sight.x0) / 2} V${bar.top + 1} Z"/>`,
    `<circle cx="${muzzle.cx}" cy="${muzzle.cy}" r="${muzzle.r}" fill="${c.ink}"/>`,
    `<g fill="none" stroke="${c.ink}" stroke-width="${geometry.stemWidth}" stroke-linecap="round">${geometry.stems.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    `<g fill="none" stroke="${c.white}" stroke-width="1.6" stroke-linecap="round">${geometry.bore.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    daisy(daisies.small, c),
    daisy(daisies.top, c),
    daisy(daisies.big, c),
    `</g>`,
    ...word.map((w) => `<path fill="${w.fill}" d="${w.d}"/>`),
    ...tag.map((w) => `<path fill="${w.fill}" d="${w.d}"/>`),
  ].join('\n');
}

/** Full logo, 1254×127, same grid as the original. */
export function fullLogo(inColor = COLORS.red, opts = {}) {
  return svg(`0 0 1254 127`, artwork({ inColor, ...opts }));
}

/**
 * Compact lockup for narrow headers: same wordmark and gun, barrel shortened and tagline dropped.
 * Everything right of the wordmark shifts left; the viewBox trims the empty band above and below.
 */
export const COMPACT_SHIFT = -770;
export function compactLogo(inColor = COLORS.red, opts = {}) {
  return svg(`0 14 ${1254 + COMPACT_SHIFT} 101`, artwork({ inColor, dx: COMPACT_SHIFT, tagline: false, ...opts }));
}

function svg(viewBox, body) {
  const [, , w, h] = viewBox.split(' ').map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" role="img" aria-label="Flowers in a Gun">
<title>Flowers in a Gun</title>
${body}
</svg>
`;
}

/** Favicon: the big daisy alone, outlines thickened so they survive 16 px. */
export function faviconSvg() {
  const d = DAISIES.big;
  const pad = 3;
  const reach = Math.max(...d.petals.map(([, tip, half]) => tip + half * 0.2)) + pad;
  const box = `${r2(d.cx - reach)} ${r2(d.cy - reach)} ${r2(reach * 2)} ${r2(reach * 2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">
${daisy(d, { ...COLORS, outline: 5 })}
</svg>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const outDir = path.join(ROOT, 'public', 'brand');
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    'logo.svg': fullLogo(COLORS.red),
    'logo-lime.svg': fullLogo(COLORS.lime),
    'logo-compact.svg': compactLogo(COLORS.red),
    'logo-compact-lime.svg': compactLogo(COLORS.lime),
  };
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), body);
  const icon = faviconSvg();
  fs.writeFileSync(path.join(ROOT, 'app', 'icon.svg'), icon);
  // favicon.ico for old browsers and crawlers: PNG-compressed entries at 16/32/48 px
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(icon), { density: 1200 }).resize(s, s).png().toBuffer()));
  fs.writeFileSync(path.join(ROOT, 'app', 'favicon.ico'), ico(sizes, pngs));
  // iOS home screen: opaque, with breathing room
  const apple = await sharp(Buffer.from(icon), { density: 1200 }).resize(140, 140).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: COLORS.white } })
    .composite([{ input: apple, left: 20, top: 20 }]).png().toFile(path.join(ROOT, 'app', 'apple-icon.png'));
  console.log('wrote', Object.keys(files).map((f) => `public/brand/${f}`).join(', '), '+ app/icon.svg, app/favicon.ico, app/apple-icon.png');
}

/** Minimal ICO container holding PNG images. */
function ico(sizes, pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i] % 256, e);
    header.writeUInt8(sizes[i] % 256, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}
