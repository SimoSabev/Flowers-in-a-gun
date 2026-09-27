/**
 * Route check (CLAUDE.md "Verify", step 2). Run after `next build` (it runs as `postbuild`).
 *
 * Gating (exit 1 on any failure):
 *   1. every `originalUrl` in content/posts and content/pages has a prerendered route at the same path;
 *   2. every destination in redirects.mjs is a prerendered route (no redirect into a 404).
 * Informational (printed, never fails the build):
 *   3. article/page URLs from the Wayback inventory (tools/verify/data/inventory.csv);
 *   4. archived listing URLs (category/tag/author/pagination/date archives).
 */
import fs from 'node:fs';
import path from 'node:path';
import redirects from '../redirects.mjs';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, '.next', 'prerender-manifest.json');
const INVENTORY = path.join(ROOT, 'tools', 'verify', 'data', 'inventory.csv');
const OWN_HOSTS = new Set(['flowersinagun.com', 'www.flowersinagun.com']);

function norm(p: string): string {
  let out = p;
  try {
    out = decodeURIComponent(p);
  } catch {}
  out = out.replace(/\/+$/, '');
  return out === '' ? '/' : out;
}

if (!fs.existsSync(MANIFEST)) {
  console.error('check-routes: .next/prerender-manifest.json not found. Run `npm run build` first.');
  process.exit(1);
}
const routes = new Set(Object.keys(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).routes as Record<string, unknown>).map(norm));

// Static redirects (exact source, no params/query) count as "handled" for the informational checks.
type Redirect = { source: string; destination: string; has?: unknown[] };
const redirectList = redirects as Redirect[];
const redirectSources = new Set(redirectList.filter((r) => !r.has && !r.source.includes(':')).map((r) => norm(r.source)));
const exists = (p: string) => routes.has(norm(p));

// 1. originalUrl -> route
const failures: string[] = [];
let checked = 0;
for (const dir of ['posts', 'pages']) {
  const full = path.join(ROOT, 'content', dir);
  for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.mdoc'))) {
    const src = fs.readFileSync(path.join(full, file), 'utf8');
    const fm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const url = fm.match(/^originalUrl:\s*"?([^"\n]+)"?\s*$/m)?.[1];
    if (!url) {
      failures.push(`content/${dir}/${file}: no originalUrl`);
      continue;
    }
    checked++;
    const p = new URL(url).pathname;
    if (!exists(p)) failures.push(`${p}  (content/${dir}/${file})`);
  }
}

// 2. redirect destinations
const badRedirects: string[] = [];
for (const r of redirectList) {
  if (r.destination.includes(':')) continue; // parameterised: covered by the route it maps to
  if (!exists(r.destination)) badRedirects.push(`${r.source}${r.has ? ' (?' + JSON.stringify(r.has) + ')' : ''} -> ${r.destination}`);
}

// 3 + 4. Wayback inventory (optional: only present in a full checkout)
const inventoryMissing: string[] = [];
const listingMissing: Record<string, string[]> = {};
let inventoryChecked = 0;
let listingChecked = 0;
if (fs.existsSync(INVENTORY)) {
  const lines = fs.readFileSync(INVENTORY, 'utf8').split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [key, type] = line.split(',');
    if (!key || !type) continue;
    const slash = key.indexOf('/');
    const host = slash === -1 ? key : key.slice(0, slash);
    if (!OWN_HOSTS.has(host)) continue;
    const p = slash === -1 ? '/' : key.slice(slash);
    if (/[?%<>]|cgi-sys/.test(p)) continue; // shortlinks, encoded junk, host error pages
    if (type === 'article_or_page' || type === 'home') {
      inventoryChecked++;
      if (!exists(p) && !redirectSources.has(norm(p))) inventoryMissing.push(p);
    } else if (type === 'listing') {
      listingChecked++;
      if (!exists(p) && !redirectSources.has(norm(p))) {
        const kind = p.match(/^\/(category|tag|author)\//)?.[1] ?? (/^\/page\//.test(p) ? 'home pagination' : /^\/\d{4}\//.test(p) ? 'date archive' : 'other');
        (listingMissing[kind] ??= []).push(p);
      }
    }
  }
}

// Report
const line = '-'.repeat(72);
console.log(`\n${line}\nRoute check: ${routes.size} prerendered routes\n${line}`);
console.log(`[gating] originalUrl paths checked: ${checked}, missing: ${failures.length}`);
failures.forEach((f) => console.log(`  MISSING ${f}`));
console.log(`[gating] redirect destinations checked: ${redirectList.length}, broken: ${badRedirects.length}`);
badRedirects.forEach((f) => console.log(`  BROKEN  ${f}`));
if (fs.existsSync(INVENTORY)) {
  console.log(`[info]   Wayback article/page URLs checked: ${inventoryChecked}, missing: ${inventoryMissing.length}`);
  inventoryMissing.forEach((f) => console.log(`  missing ${f}`));
  const listingMissingCount = Object.values(listingMissing).reduce((n, l) => n + l.length, 0);
  console.log(`[info]   Wayback listing URLs checked: ${listingChecked}, missing: ${listingMissingCount}`);
  for (const [kind, list] of Object.entries(listingMissing)) {
    console.log(`  ${kind}: ${list.length}${list.length ? ` (e.g. ${list.slice(0, 4).join(', ')})` : ''}`);
  }
} else {
  console.log('[info]   tools/verify/data/inventory.csv not found; Wayback cross-check skipped');
}
console.log(line);

if (failures.length || badRedirects.length) {
  console.error('Route check FAILED');
  process.exit(1);
}
console.log('Route check passed: zero missing original URLs.');
