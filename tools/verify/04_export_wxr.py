"""STEP 4 — Build a WordPress import (WXR) + uploads folder + 301 map from data/posts/*.json.

Decision (see HANDOFF.md step 4): WordPress. The original was WordPress 3.6 -> 4.9 with
/%postname%/ permalinks, so slugs, original post IDs (?p=123 keeps working), categories,
tags and author slugs can all be restored 1:1.

Output (build/):
  flowersinagun.wxr.xml        Tools -> Import -> WordPress (do NOT tick "download attachments")
  wp-content/uploads/...       recovered images on their ORIGINAL paths -> upload via SFTP first
  redirects.csv                every non-canonical URL we know of -> target (for review)
  htaccess-redirects.txt       paste ABOVE "# BEGIN WordPress" in .htaccess (Apache/LiteSpeed)
  unresolved_images.csv        images the posts reference but we don't have (ask Martina)
  import_notes.txt             counts + the exact steps

Usage:
  python 04_export_wxr.py                                   # canonical https://www.flowersinagun.com
  python 04_export_wxr.py --site-url https://flowersinagun.com
  python 04_export_wxr.py --admin-login martina             # login for the old "admin" author
"""
from __future__ import annotations

import argparse
import collections
import csv
import html
import json
import re
import shutil
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

from common import DATA, DOMAIN, LEGACY_DOMAINS, POSTS, ROOT, data_path, is_own_domain, norm_url

BUILD = ROOT / "build"
UPLOADS = BUILD / "wp-content" / "uploads"
RESIZED = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w{3,4}$)")
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
OWN_URL = re.compile(r"https?://(?:www\.)?(?:%s)(?::\d+)?(?=[/\"'\s?#]|$)"
                     % "|".join(re.escape(d) for d in [DOMAIN, *LEGACY_DOMAINS]), re.I)


# ---------- helpers ----------------------------------------------------------------------------
def cdata(s: str) -> str:
    return "<![CDATA[" + CTRL.sub("", s or "").replace("]]>", "]]]]><![CDATA[>") + "]]>"


def esc(s: str) -> str:
    return html.escape(CTRL.sub("", s or ""), quote=False)


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", unquote(s).lower(), flags=re.U)
    return re.sub(r"[\s_-]+", "-", s).strip("-") or "x"


def wp_date(raw: str, fallback_ts: str) -> datetime:
    raw = (raw or "").strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            d = datetime.strptime(raw.replace("Z", "+00:00") if "%z" in fmt else raw[:19], fmt)
            return d.astimezone(timezone.utc).replace(tzinfo=None) if d.tzinfo else d
        except ValueError:
            continue
    ts = (fallback_ts or "20130101000000").ljust(14, "0")
    return datetime.strptime(ts[:14], "%Y%m%d%H%M%S")


def upload_rel(url: str) -> str:
    """Original image URL -> path under wp-content/uploads/ (keeps year/month/filename)."""
    s = urlsplit(url)
    host = (s.hostname or "").lower()
    path = unquote(s.path)
    if "/wp-content/uploads/" in path:
        return path.split("/wp-content/uploads/", 1)[1]
    if host.endswith("files.wordpress.com"):            # WordPress.com origin: /2012/05/x.jpg
        return path.lstrip("/")
    if path.startswith("/files/"):                       # old wp.com mapped-domain style
        return path[len("/files/"):]
    return "recovered/" + path.lstrip("/")


# ---------- main -------------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site-url", default="https://www." + DOMAIN)
    ap.add_argument("--admin-login", default="martina", help='new login for the old "admin" author')
    args = ap.parse_args()
    site = args.site_url.rstrip("/")
    site_host = urlsplit(site).hostname

    with open(DATA / "manifest.csv", encoding="utf-8") as f:
        man = list(csv.DictReader(f))
    with open(DATA / "inventory.csv", encoding="utf-8") as f:
        inv = list(csv.DictReader(f))

    posts = []
    for fp in sorted(POSTS.glob("*.json")):
        p = json.loads(fp.read_text("utf-8"))
        if p["key"].split("/")[0] == DOMAIN and p["kind"] in ("article", "page") and p["slug"]:
            posts.append(p)
    by_path = {p["path"].lower().rstrip("/") + "/": p for p in posts}

    # ---- images: copy downloaded files to their original uploads paths
    have: dict[str, str] = {}                            # norm_url -> uploads rel path
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

    unresolved: list[tuple[str, str]] = []

    def image_target(url: str, post_path: str) -> str:
        k = norm_url(url)
        if k in have:
            return f"{site}/wp-content/uploads/{quote(have[k])}"
        orig = RESIZED.sub("", url)                      # resized variant lost -> use original
        if norm_url(orig) in have:
            return f"{site}/wp-content/uploads/{quote(have[norm_url(orig)])}"
        unresolved.append((post_path, url))
        return f"{site}/wp-content/uploads/{quote(upload_rel(url))}"   # drop the file in later

    def rewrite(body: str, p: dict) -> str:
        for img in sorted(set(p["images"]), key=len, reverse=True):
            if is_own_domain(img):
                body = body.replace(img, image_target(img, p["path"]))
        # full-size links around thumbnails (<a href=".../photo.jpg">) and remaining own URLs
        def fix(m: re.Match) -> str:
            url = m.group(0)
            if re.search(r"\.(jpe?g|png|gif|webp|bmp|mp4|mp3|pdf)(\?|$)", url, re.I) and is_own_domain(url):
                return image_target(url, p["path"])
            return OWN_URL.sub(site, url)
        body = re.sub(r"https?://(?:www\.)?(?:%s)[^\s\"'<>)]*" % "|".join(
            re.escape(d) for d in [DOMAIN, *LEGACY_DOMAINS]), fix, body, flags=re.I)
        return body

    # ---- authors / terms
    authors: dict[str, dict] = {}
    login_map: dict[str, str] = {}
    for p in posts:
        if not p["author"]:
            continue
        old_slug = p["author_slug"] or slugify(p["author"])
        login = args.admin_login if old_slug == "admin" else old_slug
        login_map[old_slug] = login
        authors.setdefault(login, {"login": login, "name": p["author"], "old_slug": old_slug})
    default_login = args.admin_login
    authors.setdefault(default_login, {"login": default_login, "name": "Mart Kawaii", "old_slug": "admin"})

    cats: dict[str, str] = {}
    tags: dict[str, str] = {}
    for p in posts:
        for name, slug in p["terms"]["category"].items():
            cats.setdefault(slug or slugify(name), name)
        for name, slug in p["terms"]["post_tag"].items():
            tags.setdefault(slug or slugify(name), name)

    # ---- WXR
    now = format_datetime(datetime.now(timezone.utc))
    out = ['<?xml version="1.0" encoding="UTF-8" ?>',
           '<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" '
           'xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" '
           'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">',
           "<channel>", "<title>Flowers in a Gun</title>", f"<link>{esc(site)}</link>",
           "<description></description>", f"<pubDate>{now}</pubDate>", "<language>en-US</language>",
           "<wp:wxr_version>1.2</wp:wxr_version>",
           f"<wp:base_site_url>{esc(site)}</wp:base_site_url>", f"<wp:base_blog_url>{esc(site)}</wp:base_blog_url>"]
    for i, a in enumerate(authors.values(), 1):
        out += [f"<wp:author><wp:author_id>{i}</wp:author_id><wp:author_login>{cdata(a['login'])}</wp:author_login>"
                f"<wp:author_email>{cdata('')}</wp:author_email><wp:author_display_name>{cdata(a['name'])}"
                f"</wp:author_display_name><wp:author_first_name>{cdata('')}</wp:author_first_name>"
                f"<wp:author_last_name>{cdata('')}</wp:author_last_name></wp:author>"]
    for i, (slug, name) in enumerate(sorted(cats.items()), 1):
        out.append(f"<wp:category><wp:term_id>{i}</wp:term_id><wp:category_nicename>{cdata(slug)}</wp:category_nicename>"
                   f"<wp:category_parent>{cdata('')}</wp:category_parent><wp:cat_name>{cdata(name)}</wp:cat_name></wp:category>")
    for i, (slug, name) in enumerate(sorted(tags.items()), 1000):
        out.append(f"<wp:tag><wp:term_id>{i}</wp:term_id><wp:tag_slug>{cdata(slug)}</wp:tag_slug>"
                   f"<wp:tag_name>{cdata(name)}</wp:tag_name></wp:tag>")

    used_ids: set[int] = set()
    next_id = max([p["wp_id"] or 0 for p in posts] + [0]) + 1
    comment_id = 1
    for p in sorted(posts, key=lambda x: x["date"] or x["snapshot_ts"]):
        pid = p["wp_id"]
        if not pid or pid in used_ids:
            pid, next_id = next_id, next_id + 1
        used_ids.add(pid)
        d = wp_date(p["date"], p["snapshot_ts"])
        old_slug = p["author_slug"] or (slugify(p["author"]) if p["author"] else "admin")
        login = login_map.get(old_slug, default_login)
        post_name = p["path"].strip("/").split("/")[-1].lower()     # keep original %-encoding
        item = [
            "<item>", f"<title>{cdata(p['title'])}</title>",
            f"<link>{esc(site + p['path'])}</link>",
            f"<pubDate>{format_datetime(d.replace(tzinfo=timezone.utc))}</pubDate>",
            f"<dc:creator>{cdata(login)}</dc:creator>",
            f'<guid isPermaLink="false">{esc(site)}/?p={pid}</guid>',
            "<description></description>",
            f"<content:encoded>{cdata(rewrite(p['body_html'], p))}</content:encoded>",
            f"<excerpt:encoded>{cdata('')}</excerpt:encoded>",
            f"<wp:post_id>{pid}</wp:post_id>",
            f"<wp:post_date>{cdata(d.strftime('%Y-%m-%d %H:%M:%S'))}</wp:post_date>",
            f"<wp:post_date_gmt>{cdata(d.strftime('%Y-%m-%d %H:%M:%S'))}</wp:post_date_gmt>",
            f"<wp:comment_status>{cdata('open')}</wp:comment_status>",
            f"<wp:ping_status>{cdata('closed')}</wp:ping_status>",
            f"<wp:post_name>{cdata(post_name)}</wp:post_name>",
            f"<wp:status>{cdata('publish')}</wp:status>",
            "<wp:post_parent>0</wp:post_parent>", "<wp:menu_order>0</wp:menu_order>",
            f"<wp:post_type>{cdata('post' if p['kind'] == 'article' else 'page')}</wp:post_type>",
            f"<wp:post_password>{cdata('')}</wp:post_password>", "<wp:is_sticky>0</wp:is_sticky>",
        ]
        for name, slug in p["terms"]["category"].items():
            item.append(f'<category domain="category" nicename="{esc(slug or slugify(name))}">{cdata(name)}</category>')
        for name, slug in p["terms"]["post_tag"].items():
            item.append(f'<category domain="post_tag" nicename="{esc(slug or slugify(name))}">{cdata(name)}</category>')
        for key, val in (("_fiag_original_url", p["original_url"]), ("_fiag_snapshot", p["snapshot_ts"]),
                         ("_fiag_featured_src", p.get("featured_image", ""))):
            if val:
                item.append(f"<wp:postmeta><wp:meta_key>{cdata(key)}</wp:meta_key>"
                            f"<wp:meta_value>{cdata(val)}</wp:meta_value></wp:postmeta>")
        for c in p.get("comments", []):
            cd = wp_date(c["date"], p["snapshot_ts"]).strftime("%Y-%m-%d %H:%M:%S")
            item.append(f"<wp:comment><wp:comment_id>{comment_id}</wp:comment_id>"
                        f"<wp:comment_author>{cdata(c['author'])}</wp:comment_author>"
                        f"<wp:comment_author_email>{cdata('')}</wp:comment_author_email>"
                        f"<wp:comment_author_url>{cdata('')}</wp:comment_author_url>"
                        f"<wp:comment_author_IP>{cdata('')}</wp:comment_author_IP>"
                        f"<wp:comment_date>{cdata(cd)}</wp:comment_date><wp:comment_date_gmt>{cdata(cd)}</wp:comment_date_gmt>"
                        f"<wp:comment_content>{cdata(c['content_html'])}</wp:comment_content>"
                        f"<wp:comment_approved>{cdata('1')}</wp:comment_approved><wp:comment_type>{cdata('comment')}</wp:comment_type>"
                        f"<wp:comment_parent>0</wp:comment_parent><wp:comment_user_id>0</wp:comment_user_id></wp:comment>")
            comment_id += 1
        item.append("</item>")
        out += item
    out += ["</channel>", "</rss>"]
    BUILD.mkdir(exist_ok=True)
    (BUILD / "flowersinagun.wxr.xml").write_text("\n".join(out), "utf-8")

    # ---- 301 map
    redirects: list[tuple[str, str, str]] = []
    post_paths = sorted(by_path, key=len, reverse=True)
    for r in inv:
        key = r["key"]
        host = key.split("/")[0]
        path = "/" + key.split("/", 1)[1] if "/" in key else "/"
        if host != DOMAIN:
            continue
        low = unquote(path.split("?")[0]).lower()
        if r["type"] == "other_html" and "?" not in path:   # (/feed etc. WordPress serves itself)
            # junk appended to a real post URL, e.g. /kmfdm-.../%3Ca%20href=
            parent = next((pp for pp in post_paths if low.startswith(pp) and low != pp), None)
            if parent:
                redirects.append((path, by_path[parent]["path"], "junk suffix on post URL"))
        if r["type"] == "shortlink":
            redirects.append((path, "(WordPress resolves ?p=ID itself - IDs preserved)", "shortlink, verify only"))
    for old, new in login_map.items():
        if old != new:
            redirects.append((f"/author/{old}/", f"/author/{new}/", "author login renamed"))
    legacy_pages = [r for r in inv if r["type"] == "legacy_page"]
    for r in legacy_pages:
        lp = "/" + r["key"].split("/", 1)[1] if "/" in r["key"] else "/"
        slug = unquote(lp.rstrip("/").split("/")[-1]).lower() if lp.strip("/") else ""
        target = next((p["path"] for p in posts if unquote(p["slug"]).lower() == slug), None) if slug else "/"
        redirects.append((r["key"], target or "/  (no matching post - check)", "legacy domain"))

    with open(BUILD / "redirects.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["from", "to", "reason"])
        w.writerows(redirects)

    naked = site_host[4:] if site_host.startswith("www.") else "www." + site_host
    ht = ["# ---- flowersinagun.com: generated by 04_export_wxr.py ----",
          "# Paste ABOVE '# BEGIN WordPress'. Test with: curl -I http://flowersinagun.com/some-post",
          "<IfModule mod_rewrite.c>", "RewriteEngine On", "",
          "# 1) Old domain (only if Martina still owns flowersinthebarrelofagun.com and points it here)",
          "RewriteCond %{HTTP_HOST} ^(www\\.)?flowersinthebarrelofagun\\.com$ [NC]",
          "RewriteRule ^\\d{4}/\\d{2}/\\d{2}/([^/]+)/?$ " + site + "/$1/ [R=301,L]",
          "RewriteCond %{HTTP_HOST} ^(www\\.)?flowersinthebarrelofagun\\.com$ [NC]",
          f"RewriteRule ^(.*)$ {site}/$1 [R=301,L]", "",
          "# 2) One canonical host + https (old inbound links use both www and non-www, http)",
          "RewriteCond %{HTTPS} off [OR]", f"RewriteCond %{{HTTP_HOST}} ^{re.escape(naked)}$ [NC]",
          f"RewriteRule ^(.*)$ {site}/$1 [R=301,L]", "",
          "# 3) Specific URLs", ]
    for frm, to, why in redirects:
        if frm.startswith("/") and to.startswith("/") and why not in ("legacy domain",):
            pattern = "^" + re.escape(unquote(frm).strip("/")).replace("\\ ", " ") + "/?$"
            ht.append(f'RewriteRule "{pattern}" {site}{to} [R=301,L,NE]   # {why}')
    ht += ["</IfModule>", "# ---- end ----"]
    (BUILD / "htaccess-redirects.txt").write_text("\n".join(ht), "utf-8")

    with open(BUILD / "unresolved_images.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["post", "image_url", "expected_upload_path"])
        for post, url in sorted(set(unresolved)):
            w.writerow([post, url, "wp-content/uploads/" + upload_rel(url)])

    n_posts = sum(p["kind"] == "article" for p in posts)
    notes = [
        f"Posts: {n_posts}, pages: {len(posts) - n_posts}, authors: {len(authors)}, categories: {len(cats)}, "
        f"tags: {len(tags)}, comments: {comment_id - 1}",
        f"Images copied to build/wp-content/uploads: {copied} new ({len(have)} available); "
        f"unresolved references: {len(set(unresolved))}",
        f"Redirect rules: {len(redirects)} specific + host/legacy rules",
        "",
        "Import steps (fresh WordPress):",
        "  1. Settings -> Permalinks -> Custom: /%postname%/   (matches the original)",
        "  2. Upload build/wp-content/uploads/* to wp-content/uploads/ (SFTP) BEFORE importing",
        "  3. Tools -> Import -> WordPress -> flowersinagun.wxr.xml",
        "     map authors to new users; leave 'Download and import file attachments' UNTICKED",
        "  4. Optional, to fill the Media Library in place (WP-CLI):",
        "     wp media import wp-content/uploads/20*/*/* --skip-copy",
        "  5. Paste build/htaccess-redirects.txt above '# BEGIN WordPress'",
        "  6. python 05_verify.py --base " + site,
    ]
    (BUILD / "import_notes.txt").write_text("\n".join(notes), "utf-8")
    print("\n".join(notes))


if __name__ == "__main__":
    main()
