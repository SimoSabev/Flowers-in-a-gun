"""STEP 3 — Parse downloaded HTML into structured posts + a state-of-archive report.

Written for WordPress (the likely platform) but every field has fallbacks;
the report says which platform was actually detected — verify it.

Output:
  data/posts/<name>.json      one per article/page: title, date, author, categories,
                              tags, body_html, images, embeds, original URL/path
  data/posts_index.csv        overview for review (sort/filter in Excel)
  data/missing_images.txt     images referenced in posts but not downloaded
                              -> feed to: python 02_download.py --extra data/missing_images.txt
  data/report.md              archive health report (drives final price/timeline)

Usage: python 03_parse.py
"""
from __future__ import annotations

import collections
import csv
import json
import re
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from common import DATA, POSTS, is_own_domain, norm_url, safe_name, unwayback

BODY_SEL = [".entry-content", ".post-content", ".post-entry", ".entry", "article .content",
            ".single-content", ".post-body", "article", ".post", "#content"]
JUNK_SEL = ["script", "style", "noscript", ".sharedaddy", ".sd-sharing-enabled", ".jp-relatedposts",
            ".wpcnt", ".addtoany_share_save_container", ".share", ".social", ".post-navigation",
            ".nav-links", ".comments-area", "#comments", ".entry-meta", ".entry-footer", ".yarpp-related",
            "#wpcom-reblog", ".wp-block-buttons.share", "form"]
RESIZED = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w{3,4}$)")
EMBED_HOSTS = re.compile(r"(youtube|youtu\.be|vimeo|soundcloud|spotify|bandcamp|mixcloud|instagram|twitter|facebook|8tracks|deezer)", re.I)


def txt(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def meta(soup, *names) -> str:
    for n in names:
        el = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if el and el.get("content"):
            return el["content"].strip()
    return ""


def first(soup, selectors) -> object:
    for s in selectors:
        el = soup.select_one(s)
        if el:
            return el
    return None


def page_kind(soup, url_type: str) -> str:
    cls = " ".join(soup.body.get("class", [])) if soup.body else ""
    if "single-post" in cls or "single" in cls.split():
        return "article"
    if re.search(r"\bpage\b|page-template|page-id-", cls):
        return "page"
    if "home" in cls or "blog" in cls.split() or "archive" in cls:
        return "listing"
    return "article" if url_type == "article" else ("page" if url_type == "home" else "unknown")


def parse(html: str, row: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    base = unwayback(row["original"])
    kind = page_kind(soup, row["type"])

    title = (txt(first(soup, ["h1.entry-title", "h1.post-title", "h2.entry-title", "article h1", "h1"]))
             or meta(soup, "og:title") or txt(soup.title))
    title = re.sub(r"\s*[|–—-]\s*Flowers in a Gun.*$", "", title, flags=re.I).strip()

    date = meta(soup, "article:published_time", "date", "DC.date.issued")
    if not date:
        t = soup.select_one("time.entry-date[datetime], time.published[datetime], time[datetime], abbr.published[title]")
        date = (t.get("datetime") or t.get("title") or "") if t else ""
    if not date:
        m = re.search(r"/(\d{4})/(\d{2})(?:/(\d{2}))?/", urlsplit(base).path)
        if m:
            date = f"{m.group(1)}-{m.group(2)}-{m.group(3) or '01'}"

    author = (meta(soup, "author", "article:author")
              or txt(first(soup, ["a[rel~=author]", ".author.vcard .fn", ".author a", ".byline a", ".entry-author", ".post-author"])))

    cats = sorted({txt(a) for a in soup.select("a[rel~=category]")} - {""})
    tags = sorted({txt(a) for a in soup.select("a[rel~=tag]") if "category" not in a.get("rel", [])} - {""})

    body = first(soup, BODY_SEL)
    images, embeds = [], []
    body_html = ""
    if body:
        for j in JUNK_SEL:
            for el in body.select(j):
                el.decompose()
        for img in body.find_all("img"):
            src = img.get("data-orig-file") or img.get("data-lazy-src") or img.get("data-src") or img.get("src") or ""
            if not src or src.startswith("data:"):
                continue
            full = unwayback(urljoin(base, unwayback(src)))
            img["src"] = full
            for a in ("srcset", "data-srcset", "sizes"):
                img.attrs.pop(a, None)
            images.append(full)
        for a in body.find_all("a", href=True):
            a["href"] = unwayback(a["href"])
        for fr in body.find_all(["iframe", "embed", "object"]):
            src = unwayback(fr.get("src") or fr.get("data") or "")
            if src:
                embeds.append(src)
        for a in body.find_all("a", href=True):
            if EMBED_HOSTS.search(a["href"]) and not txt(a):
                embeds.append(a["href"])
        body_html = body.decode_contents().strip()

    words = len(BeautifulSoup(body_html, "html.parser").get_text(" ").split()) if body_html else 0
    return {
        "original_url": base,
        "path": urlsplit(base).path or "/",
        "key": row["key"],
        "kind": kind,
        "title": title,
        "date": date,
        "author": author,
        "categories": cats,
        "tags": tags,
        "body_html": body_html,
        "word_count": words,
        "images": list(dict.fromkeys(images)),
        "embeds": list(dict.fromkeys(embeds)),
        "snapshot_ts": row["ts"],
        "generator": meta(soup, "generator"),
    }


def main() -> None:
    with open(DATA / "manifest.csv", encoding="utf-8") as f:
        man = list(csv.DictReader(f))
    ok_assets = {r["key"] for r in man if r["status"] == "ok" and r["type"] == "image"}
    pages = [r for r in man if r["status"] == "ok" and r["file"].endswith(".html")]

    posts, missing = [], set()
    generators = collections.Counter()
    quarantined = []
    for r in pages:
        fp = DATA / r["file"].replace("\\", "/")
        if not fp.exists():  # deleted by antivirus (injected malware in that snapshot)
            quarantined.append(r["key"])
            continue
        html = fp.read_text("utf-8", errors="ignore")
        p = parse(html, r)
        generators[p["generator"] or "(none)"] += 1
        if p["kind"] == "listing":
            continue
        posts.append(p)
        for img in p["images"]:
            if not is_own_domain(img) or norm_url(img) in ok_assets:
                continue
            # WordPress resized variant (photo-300x200.jpg) missing but full-size original archived?
            orig = RESIZED.sub("", img)
            if norm_url(orig) in ok_assets:
                p["body_html"] = p["body_html"].replace(img, orig)
                p["images"] = [orig if i == img else i for i in p["images"]]
                continue
            missing.add(img)
        (POSTS / safe_name(p["key"], ".json")).write_text(json.dumps(p, ensure_ascii=False, indent=2), "utf-8")

    cols = ["path", "kind", "title", "date", "author", "categories", "word_count", "n_images",
            "n_images_missing", "n_embeds", "problems", "snapshot_ts"]
    stats = collections.Counter()
    with open(DATA / "posts_index.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for p in sorted(posts, key=lambda x: x["date"] or "9999"):
            miss = [i for i in p["images"] if i in missing]
            probs = [n for n, bad in [("no_title", not p["title"]), ("no_date", not p["date"]),
                                      ("no_author", not p["author"]), ("thin_body", p["word_count"] < 80),
                                      ("images_missing", bool(miss))] if bad]
            for pr in probs:
                stats[pr] += 1
            if not probs:
                stats["clean"] += 1
            w.writerow({"path": p["path"], "kind": p["kind"], "title": p["title"], "date": p["date"][:10],
                        "author": p["author"], "categories": "; ".join(p["categories"]),
                        "word_count": p["word_count"], "n_images": len(p["images"]),
                        "n_images_missing": len(miss), "n_embeds": len(p["embeds"]),
                        "problems": ", ".join(probs), "snapshot_ts": p["snapshot_ts"]})

    (DATA / "missing_images.txt").write_text("\n".join(sorted(missing)), "utf-8")

    failed = [r for r in man if not r["status"].startswith("ok")]
    arts = [p for p in posts if p["kind"] == "article"]
    authors = collections.Counter(p["author"] or "(unknown)" for p in arts)
    embed_hosts = collections.Counter(
        (urlsplit(e).hostname or "?").replace("www.", "") for p in posts for e in p["embeds"])
    years = collections.Counter((p["date"] or "????")[:4] for p in arts)
    rep = [
        "# flowersinagun.com — archive health report", "",
        f"- Platform (meta generator): {', '.join(f'{g} ×{n}' for g, n in generators.most_common(3))}",
        f"- Pages parsed: {len(posts)} (articles: {len(arts)}, pages: {sum(p['kind']=='page' for p in posts)}, unknown: {sum(p['kind']=='unknown' for p in posts)})",
        f"- Clean posts (no problems): {stats['clean']}",
        f"- Problems: " + ", ".join(f"{k}: {v}" for k, v in stats.items() if k != "clean"),
        f"- Images downloaded: {len(ok_assets)}; referenced but missing: {len(missing)}",
        f"- Download failures (all snapshots bad): {len(failed)}",
        "", "## Articles per year", *[f"- {y}: {n}" for y, n in sorted(years.items())],
        "", "## Authors", *[f"- {a}: {n}" for a, n in authors.most_common()],
        "", "## Embeds (third-party players — check they still work)",
        *[f"- {h}: {n}" for h, n in embed_hosts.most_common()],
        "", "## Failed downloads", *[f"- {r['key']} — {r['status']}" for r in failed[:200]],
    ]
    (DATA / "report.md").write_text("\n".join(rep), "utf-8")
    print("\n".join(rep[:12]))
    print("\n-> data/posts/, data/posts_index.csv, data/report.md, data/missing_images.txt")


if __name__ == "__main__":
    main()
