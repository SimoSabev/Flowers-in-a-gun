"""STEP 5 — Check that every archived article/page URL works on the new site.

For each article/page/home/shortlink URL in data/inventory.csv, requests the URL on the new
site in several historical variants (http/https, www/non-www, with/without trailing slash)
and follows redirects. Pass = final status 200 at the expected path, in <= 2 hops.

Usage:
  python 05_verify.py --base https://www.flowersinagun.com
  python 05_verify.py --base https://staging.example.com --no-variants   # staging: path only
Output: build/verify.csv (+ summary)
"""
from __future__ import annotations

import argparse
import csv
import time
from urllib.parse import unquote, urlsplit

import requests

from common import DATA, DOMAIN, ROOT

TYPES = {"article", "article_or_page", "home", "shortlink"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--no-variants", action="store_true")
    ap.add_argument("--delay", type=float, default=0.2)
    args = ap.parse_args()
    base = args.base.rstrip("/")
    canon_host = urlsplit(base).hostname

    with open(DATA / "inventory.csv", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["type"] in TYPES and r["key"].split("/")[0] == DOMAIN]
    with open(DATA / "manifest.csv", encoding="utf-8") as f:
        failed = {r["key"] for r in csv.DictReader(f) if not r["status"].startswith("ok")}

    s = requests.Session()
    s.headers["User-Agent"] = "flowersinagun-verify/1.0"
    out, bad = [], 0
    for r in rows:
        if r["key"] in failed:
            continue
        path = "/" + r["key"].split("/", 1)[1] if "/" in r["key"] else "/"
        variants = [base + path]
        if not args.no_variants and r["type"] != "shortlink":
            p = path.rstrip("/")
            for scheme in ("http", "https"):
                for host in (DOMAIN, "www." + DOMAIN):
                    variants += [f"{scheme}://{host}{p}/", f"{scheme}://{host}{p}"]
        for url in dict.fromkeys(variants):
            try:
                resp = s.get(url, timeout=30, allow_redirects=True)
                final = urlsplit(resp.url)
                hops = len(resp.history)
                ok = (resp.status_code == 200 and final.hostname == canon_host and hops <= 2
                      and (r["type"] == "shortlink" or unquote(final.path).rstrip("/") == unquote(path).rstrip("/")))
                res = (url, resp.status_code, resp.url, hops, "OK" if ok else "FAIL")
            except requests.RequestException as e:
                res = (url, "ERR", type(e).__name__, 0, "FAIL")
            bad += res[-1] == "FAIL"
            out.append(res)
            if res[-1] == "FAIL":
                print("FAIL", res)
            time.sleep(args.delay)

    (ROOT / "build").mkdir(exist_ok=True)
    with open(ROOT / "build" / "verify.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["requested", "status", "final_url", "hops", "result"])
        w.writerows(out)
    print(f"\n{len(out) - bad}/{len(out)} OK -> build/verify.csv")


if __name__ == "__main__":
    main()
