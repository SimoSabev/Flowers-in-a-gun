"""STEP 2 — Download raw HTML + images from Wayback (resumable, rate-limited).

Reads data/inventory.csv, tries candidate snapshots newest -> oldest until one
passes validation (real blog page, not a parked/expired/error page).

Output:
  data/raw/html/*.html, data/raw/assets/*    raw files
  data/manifest.csv                          key -> file, snapshot used, status

Usage:
  python 02_download.py                    # html pages (articles/pages/home) + images
  python 02_download.py --only html        # or: --only image
  python 02_download.py --with-listings    # also category/tag/author pages (helps map authors)
  python 02_download.py --extra data/missing_images.txt   # URLs found in step 3 but not in CDX
  python 02_download.py --delay 2.5        # slower if Wayback keeps throttling
  python 02_download.py --only html --prefer-before 20180101
                                           # prefer snapshots from before the 2018 hack
  python 02_download.py --sanitize-existing   # strip <script> from already-downloaded HTML

HTML is sanitized (all <script> removed) before it is written, so antivirus has
nothing to flag. Items marked ok whose file is gone (e.g. quarantined) are re-fetched.

Safe to stop (Ctrl+C) and re-run: finished items are skipped.
"""
from __future__ import annotations

import argparse
import csv
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlsplit

from common import DATA, RAW_ASSETS, RAW_HTML, Wayback, data_path, norm_url, safe_name, sanitize_html, snapshot_url

MANIFEST = DATA / "manifest.csv"
MF_FIELDS = ["key", "type", "original", "ts", "file", "status", "bytes", "injected"]
HTML_TYPES = {"home", "article", "article_or_page", "other_html"}
PARKED = re.compile(
    r"(this domain (is|may be) for sale|domain has expired|parked (free|domain)|"
    r"account (has been )?suspended|future home of something quite cool|hugedomains|sedo\.com|godaddy\.com/domain)",
    re.I,
)


def load_manifest() -> dict[str, dict]:
    if not MANIFEST.exists():
        return {}
    with open(MANIFEST, encoding="utf-8") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def save_manifest(m: dict[str, dict]) -> None:
    tmp = MANIFEST.with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MF_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(m.values())
    tmp.replace(MANIFEST)


def valid_html(body: bytes) -> tuple[bool, str]:
    if len(body) < 1500:
        return False, "too_small"
    t = body[:200_000].decode("utf-8", "ignore")
    if "<html" not in t.lower() and "<body" not in t.lower():
        return False, "not_html"
    if PARKED.search(t):
        return False, "parked"
    if "wp-content" not in t and "flowersinagun" not in t.lower():
        return False, "not_blog"
    return True, "ok"


def ext_for(url: str, ctype: str) -> str:
    ext = Path(urlsplit(url).path).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{2,5}", ext or ""):
        return ext
    return mimetypes.guess_extension((ctype or "").split(";")[0].strip()) or ".bin"


def order_candidates(cands: list[str], prefer_before: str | None) -> list[str]:
    """Newest-first by default; with prefer_before, snapshots older than that date go first
    (still newest-first among them), the rest are kept as fallback."""
    if not prefer_before:
        return cands
    return [c for c in cands if c < prefer_before] + [c for c in cands if c >= prefer_before]


def fetch_item(wb: Wayback, row: dict, kind: str, prefer_before: str | None = None) -> dict:
    cands = order_candidates(row.get("candidates", "").split() or ["2016"], prefer_before)
    injected = False
    last_reason = "no_candidates"
    for ts in cands[:8]:
        r = wb.get(snapshot_url(ts, row["original"]))
        if r is None:
            last_reason = "network"
            continue
        if r.status_code != 200:
            last_reason = f"http_{r.status_code}"
            continue
        if kind == "html":
            ok, last_reason = valid_html(r.content)
            if not ok:
                continue
            content, injected = sanitize_html(r.content)
            path = RAW_HTML / safe_name(row["key"], ".html")
        else:
            ctype = r.headers.get("Content-Type", "")
            if not ctype.startswith("image/") and len(r.content) < 200:
                last_reason = f"not_image({ctype})"
                continue
            content = r.content
            path = RAW_ASSETS / safe_name(row["key"], ext_for(row["original"], ctype))
        path.write_bytes(content)
        return {"ts": ts, "file": str(path.relative_to(DATA)), "status": "ok", "bytes": len(content),
                "injected": "yes" if injected else ""}
    return {"ts": "", "file": "", "status": f"failed:{last_reason}", "bytes": 0, "injected": ""}


def sanitize_existing(m: dict[str, dict]) -> None:
    n_files = n_inj = 0
    for r in m.values():
        if r["status"] != "ok" or not r["file"].endswith(".html"):
            continue
        p = data_path(r["file"])
        if not p.exists():
            continue
        clean, inj = sanitize_html(p.read_bytes())
        p.write_bytes(clean)
        n_files += 1
        if inj:
            r["injected"] = "yes"
            n_inj += 1
    save_manifest(m)
    print(f"Sanitized {n_files} HTML files; {n_inj} had injected code.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["html", "image"])
    ap.add_argument("--with-listings", action="store_true")
    ap.add_argument("--extra", help="text file with extra image URLs (one per line)")
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--delay", type=float, default=1.5)
    ap.add_argument("--prefer-before", help="timestamp prefix, e.g. 20180101: try older snapshots first")
    ap.add_argument("--sanitize-existing", action="store_true")
    args = ap.parse_args()

    if args.sanitize_existing:
        sanitize_existing(load_manifest())
        return

    with open(DATA / "inventory.csv", encoding="utf-8") as f:
        inv = list(csv.DictReader(f))
    html_types = HTML_TYPES | ({"listing"} if args.with_listings else set())

    todo: list[tuple[dict, str]] = []
    if args.extra:
        for line in Path(args.extra).read_text("utf-8").splitlines():
            u = line.strip()
            if u:
                todo.append(({"key": norm_url(u), "type": "image", "original": u, "candidates": "2016"}, "image"))
    else:
        for row in inv:
            if row["type"] in html_types and args.only != "image":
                todo.append((row, "html"))
            elif row["type"] == "image" and args.only != "html":
                todo.append((row, "image"))
        todo.sort(key=lambda x: x[1] != "html")  # html first — that's what matters most

    wb = Wayback(delay=args.delay)
    m = load_manifest()
    done = 0
    try:
        for i, (row, kind) in enumerate(todo, 1):
            prev = m.get(row["key"])
            if prev and prev["status"] == "ok":
                if data_path(prev["file"]).exists():
                    continue
                print(f"   (file missing, probably quarantined by antivirus -> re-fetch)")
            elif prev and not args.retry_failed:
                continue
            print(f"[{i}/{len(todo)}] {kind:5} {row['key']}")
            res = fetch_item(wb, row, kind, args.prefer_before)
            m[row["key"]] = {"key": row["key"], "type": row["type"], "original": row["original"], **res}
            if res["status"] != "ok":
                print(f"   -> {res['status']}")
            done += 1
            if done % 10 == 0:
                save_manifest(m)
    except KeyboardInterrupt:
        print("\nInterrupted — progress saved, re-run to continue.")
    finally:
        save_manifest(m)

    ok = sum(1 for r in m.values() if r["status"] == "ok")
    print(f"\nManifest: {ok} ok / {len(m)} total -> data/manifest.csv")


if __name__ == "__main__":
    main()
