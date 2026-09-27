"""STEP 1 — Full inventory of flowersinagun.com in the Wayback Machine (CDX API).

Output:
  data/cdx_raw.json      every 200-OK capture (cache; delete to re-query)
  data/inventory.csv     one row per unique URL, classified, with candidate snapshots
  data/inventory_summary.txt

Usage:
  python 01_inventory.py                 # all captures
  python 01_inventory.py --before 20230101   # ignore captures after a date
                                             # (e.g. parked-domain pages after hosting expired)
  python 01_inventory.py --no-legacy     # skip the old flowersinthebarrelofagun.* hosts

Legacy hosts (the blog's WordPress.com origin) are queried too: their images become
normal "image" rows (downloaded + rehosted), their pages become "legacy_page" rows
(not downloaded; used for the 301 map if she still owns that domain).
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import re
from urllib.parse import urlsplit

from common import DATA, DOMAIN, LEGACY_DOMAINS, Wayback, norm_url

CDX = "https://web.archive.org/cdx/search/cdx"
FIELDS = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]

IMG_EXT = re.compile(r"\.(jpe?g|png|gif|webp|bmp|svg|ico)$", re.I)
THEME_EXT = re.compile(r"\.(css|js|woff2?|ttf|eot|otf|map)$", re.I)
NOISE = re.compile(
    r"(/wp-admin|/wp-login|xmlrpc\.php|/wp-json|/feed/?$|/feed/|/trackback|/embed/?$|"
    r"/comment-page-\d+|[?&](replytocom|share|amp|utm_[a-z]+|s|preview|like_comment|shared)=)",
    re.I,
)
LISTING = re.compile(
    r"^/(category|tag|author|page|search)(/|$)|^/\d{4}(/\d{2}){0,2}/?$|/page/\d+/?$", re.I
)
DATED_POST = re.compile(r"^/\d{4}/\d{2}(/\d{2})?/[^/]+/?$")


def fetch_cdx(wb: Wayback, domain: str = DOMAIN) -> list[dict]:
    cache = DATA / ("cdx_raw.json" if domain == DOMAIN else f"cdx_raw_{domain}.json")
    if cache.exists():
        print(f"Using cached {cache.name} (delete it to re-query)")
        return json.loads(cache.read_text("utf-8"))
    rows: list[dict] = []
    resume = None
    while True:
        params = {
            "url": domain,
            "matchType": "domain",  # includes www. and any subdomains
            "output": "json",
            "fl": ",".join(FIELDS),
            "filter": "statuscode:200",
            "limit": "5000",
            "showResumeKey": "true",
        }
        if resume:
            params["resumeKey"] = resume
        r = wb.get(CDX, params=params, timeout=180)
        if r is None or r.status_code != 200:
            raise SystemExit(f"CDX query failed: {None if r is None else r.status_code}")
        data = r.json() if r.text.strip() else []
        if not data:
            break
        header, body = data[0], data[1:]
        resume = None
        # With showResumeKey the tail is: [], [resumeKey]
        if len(body) >= 2 and body[-2] == [] and len(body[-1]) == 1:
            resume = body[-1][0]
            body = body[:-2]
        rows.extend(dict(zip(header, b)) for b in body if len(b) == len(header))
        print(f"  CDX {domain}: {len(rows)} captures so far")
        if not resume:
            break
    cache.write_text(json.dumps(rows), "utf-8")
    return rows


def classify(key: str, mimetype: str) -> str:
    path = urlsplit("http://" + key).path or "/"
    full = path + ("?" + urlsplit("http://" + key).query if "?" in key else "")
    if mimetype.startswith("image/") or IMG_EXT.search(path):
        return "image"
    if THEME_EXT.search(path) or "/wp-includes/" in path or "/wp-content/themes/" in path or "/wp-content/plugins/" in path:
        return "theme_asset"
    if NOISE.search(full):
        return "noise"
    if "html" not in mimetype and mimetype not in ("", "unk", "warc/revisit"):
        return "other_file"
    if re.search(r"[?&]p=\d+", full):
        return "shortlink"  # ?p=123 — resolves to a post id, useful for mapping
    if path == "/" and "?" not in key:
        return "home"
    if "?" in key:
        return "noise"
    if LISTING.search(path):
        return "listing"
    if DATED_POST.match(path):
        return "article"
    if path.count("/") == 1:
        return "article_or_page"  # /slug — decided in step 3 from the HTML body class
    return "other_html"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", help="ignore captures at/after this timestamp prefix, e.g. 20230101")
    ap.add_argument("--no-legacy", action="store_true")
    args = ap.parse_args()

    wb = Wayback(delay=1.0)
    rows = fetch_cdx(wb)
    legacy_hosts: set[str] = set()
    if not args.no_legacy:
        for d in LEGACY_DOMAINS:
            try:
                rows.extend(fetch_cdx(wb, d))
                legacy_hosts.add(d)
            except SystemExit as e:
                print(f"  ! legacy host {d} skipped: {e}")
    if args.before:
        rows = [r for r in rows if r["timestamp"] < args.before]

    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[norm_url(r["original"])].append(r)

    out = []
    for key, caps in groups.items():
        caps.sort(key=lambda c: c["timestamp"], reverse=True)
        seen, cands = set(), []
        for c in caps:  # newest first, one per distinct content digest
            if c["digest"] not in seen:
                seen.add(c["digest"])
                cands.append(c["timestamp"])
        mt = collections.Counter(c["mimetype"] for c in caps).most_common(1)[0][0]
        typ = classify(key, mt)
        host = key.split("/")[0]
        if any(host == h or host.endswith("." + h) for h in legacy_hosts) and typ != "image":
            typ = "legacy_page" if typ in ("article", "article_or_page", "home", "listing", "other_html") else "noise"
        out.append({
            "key": key,
            "type": typ,
            "original": caps[0]["original"],
            "mimetype": mt,
            "captures": len(caps),
            "first_ts": caps[-1]["timestamp"],
            "last_ts": caps[0]["timestamp"],
            "candidates": " ".join(cands[:15]),
        })
    out.sort(key=lambda r: (r["type"], r["key"]))

    with open(DATA / "inventory.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    by_type = collections.Counter(r["type"] for r in out)
    years = collections.Counter(r["timestamp"][:4] for r in rows)
    lines = [
        f"Captures (200 OK): {len(rows)}",
        f"Unique URLs:       {len(out)}",
        "",
        "By type:",
        *[f"  {t:16} {n}" for t, n in by_type.most_common()],
        "",
        "Captures per year (check when parked/expired pages start):",
        *[f"  {y}: {n}" for y, n in sorted(years.items())],
    ]
    (DATA / "inventory_summary.txt").write_text("\n".join(lines), "utf-8")
    print("\n".join(lines))
    print("\n-> data/inventory.csv")


if __name__ == "__main__":
    main()
