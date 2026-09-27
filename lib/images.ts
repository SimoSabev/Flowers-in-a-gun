import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { imageSizeFromFile } from 'image-size/fromFile';

/**
 * Build-time image resolution. The archive lost ~800 image files (see unresolved_images.csv),
 * so every local image is checked on disk before it is rendered: missing files are dropped,
 * present ones get their intrinsic size so the browser can reserve space (no layout shift).
 */

export type LocalImage = {
  src: string;
  width: number;
  height: number;
  /** Resized copies (scripts/make-derivatives.ts) for oversized originals; absent otherwise. */
  srcSet?: string;
};

/** Must match scripts/make-derivatives.ts. */
const DERIVATIVE_WIDTHS = [640, 1280];
const DERIVATIVE_MIN_SOURCE_WIDTH = 1400;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const WP_SIZE_SUFFIX = /-(\d+)x(\d+)(\.[a-z0-9]+)$/i;

export function isLocalPath(src: string): boolean {
  return src.startsWith('/') && !src.startsWith('//');
}

/** Map a site path ("/wp-content/uploads/a%2Bb.jpg?x") to a file under public/, or null if it escapes it. */
function toFile(src: string): string | null {
  let p = src.split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw path; a malformed escape simply won't exist on disk
  }
  const file = path.join(PUBLIC_DIR, p);
  return file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

/**
 * Whether a site path ("/wp-content/uploads/…") is a real audio/video file under public/.
 * Checks the file's signature, not just its name: a failed Wayback download saved as .mp4 is an
 * HTML page, and must not become a broken player.
 */
export function publicMediaExists(src: string): boolean {
  const file = isLocalPath(src) ? toFile(src) : null;
  if (!file || !fs.existsSync(file)) return false;
  const head = Buffer.alloc(12);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const ascii = (from: number, to: number) => head.toString('latin1', from, to);
  return (
    ascii(4, 8) === 'ftyp' || // MP4, MOV, M4A
    head.readUInt32BE(0) === 0x1a45dfa3 || // WebM / Matroska
    ascii(0, 4) === 'OggS' ||
    ascii(0, 4) === 'RIFF' || // WAV
    ascii(0, 3) === 'ID3' ||
    (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) // MP3 frame
  );
}

const cache = new Map<string, Promise<LocalImage | null>>();

/** Intrinsic size of a local image, or null when the file is missing or unreadable. */
export function localImage(src: string): Promise<LocalImage | null> {
  let hit = cache.get(src);
  if (!hit) {
    hit = (async () => {
      const file = toFile(src);
      if (!file || !fs.existsSync(file)) return null;
      try {
        const size = await imageSizeFromFile(file);
        if (!size.width || !size.height) return null;
        // EXIF orientations 5-8 are displayed rotated by 90°: swap so the reserved box matches.
        const rotated = (size.orientation ?? 1) >= 5;
        const width = rotated ? size.height : size.width;
        const height = rotated ? size.width : size.height;
        return withDerivatives({ src, width, height }, file);
      } catch {
        return null;
      }
    })();
    cache.set(src, hit);
  }
  return hit;
}

function withDerivatives(img: LocalImage, file: string): LocalImage {
  if (img.width <= DERIVATIVE_MIN_SOURCE_WIDTH) return img;
  const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
  const urls = DERIVATIVE_WIDTHS.filter((w) => fs.existsSync(path.join(PUBLIC_DIR, '_img', String(w), rel))).map(
    (w) => [w, `/_img/${w}/${encodeURI(rel).replace(/\+/g, '%2B')}`] as const,
  );
  if (urls.length === 0) return img;
  return { ...img, src: urls[urls.length - 1][1], srcSet: urls.map(([w, u]) => `${u} ${w}w`).join(', ') };
}

const dirCache = new Map<string, string[]>();
function listDir(dir: string): string[] {
  let entries = dirCache.get(dir);
  if (!entries) {
    entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    dirCache.set(dir, entries);
  }
  return entries;
}

/**
 * All sizes WordPress generated for the same upload that survived in the archive
 * (`photo.jpg`, `photo-1024x682.jpg`, `photo-300x200.jpg`, ...), smallest first.
 */
export async function sizeVariants(src: string): Promise<LocalImage[]> {
  if (!isLocalPath(src)) return [];
  const clean = src.split(/[?#]/)[0];
  const slash = clean.lastIndexOf('/');
  const dirPath = clean.slice(0, slash + 1);
  const name = clean.slice(slash + 1);
  const m = name.match(WP_SIZE_SUFFIX);
  const ext = m ? m[3] : path.extname(name);
  const base = m ? name.slice(0, -m[0].length) : name.slice(0, -ext.length);
  const file = toFile(dirPath);
  if (!file) return [];

  let decodedBase = base;
  try {
    decodedBase = decodeURIComponent(base);
  } catch {}
  const escaped = decodedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(-\\d+x\\d+)?${ext.replace('.', '\\.')}$`, 'i');

  const found = await Promise.all(
    listDir(file)
      .filter((f) => pattern.test(f))
      .map((f) => localImage(dirPath + encodeURI(f).replace(/\+/g, '%2B'))),
  );
  return found.filter((x): x is LocalImage => x !== null).sort((a, b) => a.width - b.width);
}

/**
 * The best local rendition of `src` for a slot at least `minWidth` pixels wide: the smallest
 * surviving size that is wide enough, else the largest one. Null if nothing survived.
 */
export async function bestVariant(src: string, minWidth: number): Promise<LocalImage | null> {
  const variants = await sizeVariants(src);
  if (variants.length === 0) return localImage(src);
  return variants.find((v) => v.width >= minWidth) ?? variants[variants.length - 1];
}
