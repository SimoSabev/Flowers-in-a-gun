"""STEP 3 — Parse downloaded HTML into structured posts + a state-of-archive report.

Platform is confirmed WordPress (3.6 -> 4.9). Theme markup varies across the years, so the
parser first removes sidebars/widgets (an old Twitter widget also uses .entry-content and
used to be picked up as the post body), then looks for the body inside <article>.

Output:
  data/posts/<name>.json      one per article/page: wp_id, title, date, author(+slug),
                              categories/tags (+slugs), body_html, images, embeds, comments
  data/posts_index.csv        overview for review (sort/filter in Excel)
  data/missing_images.txt     own/legacy-host images referenced but not downloaded
                              -> python 02_download.py --extra data/missing_images.txt
  data/external_images.txt    images hot-linked from Facebook/Dropbox/etc. (likely dead)
  data/orphan_links.txt       internal post-like links found in pages but never archived
  data/report.md              archive health report

Usage: python 03_parse.py
"""
from __future__ import annotations

import collections
import csv
import json
import re
from datetime import datetime
from urllib.parse import unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

from common import DATA, DOMAIN, LEGACY_DOMAINS, POSTS, ImageIndex, data_path, is_own_domain, norm_url, safe_name, unwayback

CHROME_SEL = ["aside", "#secondary", "#sidebar", ".sidebar", ".widget-area", ".widget", "#colophon",
              "#branding", "#masthead", "header.site-header", "footer.site-footer", "nav", "#nav"]
BODY_SEL = ["article .entry-content", "div.entry-content", ".post-content", ".post-entry", ".single-content",
            ".post-body", "article .content", ".entry", "article", ".post", "#content"]
JUNK_SEL = ["script", "style", "noscript", ".sharedaddy", ".sd-sharing-enabled", ".jp-relatedposts",
            ".wpcnt", ".addtoany_share_save_container", ".addthis_toolbox", ".share", ".social",
            ".post-navigation", ".nav-links", ".comments-area", "#comments", ".entry-meta", ".entry-footer",
            ".yarpp-related", "#wpcom-reblog", ".wp-block-buttons.share", "form", ".fb-like",
            "a[href*='pinterest.com/pin/create']", "img[src*='assets.pinterest.com']",
            "a.twitter-share-button", "a[href*='twitter.com/share']", "iframe[src*='facebook.com/plugins']",
            ".simplesocialbuttons", ".simplesocialbutton", ".yop-poll-container", ".wp-polls", ".wp-polls-loading",
            "footer", ".footer_branding", ".widget_iframe"]
RESIZED = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w{3,4}$)")
EMBED_HOSTS = re.compile(r"(youtube|youtu\.be|vimeo|soundcloud|spotify|bandcamp|mixcloud|instagram|twitter|"
                         r"facebook|8tracks|deezer|reverbnation|myspace)", re.I)
NOT_EMBED = re.compile(r"twitter\.com/(share|intent)|facebook\.com/(plugins|sharer)|pinterest\.com", re.I)
NON_POST_PATH = re.compile(r"^/(wp-|category/|tag/|author/|page/|feed|comments|cgi-|\d{4}(/|$)|\?)|\.\w{2,4}$", re.I)


def txt(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def meta(soup, *names) -> str:
    for n in names:
        el = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if el and el.get("content"):
            return el["content"].strip()
    return ""


def first(root, selectors):
    for s in selectors:
        el = root.select_one(s)
        if el:
            return el
    return None


def slug_from(href: str, base: str) -> str:
    parts = [p for p in urlsplit(href).path.split("/") if p]
    return unquote(parts[-1]) if parts and base in parts else ""


def page_kind(soup, url_type: str) -> str:
    cls = " ".join(soup.body.get("class", [])) if soup.body else ""
    if "single-post" in cls or "single" in cls.split():
        return "article"
    if re.search(r"\bpage\b|page-template|page-id-", cls):
        return "page"
    if "home" in cls or "blog" in cls.split() or "archive" in cls:
        return "listing"
    return "article" if url_type == "article" else ("page" if url_type == "home" else "unknown")


def wp_id(soup) -> int | None:
    cls = " ".join(soup.body.get("class", [])) if soup.body else ""
    m = re.search(r"\b(?:postid|page-id)-(\d+)\b", cls)
    if not m:
        art = soup.find("article", id=re.compile(r"^post-\d+$"))
        m = re.search(r"(\d+)$", art["id"]) if art else None
    return int(m.group(1)) if m else None


def internal_paths(soup, base: str) -> set[str]:
    out = set()
    for a in soup.find_all("a", href=True):
        u = unwayback(urljoin(base, unwayback(a["href"])))
        if not is_own_domain(u):
            continue
        s = urlsplit(u)
        if s.query or not s.path or NON_POST_PATH.search(s.path):
            continue
        path = "/" + s.path.strip("/") + "/"
        if path != "//" and path.count("/") == 2:
            out.add(path)
    return out


COMMENT_DATE = re.compile(r"([A-Z][a-z]+ \d{1,2}, \d{4})(?:\s+at\s+(\d{1,2}:\d{2}\s*[ap]m))?", re.I)


def comment_date(text: str) -> str:
    """'March 31, 2014 at 3:44 pm' -> '2014-03-31T15:44' (as shown on the site, no time zone)."""
    m = COMMENT_DATE.search(text or "")
    if not m:
        return ""
    try:
        day = datetime.strptime(m.group(1), "%B %d, %Y").strftime("%Y-%m-%d")
        if not m.group(2):
            return day
        return day + datetime.strptime(m.group(2).replace(" ", "").lower(), "%I:%M%p").strftime("T%H:%M")
    except ValueError:
        return ""


def comment_text(el) -> str:
    """Plain text of a comment: paragraphs separated by a blank line, <br> as a newline, smileys as their alt."""
    el = BeautifulSoup(str(el), "html.parser")
    for img in el.select("img"):
        img.replace_with(img.get("alt", ""))
    for br in el.select("br"):
        br.replace_with("\n")
    blocks = el.select("p") or [el]
    paras = []
    for b in blocks:
        lines = [re.sub(r"[ \t\r\f\v]+", " ", ln).strip() for ln in b.get_text("").split("\n")]
        para = "\n".join(ln for ln in lines if ln)
        if para:
            paras.append(para)
    return "\n\n".join(paras)


def parse_comments(soup) -> list[dict]:
    """Archived comments in document order, with thread depth (1 = top level).

    Handles the blog's theme (author/date as plain text in .comment-author / .comment-meta, body in
    .comment-text) and the WordPress default markup (.fn, <time datetime>, .comment-content).
    """
    out = []
    for li in soup.select("ol.commentlist li.comment, ol.comment-list li.comment"):
        own = BeautifulSoup(str(li), "html.parser").select_one("li")
        for child in own.select("ul.children, ol.children"):
            child.decompose()
        depth = re.search(r"\bdepth-(\d+)\b", " ".join(li.get("class", [])))
        author = own.select_one(".comment-author .fn, .fn, cite") or own.select_one(".comment-author")
        t = own.select_one("time[datetime]")
        body = own.select_one(".comment-text") or own.select_one(".comment-content")
        if body is None:
            continue
        for j in body.select(".reply, .comment-meta, .comment-author, .comment-metadata"):
            j.decompose()
        c = {
            "author": txt(author),
            "date": t.get("datetime", "")[:16] if t else comment_date(txt(own.select_one(".comment-meta, .comment-metadata"))),
            "depth": int(depth.group(1)) if depth else 1,
            "text": comment_text(body),
            "content_html": body.decode_contents().strip(),
        }
        if c["text"] and c not in out:
            out.append(c)
    return out


def parse(html: str, row: dict) -> tuple[dict, set[str]]:
    soup = BeautifulSoup(html, "html.parser")
    base = unwayback(row["original"])
    kind = page_kind(soup, row["type"])
    links = internal_paths(soup, base)      # before chrome removal: sidebars list recent posts
    comments = parse_comments(soup)

    title = (txt(first(soup, ["h1.entry-title", "h1.post-title", "h2.entry-title", "article h1", "article h2"]))
             or meta(soup, "og:title") or txt(soup.title))
    title = re.sub(r"\s*[|–—-]\s*Flowers in a Gun.*$", "", title, flags=re.I).strip()

    date = meta(soup, "article:published_time", "date", "DC.date.issued")
    if not date:
        t = soup.select_one("article time[datetime], time.entry-date[datetime], time.published[datetime], "
                            "time[datetime], abbr.published[title]")
        date = (t.get("datetime") or t.get("title") or "") if t else ""
    if not date:
        m = re.search(r"/(\d{4})/(\d{2})(?:/(\d{2}))?/", urlsplit(base).path)
        if m:
            date = f"{m.group(1)}-{m.group(2)}-{m.group(3) or '01'}"

    a_author = soup.select_one("article a[rel~=author], a[rel~=author]")
    author = (txt(a_author) or meta(soup, "author", "article:author")
              or txt(first(soup, [".author.vcard .fn", ".author a", ".byline a", ".entry-author", ".post-author"])))
    author_slug = slug_from(a_author["href"], "author") if a_author else ""

    scope = soup.select_one("article") or soup
    cats, tags = {}, {}
    for a in scope.select("a[rel~=category]"):
        if txt(a):
            cats[txt(a)] = slug_from(a.get("href", ""), "category")
    for a in scope.select("a[rel~=tag]"):
        if txt(a) and "category" not in a.get("rel", []):
            tags[txt(a)] = slug_from(a.get("href", ""), "tag")

    featured = meta(soup, "og:image")
    featured = unwayback(featured) if featured and is_own_domain(unwayback(featured)) else ""

    for el in [e for s in CHROME_SEL for e in soup.select(s)]:
        if not el.decomposed and not el.find_parent("article"):
            el.decompose()
    body = first(soup, BODY_SEL)
    images, embeds = [], []
    body_html = ""
    if body:
        for j in JUNK_SEL:
            for el in body.select(j):
                el.decompose()
        for el in body.find_all(True):
            for attr in [a for a in el.attrs if a.lower().startswith("on")]:
                del el[attr]
        for img in body.find_all("img"):
            src = img.get("data-orig-file") or img.get("data-lazy-src") or img.get("data-src") or img.get("src") or ""
            if not src or src.startswith("data:"):
                continue
            full = unwayback(urljoin(base, unwayback(src)))
            img["src"] = full
            for a in ("srcset", "data-srcset", "sizes", "data-orig-file", "data-lazy-src", "data-src"):
                img.attrs.pop(a, None)
            images.append(full)
        for a in body.find_all("a", href=True):
            a["href"] = unwayback(urljoin(base, unwayback(a["href"])))
        for fr in body.find_all(["iframe", "embed", "object"]):
            src = unwayback(fr.get("src") or fr.get("data") or "")
            if src and not NOT_EMBED.search(src):
                embeds.append(src)
        for a in body.find_all("a", href=True):
            if EMBED_HOSTS.search(a["href"]) and not NOT_EMBED.search(a["href"]) and not txt(a) and not a.find("img"):
                embeds.append(a["href"])
        body_html = body.decode_contents().strip()

    words = len(BeautifulSoup(body_html, "html.parser").get_text(" ").split()) if body_html else 0
    path = urlsplit(base).path or "/"
    return {
        "original_url": base,
        "path": path,
        "slug": unquote(path.strip("/").split("/")[-1]) if path.strip("/") else "",
        "key": row["key"],
        "wp_id": wp_id(soup),
        "kind": kind,
        "title": title,
        "date": date,
        "author": author,
        "author_slug": author_slug,
        "categories": sorted(cats),
        "tags": sorted(tags),
        "terms": {"category": cats, "post_tag": tags},
        "featured_image": featured,
        "body_html": body_html,
        "word_count": words,
        "images": list(dict.fromkeys(images)),
        "embeds": list(dict.fromkeys(embeds)),
        "comments": comments,
        "snapshot_ts": row["ts"],
        "injected_snapshot": row.get("injected") == "yes",
        "generator": meta(soup, "generator"),
    }, links


def main() -> None:
    with open(DATA / "manifest.csv", encoding="utf-8") as f:
        man = list(csv.DictReader(f))
    ok_assets = {r["key"] for r in man if r["status"] == "ok" and r["type"] == "image"}
    img_index = ImageIndex(man)
    img_how: collections.Counter = collections.Counter()
    pages = [r for r in man if r["status"] == "ok" and r["file"].endswith(".html")]
    with open(DATA / "inventory.csv", encoding="utf-8") as f:   # everything Wayback has, any type
        known_paths = {unquote("/" + r["key"].split("/", 1)[1].split("?")[0].strip("/") + "/").lower()
                       for r in csv.DictReader(f) if "/" in r["key"]}

    for old in POSTS.glob("*.json"):   # stale output from earlier runs
        try:
            old.unlink()
        except OSError:
            pass

    posts, missing, external, quarantined, skipped = [], set(), collections.Counter(), [], []
    all_links: collections.Counter = collections.Counter()
    generators = collections.Counter()
    for r in pages:
        if r["key"].split("/")[0] != DOMAIN:        # cpanel./webmail./mail. — not blog content
            skipped.append(r["key"])
            continue
        fp = data_path(r["file"])
        if not fp.exists():                          # removed by antivirus -> re-fetch with 02
            quarantined.append(r["key"])
            continue
        p, links = parse(fp.read_text("utf-8", errors="ignore"), r)
        all_links.update(links)
        generators[p["generator"] or "(none)"] += 1
        if p["kind"] == "listing":
            continue
        posts.append(p)
        for img in p["images"]:
            if not is_own_domain(img):
                external[img] += 1
                continue
            found, how = img_index.resolve(img)   # exact / other host / original / other size
            img_how[how] += 1
            if not found:
                missing.add(img)
        (POSTS / safe_name(p["key"], ".json")).write_text(json.dumps(p, ensure_ascii=False, indent=2), "utf-8")

    orphans = sorted(l for l in all_links if unquote(l).lower() not in known_paths)

    cols = ["path", "wp_id", "kind", "title", "date", "author", "categories", "word_count", "n_images",
            "n_images_missing", "n_external_images", "n_embeds", "n_comments", "problems", "snapshot_ts"]
    stats = collections.Counter()
    with open(DATA / "posts_index.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for p in sorted(posts, key=lambda x: x["date"] or "9999"):
            miss = [i for i in p["images"] if i in missing]
            ext = [i for i in p["images"] if i in external]
            probs = [n for n, bad in [("no_title", not p["title"]), ("no_date", not p["date"] and p["kind"] != "page"),
                                      ("no_author", not p["author"] and p["kind"] != "page"),
                                      ("thin_body", p["word_count"] < 80 and not p["images"] and not p["embeds"]),
                                      ("images_missing", bool(miss)), ("external_images", bool(ext))] if bad]
            for pr in probs:
                stats[pr] += 1
            if not probs:
                stats["clean"] += 1
            w.writerow({"path": p["path"], "wp_id": p["wp_id"], "kind": p["kind"], "title": p["title"],
                        "date": p["date"][:10], "author": p["author"], "categories": "; ".join(p["categories"]),
                        "word_count": p["word_count"], "n_images": len(p["images"]), "n_images_missing": len(miss),
                        "n_external_images": len(ext), "n_embeds": len(p["embeds"]),
                        "n_comments": len(p["comments"]), "problems": ", ".join(probs),
                        "snapshot_ts": p["snapshot_ts"]})

    (DATA / "missing_images.txt").write_text("\n".join(sorted(missing)), "utf-8")
    (DATA / "external_images.txt").write_text("\n".join(sorted(external)), "utf-8")
    (DATA / "orphan_links.txt").write_text("\n".join(orphans), "utf-8")

    failed = [r for r in man if not r["status"].startswith("ok") and r["type"] != "image"]
    arts = [p for p in posts if p["kind"] == "article"]
    authors = collections.Counter(p["author"] or "(unknown)" for p in arts)
    embed_hosts = collections.Counter((urlsplit(e).hostname or "?").replace("www.", "") for p in posts for e in p["embeds"])
    ext_hosts = collections.Counter(re.sub(r"^(scontent|fbcdn)[^.]*\.", r"\1*.", urlsplit(i).hostname or "?")
                                    for i in external)
    own_imgs = {i for p in posts for i in p["images"] if is_own_domain(i)}
    legacy_imgs = {i for i in own_imgs if any(d in (urlsplit(i).hostname or "") for d in LEGACY_DOMAINS)}
    years = collections.Counter((p["date"] or "????")[:4] for p in arts)
    n_inj = sum(p["injected_snapshot"] for p in posts)
    n_comments = sum(len(p["comments"]) for p in posts)
    rep = [
        "# flowersinagun.com — archive health report", "",
        f"- Platform (meta generator): {', '.join(f'{g} ×{n}' for g, n in generators.most_common(3))}",
        f"- Pages parsed: {len(posts)} (articles: {len(arts)}, pages: {sum(p['kind']=='page' for p in posts)}, "
        f"unknown: {sum(p['kind']=='unknown' for p in posts)}); with original WP id: {sum(bool(p['wp_id']) for p in posts)}",
        f"- Clean posts (no problems): {stats['clean']}",
        "- Problems: " + ", ".join(f"{k}: {v}" for k, v in stats.items() if k != "clean"),
        f"- Own images referenced: {len(own_imgs)} (legacy flowersinthebarrelofagun hosts: {len(legacy_imgs)}); "
        f"downloaded: {len(ok_assets)}; still missing: {len(missing)}",
        f"- Image references resolved: " + ", ".join(f"{k}: {v}" for k, v in img_how.most_common()),
        f"- Hot-linked external images (probably dead, need originals from her): {len(external)}",
        f"- Comments recovered: {n_comments}",
        f"- Snapshots with injected code (site was hacked; scripts stripped): {n_inj}",
        f"- Quarantined by antivirus, re-fetch needed: {len(quarantined)}",
        f"- Internal links to posts that were never archived (possible lost articles): {len(orphans)} -> orphan_links.txt",
        f"- HTML download failures (all snapshots bad): {len(failed)}",
        "", "## Articles per year", *[f"- {y}: {n}" for y, n in sorted(years.items())],
        "", "## Authors", *[f"- {a}: {n}" for a, n in authors.most_common()],
        "", "## Embeds (third-party players — check they still work)", *[f"- {h}: {n}" for h, n in embed_hosts.most_common()],
        "", "## External image hosts", *[f"- {h}: {n}" for h, n in ext_hosts.most_common(10)],
        "", "## Quarantined (re-run: python 02_download.py --only html --prefer-before 20180101)",
        *[f"- {k}" for k in quarantined],
        "", "## Failed downloads", *[f"- {r['key']} — {r['status']}" for r in failed[:200]],
        "", "## Skipped (not blog content)", *[f"- {k}" for k in skipped],
    ]
    (DATA / "report.md").write_text("\n".join(rep), "utf-8")
    print("\n".join(rep[:16]))
    print("\n-> data/posts/, data/posts_index.csv, data/report.md, data/missing_images.txt, "
          "data/external_images.txt, data/orphan_links.txt")


if __name__ == "__main__":
    main()
