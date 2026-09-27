/**
 * Pre-build step: resized copies of oversized photos for cards, heroes and article bodies.
 *
 * The archive holds ~100 camera originals of 3–5 MB (up to 5472 px wide). Vercel's image
 * optimiser is off (quota), so without this every card would download the full original.
 * Originals are never touched; copies go to public/_img/<width>/<original path> (gitignored)
 * and lib/images.ts uses them only if they exist, so a skipped run just means bigger downloads.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const DERIVATIVE_WIDTHS = [640, 1280] as const;
/** Only images wider than this get derivatives; smaller ones are already web-sized. */
export const DERIVATIVE_MIN_SOURCE_WIDTH = 1400;

const PUBLIC = path.join(process.cwd(), 'public');
const SOURCES = ['wp-content/uploads', 'images/posts'].map((d) => path.join(PUBLIC, d));
const OUT = path.join(PUBLIC, '_img');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

async function main() {
  const started = Date.now();
  const files = SOURCES.flatMap(walk).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  let made = 0;
  let skipped = 0;
  const queue = [...files];

  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      let width: number | undefined;
      try {
        width = (await sharp(file).metadata()).width;
      } catch {
        continue; // unreadable file: lib/images.ts will not find a size for it either
      }
      if (!width || width <= DERIVATIVE_MIN_SOURCE_WIDTH) continue;
      const rel = path.relative(PUBLIC, file);
      for (const w of DERIVATIVE_WIDTHS) {
        const out = path.join(OUT, String(w), rel);
        if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs) {
          skipped++;
          continue;
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const img = sharp(file).rotate().resize({ width: w, withoutEnlargement: true });
        const ext = path.extname(file).toLowerCase();
        if (ext === '.png') await img.png({ compressionLevel: 9, palette: true }).toFile(out);
        else if (ext === '.webp') await img.webp({ quality: 78 }).toFile(out);
        else await img.jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(out);
        made++;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`derivatives: ${made} written, ${skipped} up to date (${files.length} images scanned, ${Date.now() - started} ms)`);
}

main().catch((e) => {
  // Never fail the build over derivatives: pages fall back to the originals.
  console.warn('derivatives: skipped,', e instanceof Error ? e.message : e);
});
