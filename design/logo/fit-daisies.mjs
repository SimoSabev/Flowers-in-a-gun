/**
 * Fits the daisy petals of build-logo.mjs to the original raster by coordinate descent on
 * [angle, tip, half-width] per petal (plus the centre radius), minimising the pixel difference
 * with cropped-header22.jpg. Prints the fitted DAISIES object to paste into build-logo.mjs.
 *
 *   npm i --no-save opentype.js @fontsource/source-sans-3 && node design/logo/fit-daisies.mjs
 */
import sharp from 'sharp';
import { DAISIES, fullLogo, COLORS } from './build-logo.mjs';

const ORIG = 'public/wp-content/uploads/2014/01/cropped-header22.jpg';
const REGION = { left: 1088, top: 8, width: 166, height: 112 };

const orig = await sharp(ORIG).extract(REGION).greyscale().raw().toBuffer();

async function loss(daisies) {
  const mine = await sharp(Buffer.from(fullLogo(COLORS.red, { daisies })), { density: 72 })
    .resize(1254, 127).flatten({ background: '#fff' }).extract(REGION).greyscale().raw().toBuffer();
  let d = 0;
  for (let i = 0; i < orig.length; i++) d += Math.abs(orig[i] - mine[i]);
  return d / orig.length;
}

const state = structuredClone(DAISIES);
let best = await loss(state);
console.error('start', best.toFixed(3));
const steps = [
  [4, 2, 1.5, 0.8],
  [2, 1, 0.75, 0.4],
  [1, 0.5, 0.35, 0.2],
];
for (const [dA, dT, dH, dC] of steps) {
  for (let round = 0; round < 3; round++) {
    let improved = false;
    for (const f of Object.values(state)) {
      const knobs = [
        ...f.petals.flatMap((p, i) => [[i, 0, dA], [i, 1, dT], [i, 2, dH]]),
        ['center', null, dC],
        ['cx', null, dC],
        ['cy', null, dC],
      ];
      for (const [i, k, step] of knobs) {
        for (const sign of [1, -1]) {
          const get = () => (k === null ? f[i] : f.petals[i][k]);
          const set = (v) => (k === null ? (f[i] = v) : (f.petals[i][k] = v));
          const old = get();
          set(Math.round((old + sign * step) * 100) / 100);
          const l = await loss(state);
          if (l < best - 1e-4) { best = l; improved = true; } else set(old);
        }
      }
    }
    console.error(`step ${dA}/${dT}/${dH} round ${round}:`, best.toFixed(3));
    if (!improved) break;
  }
}
console.log(JSON.stringify(state));
