"""STEP 4 (Vercel) — data/posts/*.json -> Keystatic content for a Next.js site, 1:1 URLs.

Output: build/site/  (copy its contents into the root of the Next.js repo)
  content/posts/<slug>.mdoc        frontmatter + Markdoc body (URL = /<slug>/)
  content/pages/<slug>.mdoc        about, band-of-the-week-hall-of-fame, ...
  content/authors/<slug>.yaml      slug = original /author/<slug>/ (incl. "admin")
  content/categories/<slug>.yaml   slug = original /category/<slug>/
  content/tags/<slug>.yaml         slug = original /tag/<slug>/
  public/wp-content/uploads/...    images on their ORIGINAL paths (old image links keep working)
  keystatic.config.ts              schema matching the files above
  redirects.mjs                    import into next.config.mjs -> redirects()
  redirects.csv                    same list, for review
  unresolved_images.csv            referenced images we don't have
  export_notes.txt                 counts + wiring steps

Usage: python 04_export_keystatic.py
"""
from __future__ import annotations

import collections
import csv
import importlib
import json
import re
import shutil
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup, NavigableString, Tag

from common import DATA, DOMAIN, LEGACY_DOMAINS, POSTS, ROOT, ImageIndex, data_path, is_own_domain, norm_url

wxr = importlib.import_module("04_export_wxr")        # reuse upload_rel / slugify / wp_date
upload_rel, slugify, wp_date = wxr.upload_rel, wxr.slugify, wxr.wp_date

SITE = ROOT / "build" / "site"
UPLOADS = SITE / "public" / "wp-content" / "uploads"
RESIZED = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w{3,4}$)")
BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "hr", "pre", "table",
         "figure", "center", "section", "article", "dl", "x-embed", "audio", "video"}
DROP = {"script", "style", "noscript", "form", "input", "button", "select", "textarea", "source", "track"}
WIN_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


# ---------------------------------------------------------------- small helpers
def q(s: str) -> str:
    """YAML double-quoted scalar (JSON strings are valid YAML)."""
    return json.dumps(s or "", ensure_ascii=False)


def file_slug(s: str) -> str:
    s = WIN_BAD.sub("-", unquote(s).strip().lower()).strip(". ")
    return s or "untitled"


def attr(s: str) -> str:
    return '"' + (s or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


def esc_text(s: str) -> str:
    s = s.replace("\\", "\\\\")
    s = re.sub(r"([*_`\[\]])", r"\\\1", s)
    return s.replace("{%", "{ %")


def wrap(mark: str, inner: str) -> str:
    if "\\\n" in inner or "\n\n" in inner:   # Markdoc: no line breaks/blocks inside **/*
        def seg(m: re.Match) -> str:
            t = m.group(0)
            if t.startswith("{%"):
                return t
            brk = t.endswith("\\") and not t.endswith("\\\\")   # our hard break marker
            return wrap(mark, t[:-1] if brk else t) + ("\\" if brk else "")
        return re.sub(r"[^\n]+", seg, inner)
    if "![" in inner:                       # no images inside emphasis either
        return inner
    m = re.match(r"^(\s*)(.*?)(\s*)$", inner, re.S)
    lead, core, trail = m.groups()
    return f"{lead}{mark}{core}{mark}{trail}" if core.strip() else inner


# ---------------------------------------------------------------- embeds
def embed_of(src: str) -> tuple[str, str]:
    src = src.strip()
    if src.startswith("//"):
        src = "https:" + src
    s = urlsplit(src)
    host = (s.hostname or "").lower()
    if "youtube" in host or "youtu.be" in host:
        vid = ""
        m = re.search(r"/(?:embed|v)/([\w-]{6,})", s.path)
        if m:
            vid = m.group(1)
        elif "youtu.be" in host:
            vid = s.path.strip("/")
        else:
            vid = (parse_qs(s.query).get("v") or [""])[0]
        return ("youtube", f"https://www.youtube.com/embed/{vid}") if vid else ("other", src)
    if "vimeo" in host:
        m = re.search(r"(\d{5,})", s.path)
        return ("vimeo", f"https://player.vimeo.com/video/{m.group(1)}") if m else ("other", src)
    for key in ("soundcloud", "bandcamp", "spotify", "mixcloud", "reverbnation", "facebook", "instagram"):
        if key in host:
            return key, src.replace("http://", "https://", 1)
    return "other", src


# ---------------------------------------------------------------- HTML -> Markdoc
class Converter:
    def __init__(self, fix_url, fix_img):
        self.fix_url, self.fix_img = fix_url, fix_img

    def convert(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        for t in soup.find_all(DROP):
            t.decompose()
        for fr in soup.find_all(["iframe", "embed", "object"]):
            src = fr.get("src") or fr.get("data") or ""
            if not src:
                fr.decompose()
                continue
            prov, url = embed_of(src)
            new = soup.new_tag("x-embed", provider=prov, src=url)
            fr.replace_with(new)
        for av in soup.find_all(["audio", "video"]):
            src = av.get("src") or (av.find("source") or {}).get("src", "") if av.find("source") else av.get("src", "")
            if src:
                av.replace_with(soup.new_tag("x-embed", provider=av.name, src=self.fix_img(src)))
            else:
                av.decompose()
        for bq in soup.select("blockquote.instagram-media"):
            a = bq.find("a", href=True)
            if a:
                bq.replace_with(soup.new_tag("x-embed", provider="instagram", src=a["href"].split("?")[0]))
        out = "\n\n".join(b for b in self.blocks(soup) if b.strip())
        return re.sub(r"\n{3,}", "\n\n", out).strip() + "\n"

    # block level ------------------------------------------------------------
    def blocks(self, node) -> list[str]:
        out, buf = [], []

        def flush():
            if buf:
                out.extend(self.paragraph("".join(buf)))
                buf.clear()

        for ch in node.children:
            if isinstance(ch, Tag) and ch.name in BLOCK:
                flush()
                out.extend(self.block(ch))
            else:
                buf.append(self.inline(ch))
        flush()
        return out

    def paragraph(self, text: str) -> list[str]:
        res = []
        for part in re.split(r"\n{2,}", text):
            lines = [re.sub(r"[ \t]+", " ", l).strip() for l in part.split("\n")]
            lines = [l for l in lines if l and l != "\\"]
            if not lines:
                continue
            fixed = []
            for l in lines:
                if not l.startswith("{%") and re.match(r"^(#|>|[-+=]\s|\d+\.\s)", l):
                    l = "\\" + l
                fixed.append(l)
            res.append("\n".join(fixed))
        return res

    def block(self, el: Tag) -> list[str]:
        n = el.name
        cls = el.get("class", [])
        if n == "x-embed":
            return [f'{{% embed provider={attr(el["provider"])} src={attr(el["src"])} /%}}']
        if n in ("h1", "h2", "h3", "h4", "h5", "h6"):
            t = self.inline_text(el)
            return [("#" * max(2, int(n[1]))) + " " + t] if t else []
        if n == "hr":
            return ["---"]
        if n == "pre":
            return ["```\n" + el.get_text().strip("\n") + "\n```"]
        if n in ("ul", "ol"):
            items = []
            for i, li in enumerate(el.find_all("li", recursive=False), 1):
                marker = f"{i}. " if n == "ol" else "- "
                body = "\n\n".join(self.blocks(li)) or " "
                pad = " " * len(marker)
                items.append(marker + body.replace("\n", "\n" + pad))
            return ["\n".join(items)] if items else []
        if n == "blockquote":
            inner = "\n\n".join(self.blocks(el))
            return ["\n".join("> " + l if l else ">" for l in inner.split("\n"))] if inner.strip() else []
        if n == "table":
            rows = [[self.inline_text(c).replace("|", "\\|") for c in tr.find_all(["td", "th"])] for tr in el.find_all("tr")]
            rows = [r for r in rows if any(r)]
            if not rows:
                return []
            w = max(len(r) for r in rows)
            rows = [r + [""] * (w - len(r)) for r in rows]
            lines = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * w]
            lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
            return ["\n".join(lines)]
        if "wp-caption-text" in cls or n == "figcaption":
            t = self.inline_text(el)
            return [wrap("*", t)] if t else []
        return self.blocks(el)                      # p, div, figure, center, section ...

    # inline level -----------------------------------------------------------
    def inline_text(self, el) -> str:
        return re.sub(r"\s+", " ", "".join(self.inline(c) for c in el.children)).strip()

    def inline(self, node) -> str:
        if isinstance(node, NavigableString):
            if type(node).__name__ in ("Comment", "Doctype", "Declaration", "ProcessingInstruction", "CData"):
                return ""
            return esc_text(re.sub(r"\s+", " ", str(node).replace("\xa0", " ")))
        if not isinstance(node, Tag):
            return ""
        n = node.name
        if n in BLOCK:                                # block inside inline (bad HTML): keep as own block
            return "\n\n" + "\n\n".join(self.block(node)) + "\n\n"
        if n == "br":
            return "\\\n"
        if n == "img":
            if "wp-smiley" in node.get("class", []):
                return esc_text(node.get("alt", ""))
            src = node.get("src", "")
            if not src:
                return ""
            alt = esc_text(re.sub(r"\s+", " ", node.get("alt") or node.get("title") or "")).strip()
            return f"![{alt}]({self.fix_img(src)})"
        kids = "".join(self.inline(c) for c in node.children)
        if n in ("strong", "b"):
            return wrap("**", kids)
        if n in ("em", "i"):
            return wrap("*", kids)
        if n in ("del", "s", "strike"):
            return wrap("~~", kids)
        if n == "code":
            return "`" + node.get_text().replace("`", "") + "`"
        if n == "a":
            href = node.get("href", "").strip()
            if not href or href.startswith(("javascript:", "#")) or not kids.strip():
                return kids
            href = self.fix_url(href).replace(" ", "%20").replace(")", "%29")
            if "![" in kids:
                # Markdoc can't nest images in links. Thumbnail -> full-size links are dropped
                # (the site can open images in a lightbox); links to real pages are kept after it.
                if href.startswith("/wp-content/uploads/") or re.search(r"\.(jpe?g|png|gif|webp)$", href, re.I):
                    return kids
                label = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", kids).strip() or href
                return f"{kids}\\\n[{label}]({href})"
            return f"[{kids.strip()}]({href})"
        return kids                                   # span, font, u, sup, time, wbr, ...


# ---------------------------------------------------------------- main
def main() -> None:
    with open(DATA / "manifest.csv", encoding="utf-8") as f:
        man = list(csv.DictReader(f))
    with open(DATA / "inventory.csv", encoding="utf-8") as f:
        inv = list(csv.DictReader(f))

    posts = []
    for fp in sorted(POSTS.glob("*.json")):
        p = json.loads(fp.read_text("utf-8"))
        if p["key"].split("/")[0] == DOMAIN and p["kind"] in ("article", "page", "unknown") and p["slug"]:
            posts.append(p)

    # images -> public/wp-content/uploads/<original path>
    have: dict[str, str] = {}
    copied = 0
    for r in man:
        if r["type"] != "image" or r["status"] != "ok":
            continue
        src = data_path(r["file"])
        if not src.exists():
            continue
        rel = upload_rel(r["original"])
        dst = UPLOADS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)
            copied += 1
        have[norm_url(r["original"])] = rel

    img_index = ImageIndex(man)
    resolved: collections.Counter = collections.Counter()
    unresolved: set[tuple[str, str]] = set()
    current = {"path": ""}

    def fix_img(url: str) -> str:
        url = wxr_unwayback(url)
        if not is_own_domain(url):
            return url
        found, how = img_index.resolve(url)
        if found:
            resolved[how] += 1
            return "/wp-content/uploads/" + quote(upload_rel(found["original"]))
        unresolved.add((current["path"], url))
        return "/wp-content/uploads/" + quote(upload_rel(url))

    def fix_url(url: str) -> str:
        url = wxr_unwayback(url)
        if not is_own_domain(url):
            return url
        s = urlsplit(url)
        if re.search(r"\.(jpe?g|png|gif|webp|bmp|mp4|mp3|pdf)$", s.path, re.I) or "/wp-content/uploads/" in s.path \
                or (s.hostname or "").endswith("files.wordpress.com"):
            return fix_img(url)
        return (s.path or "/") + (f"?{s.query}" if s.query else "") + (f"#{s.fragment}" if s.fragment else "")

    conv = Converter(fix_url, fix_img)

    authors: dict[str, str] = {}
    cats: dict[str, str] = {}
    tags: dict[str, str] = {}
    written = collections.Counter()
    for sub in ("posts", "pages", "authors", "categories", "tags"):
        (SITE / "content" / sub).mkdir(parents=True, exist_ok=True)

    for p in posts:
        current["path"] = p["path"]
        slug = file_slug(p["slug"])
        is_page = p["kind"] == "page"
        a_slug = file_slug(p["author_slug"] or slugify(p["author"])) if p["author"] else ""
        if a_slug:
            authors.setdefault(a_slug, p["author"])
        c_slugs = []
        for name, s in p["terms"]["category"].items():
            s = file_slug(s or slugify(name))
            cats.setdefault(s, name)
            c_slugs.append(s)
        t_slugs = []
        for name, s in p["terms"]["post_tag"].items():
            s = file_slug(s or slugify(name))
            tags.setdefault(s, name)
            t_slugs.append(s)
        d = wp_date(p["date"], p["snapshot_ts"])
        fm = [f"title: {q(p['title'])}"]
        if not is_page:
            fm += [f"date: {d.strftime('%Y-%m-%d')}", f"author: {q(a_slug)}" if a_slug else "author: null"]
            fm.append("categories:" + ("".join(f"\n  - {q(c)}" for c in c_slugs) if c_slugs else " []"))
            fm.append("tags:" + ("".join(f"\n  - {q(t)}" for t in t_slugs) if t_slugs else " []"))
        if p.get("featured_image"):
            fm.append(f"featuredImage: {q(fix_img(p['featured_image']))}")
        if p["wp_id"]:
            fm.append(f"wpId: {p['wp_id']}")
        fm.append(f"originalUrl: {q(p['original_url'])}")
        if p.get("comments") and not is_page:
            fm.append("comments:")
            for c in p["comments"]:
                text = conv.convert(c["content_html"]).strip()
                fm += [f"  - author: {q(c['author'])}", f"    date: {q(c['date'][:10])}", f"    text: {q(text)}"]
        body = conv.convert(p["body_html"])
        out = SITE / "content" / ("pages" if is_page else "posts") / f"{slug}.mdoc"
        out.write_text("---\n" + "\n".join(fm) + "\n---\n" + body, "utf-8")
        written["pages" if is_page else "posts"] += 1

    for folder, items in (("authors", authors), ("categories", cats), ("tags", tags)):
        for s, name in items.items():
            (SITE / "content" / folder / f"{s}.yaml").write_text(f"name: {q(name)}\n", "utf-8")

    # ---- redirects (Next.js format). Host (www/apex) + https are set in Vercel -> Domains.
    redirects: list[dict] = []
    for p in posts:
        if p["wp_id"]:
            redirects.append({"source": "/", "has": [{"type": "query", "key": "p", "value": str(p["wp_id"])}],
                              "destination": f"/{quote(file_slug(p['slug']))}/", "permanent": True,
                              "_why": "?p=ID shortlink"})
    by_slug = {unquote(p["slug"]).lower(): p for p in posts}
    for r in inv:
        key = r["key"]
        if key.split("/")[0] != DOMAIN or r["type"] != "other_html" or "/" not in key:
            continue
        first = unquote(key.split("/")[1]).lower()
        if first in by_slug and len(key.split("/")) > 2:
            redirects.append({"source": f"/{quote(file_slug(first))}/:rest+",
                              "destination": f"/{quote(file_slug(first))}/", "permanent": True,
                              "_why": "junk suffix on post URL"})
    redirects += [
        {"source": "/:slug/feed", "destination": "/:slug/", "permanent": True, "_why": "old WP comment feeds"},
        {"source": "/:slug/amp", "destination": "/:slug/", "permanent": True, "_why": "old AMP URLs"},
    ]
    uniq = {json.dumps(r, sort_keys=True): r for r in redirects}
    redirects = list(uniq.values())

    js = ["// Generated by 04_export_keystatic.py — permanent (308) redirects for next.config.mjs",
          "// www/apex + https: configure in Vercel -> Project -> Domains, not here.",
          "export default ["]
    for r in redirects:
        clean = {k: v for k, v in r.items() if not k.startswith("_")}
        js.append(f"  {json.dumps(clean, ensure_ascii=False)},  // {r['_why']}")
    js.append("];")
    (SITE / "redirects.mjs").write_text("\n".join(js) + "\n", "utf-8")
    with open(SITE / "redirects.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["source", "query", "destination", "reason"])
        for r in redirects:
            qv = "&".join(f"{h['key']}={h['value']}" for h in r.get("has", []))
            w.writerow([r["source"], qv, r["destination"], r["_why"]])

    with open(SITE / "unresolved_images.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["post", "image_url", "expected_path"])
        for post, url in sorted(unresolved):
            w.writerow([post, url, "public/wp-content/uploads/" + upload_rel(url)])

    # ---- list for Martina: which photos to look for, per post, by original file name
    by_post: dict[str, set[str]] = collections.defaultdict(set)
    for post, url in unresolved:
        by_post[post].add(RESIZED.sub("", unquote(urlsplit(url).path.rsplit("/", 1)[-1])))
    meta = {p["path"]: p for p in posts}
    with open(SITE / "missing_photos_for_martina.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["date", "title", "url", "missing_count", "file_names"])
        for post in sorted(by_post, key=lambda x: meta.get(x, {}).get("date", "")):
            m = meta.get(post, {})
            w.writerow([m.get("date", "")[:10], m.get("title", ""), "https://www.flowersinagun.com" + post,
                        len(by_post[post]), " ".join(sorted(by_post[post]))])

    (SITE / "keystatic.config.ts").write_text(KEYSTATIC_CONFIG, "utf-8")
    notes = [
        f"posts: {written['posts']}, pages: {written['pages']}, authors: {len(authors)}, "
        f"categories: {len(cats)}, tags: {len(tags)}",
        f"images: {len(have)} available ({copied} newly copied); references resolved: "
        + ", ".join(f"{k}: {v}" for k, v in resolved.most_common()) + f"; unresolved: {len(unresolved)}",
        f"posts with missing photos: {len(by_post)} -> missing_photos_for_martina.csv",
        f"redirects: {len(redirects)}",
        "",
        "Wiring (Next.js App Router):",
        "  npm i @keystatic/core @keystatic/next @markdoc/markdoc",
        "  next.config.mjs:  import redirects from './redirects.mjs';",
        "                    export default { trailingSlash: true, async redirects() { return redirects; } }",
        "  routes: app/[slug]/page.tsx        -> posts, then pages (same URL space, like WordPress)",
        "          app/category/[slug]/, app/tag/[slug]/, app/author/[slug]/ (+ /page/[n]/ if you paginate)",
        "  render: Markdoc.transform(await entry.content(), { tags: { embed: {...} } }) -> <Embed/> component",
        "  images: plain <img> (next/image optimisation quota is small on Hobby); files stay in public/",
        "  verify: python 05_verify.py --base https://<preview>.vercel.app --no-variants",
    ]
    (SITE / "export_notes.txt").write_text("\n".join(notes), "utf-8")
    print("\n".join(notes))


def wxr_unwayback(u: str) -> str:
    from common import unwayback
    return unwayback(u)


KEYSTATIC_CONFIG = r"""import { config, collection, fields } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';

// Local editing in dev; GitHub mode in production (Keystatic GitHub App, see keystatic.com/docs/github-mode)
const storage =
  process.env.NODE_ENV === 'development'
    ? ({ kind: 'local' } as const)
    : ({ kind: 'github', repo: 'OWNER/flowersinagun' } as const);

const content = fields.markdoc({
  label: 'Content',
  options: { image: { directory: 'public/images/posts', publicPath: '/images/posts/' } },
  components: {
    embed: block({
      label: 'Embed (YouTube, SoundCloud, Bandcamp...)',
      schema: {
        provider: fields.select({
          label: 'Provider',
          defaultValue: 'youtube',
          options: ['youtube', 'vimeo', 'soundcloud', 'bandcamp', 'spotify', 'mixcloud', 'reverbnation',
                    'facebook', 'instagram', 'audio', 'video', 'other'].map((v) => ({ label: v, value: v })),
        }),
        src: fields.text({ label: 'Embed URL' }),
      },
    }),
  },
});

export default config({
  storage,
  ui: { brand: { name: 'Flowers in a Gun' } },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        date: fields.date({ label: 'Date', defaultValue: { kind: 'today' } }),
        author: fields.relationship({ label: 'Author', collection: 'authors' }),
        categories: fields.array(fields.relationship({ label: 'Category', collection: 'categories' }), {
          label: 'Categories', itemLabel: (p) => p.value ?? '',
        }),
        tags: fields.array(fields.relationship({ label: 'Tag', collection: 'tags' }), {
          label: 'Tags', itemLabel: (p) => p.value ?? '',
        }),
        featuredImage: fields.text({ label: 'Featured image path' }),
        content,
        // --- archive metadata (kept for redirects / provenance) ---
        wpId: fields.integer({ label: 'Original WordPress ID' }),
        originalUrl: fields.text({ label: 'Original URL' }),
        comments: fields.array(
          fields.object({
            author: fields.text({ label: 'Author' }),
            date: fields.text({ label: 'Date' }),
            text: fields.text({ label: 'Text', multiline: true }),
          }),
          { label: 'Archived comments', itemLabel: (p) => p.fields.author.value },
        ),
      },
    }),
    pages: collection({
      label: 'Pages',
      slugField: 'title',
      path: 'content/pages/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        featuredImage: fields.text({ label: 'Featured image path' }),
        content,
        wpId: fields.integer({ label: 'Original WordPress ID' }),
        originalUrl: fields.text({ label: 'Original URL' }),
      },
    }),
    authors: collection({
      label: 'Authors', slugField: 'name', path: 'content/authors/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
    categories: collection({
      label: 'Categories', slugField: 'name', path: 'content/categories/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
    tags: collection({
      label: 'Tags', slugField: 'name', path: 'content/tags/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
  },
});
"""

if __name__ == "__main__":
    main()
