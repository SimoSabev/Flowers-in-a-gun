"""Shared helpers: HTTP session with retries/rate limiting, URL normalisation, paths."""
from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAW_HTML = DATA / "raw" / "html"
RAW_ASSETS = DATA / "raw" / "assets"
POSTS = DATA / "posts"
for _p in (DATA, RAW_HTML, RAW_ASSETS, POSTS):
    _p.mkdir(parents=True, exist_ok=True)

DOMAIN = "flowersinagun.com"
# The blog started on WordPress.com as "flowersinthebarrelofagun"; 2012-13 posts still
# reference images on these hosts. Treated as own content (images get downloaded + rehosted).
LEGACY_DOMAINS = ["flowersinthebarrelofagun.com", "flowersinthebarrelofagun.files.wordpress.com"]
OWN_HOSTS = [DOMAIN, *LEGACY_DOMAINS]
UA = "flowersinagun-archive-recovery/1.0 (site owner restoring her own blog)"

# Wayback rewrites links as /web/20150101000000im_/http://... — strip that.
WAYBACK_PREFIX = re.compile(r"^(?:https?:)?(?://web\.archive\.org)?/web/\d{1,14}[a-z_]*/", re.I)


def unwayback(url: str) -> str:
    """Turn a Wayback-rewritten URL back into the original URL."""
    url = url.strip()
    url = WAYBACK_PREFIX.sub("", url)
    if url.startswith("//"):
        url = "http:" + url
    return url


def norm_url(url: str) -> str:
    """Canonical key for de-duplication: no scheme, no www, no port, no fragment,
    lower-case host, trailing slash stripped (except root). Query kept."""
    url = unwayback(url)
    if "://" not in url:
        url = "http://" + url.lstrip("/")
    s = urlsplit(url)
    host = (s.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = s.path or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return urlunsplit(("", host, path, s.query, "")).lstrip("/")


def is_own_domain(url: str) -> bool:
    h = (urlsplit(unwayback(url) if "://" in url else "http://" + url).hostname or "").lower()
    return any(h == d or h.endswith("." + d) for d in OWN_HOSTS)


def data_path(rel: str) -> Path:
    """Manifest stores Windows-style relative paths; make them work on any OS."""
    return DATA / rel.replace("\\", "/")


# The live site was compromised at some point (obfuscated eval() appended to wp-embed.min.js
# from 2018 on; some Jan-Feb 2018 snapshots are flagged as Trojan by antivirus).
# We never need page scripts, so they are removed BEFORE the file touches the disk.
_SCRIPT = re.compile(rb"<script\b[^>]*>.*?</script\s*>", re.I | re.S)
INJECTION = re.compile(rb"eval\(function\(p,a,c,k,e,[dr]\)|vglnk|document\.write\(unescape|atob\(|\\x[0-9a-f]{2}\\x[0-9a-f]{2}", re.I)


def sanitize_html(body: bytes) -> tuple[bytes, bool]:
    """Strip <script> blocks (on*= handlers are removed later by the parser).
    Returns (clean_bytes, had_injection)."""
    injected = bool(INJECTION.search(body))
    return _SCRIPT.sub(b"", body), injected


def safe_name(key: str, ext: str = "") -> str:
    """Windows-safe, bounded-length filename derived from a URL key."""
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", key).strip("_")[:120] or "root"
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return f"{base}__{h}{ext}"


class Wayback:
    """requests.Session with polite pacing and exponential backoff.
    Wayback throttles aggressively (429 / connection resets) — keep delay >= 1s."""

    def __init__(self, delay: float = 1.5, max_retries: int = 6):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.delay = delay
        self.max_retries = max_retries
        self._last = 0.0

    def get(self, url: str, **kw) -> requests.Response | None:
        kw.setdefault("timeout", 60)
        backoff = 5.0
        for attempt in range(1, self.max_retries + 1):
            wait = self.delay - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
            try:
                r = self.s.get(url, **kw)
            except requests.RequestException as e:
                print(f"  ! {type(e).__name__} (attempt {attempt}) -> sleep {backoff:.0f}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, 300)
                continue
            if r.status_code == 429 or r.status_code >= 500:
                print(f"  ! HTTP {r.status_code} (attempt {attempt}) -> sleep {backoff:.0f}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, 300)
                continue
            return r
        return None


def snapshot_url(ts: str, original: str) -> str:
    """id_ = raw original bytes, no Wayback toolbar or link rewriting."""
    return f"https://web.archive.org/web/{ts}id_/{original}"


# ---------------------------------------------------------------- image resolution
_RESIZED = re.compile(r"-(\d{2,4})x(\d{2,4})(?=\.\w{3,4}$)")


def upload_path(url_or_key: str) -> str:
    """Host-independent path of an uploaded file: '2013/03/st1-1024x682.jpg'."""
    k = norm_url(url_or_key).lower()
    if "/wp-content/uploads/" in k:
        return k.split("/wp-content/uploads/", 1)[1]
    if "files.wordpress.com/" in k:
        return k.split("files.wordpress.com/", 1)[1]
    if "/files/" in k:
        return k.split("/files/", 1)[1]
    return k


class ImageIndex:
    """What we actually have on disk, for resolving any reference to the best available file:
    exact file -> same path on another host (old/new domain) -> full-size original -> largest other size."""

    def __init__(self, manifest_rows: list[dict]):
        self.by_path: dict[str, dict] = {}
        self.by_base: dict[str, list[tuple[int, dict]]] = {}
        for r in manifest_rows:
            if r["type"] != "image" or r["status"] != "ok" or not data_path(r["file"]).exists():
                continue
            p = upload_path(r["key"])
            self.by_path.setdefault(p, r)
            m = _RESIZED.search(p)
            area = int(m.group(1)) * int(m.group(2)) if m else 10**9   # original beats any size
            self.by_base.setdefault(_RESIZED.sub("", p), []).append((area, r))
        for v in self.by_base.values():
            v.sort(key=lambda x: -x[0])

    def resolve(self, url: str) -> tuple[dict | None, str]:
        p = upload_path(url)
        if p in self.by_path:
            return self.by_path[p], "exact"
        base = _RESIZED.sub("", p)
        if base in self.by_path:
            return self.by_path[base], "original"
        if base in self.by_base:
            return self.by_base[base][0][1], "other_size"
        return None, "missing"
