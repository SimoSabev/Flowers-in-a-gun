import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { imageSizeFromFile } from 'image-size/fromFile';

/**
 * Build-time image resolution. The archive lost ~800 image files (see unresolved_images.csv),
 * so every local image is checked on disk before it is rendered: missing files are dropped,
 * present ones get their intrinsic size so the browser can reserve space (no layout shift).
 */

export type LocalImage = { src: string; width: number; height: number };

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

const cache = new Map<string, Promise<LocalImage | null>>();

/** Intrinsic size of a local image, or null when the file is missing or unreadable. */
export function localImage(src: string): Promise<LocalImage | null> {
  let hit = cache.get(src);
  if (!hit) {
    hit = (async () => {
      const file = toFile(src);
      if (!file || !fs.existsSync(file)) return null;
      try {
        const { width, height } = await imageSizeFromFile(file);
        return width && height ? { src, width, height } : null;
      } catch {
        return null;
      }
    })();
    cache.set(src, hit);
  }
  return hit;
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
