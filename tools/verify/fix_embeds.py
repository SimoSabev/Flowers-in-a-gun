"""Restore text and media the first export dropped from embeds. Scripted, reviewable content fix.

1. Instagram embeds: the old site showed each embedded post's caption and credit line
   ("A post shared by Flowers In A Gun (@flowersinagun) on …"). The export kept only the URL.
   This adds them as `caption` / `credit` attributes on the existing `{% embed provider="instagram" %}`.
2. Self-hosted WordPress videos ([video] shortcode): the export dropped them entirely. This inserts
   `{% embed provider="video" src="/wp-content/uploads/…" /%}` between the same two paragraphs.
   The site renders nothing until the file exists under public/ (see STATUS.md).

Nothing else in the files changes; the site's Markdoc parser is used to check the result.

    python fix_embeds.py           # dry run
    python fix_embeds.py --write
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CONTENT = ROOT / "content" / "posts"
RAW = HERE / "data" / "raw" / "html"
POSTS_JSON = HERE / "data" / "posts"


def md_string(s: str) -> str:
    """Markdoc attribute string: double-quoted, with \\ \" and newline escaped."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def clean(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ")).strip() if el else ""


def instagram_posts(soup) -> list[dict]:
    out = []
    for bq in soup.select("blockquote.instagram-media"):
        link = bq.find("a", href=re.compile(r"instagram\.com/p/"))
        m = re.search(r"/p/([\w-]+)", (link or {}).get("href", "") or bq.get("data-instgrm-permalink", ""))
        if not m:
            continue
        paras = [clean(p) for p in bq.find_all("p")]
        paras = [p for p in paras if p]
        credit = next((p for p in paras if re.match(r"^A (post|video|photo) shared by|^A (video|photo) posted by|^A post shared by", p)), "")
        caption = next((p for p in paras if p != credit and p != "View this post on Instagram"), "")
        out.append({"id": m.group(1), "caption": caption, "credit": credit})
    return out


def videos(soup) -> list[dict]:
    out = []
    for v in soup.select(".entry-content .wp-video, .entry-content video.wp-video-shortcode"):
        video = v if v.name == "video" else v.find("video")
        source = video.find("source") if video else None
        src = (source or video or {}).get("src", "") if video else ""
        if not src:
            continue
        before = v.find_previous("p")
        out.append({"src": urlsplit(src).path, "after": clean(before)[:60] if before else ""})
    return out


def check_markdoc(files: list[Path]) -> None:
    script = """
import Markdoc from '@markdoc/markdoc'; import fs from 'node:fs';
for (const f of process.argv.slice(1)) {
  const src = fs.readFileSync(f, 'utf8').replace(/^---\\n[\\s\\S]*?\\n---\\n/, '');
  const errs = Markdoc.validate(Markdoc.parse(src), { tags: { embed: { selfClosing: true, attributes: {
    provider: { type: String }, src: { type: String }, caption: { type: String }, credit: { type: String } } } } });
  if (errs.length) { console.error(f, JSON.stringify(errs)); process.exit(1); }
}
"""
    subprocess.run(["node", "--input-type=module", "-e", script, *map(str, files)], cwd=ROOT, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    touched: list[Path] = []
    for jf in sorted(POSTS_JSON.glob("*.json")):
        raw = RAW / (jf.stem + ".html")
        if not raw.exists():
            continue
        html = raw.read_text("utf-8", errors="replace")
        if "instagram-media" not in html and "wp-video" not in html:
            continue
        slug = json.loads(jf.read_text("utf-8"))["slug"]
        target = CONTENT / f"{slug}.mdoc"
        if not target.exists():
            continue
        soup = BeautifulSoup(html, "html.parser")
        src = target.read_text("utf-8")
        new = src

        for ig in instagram_posts(soup):
            pat = re.compile(r'\{% embed provider="instagram" src="(https://www\.instagram\.com/p/' + re.escape(ig["id"]) + r'/?)"\s*/%\}')
            m = pat.search(new)
            if not m or not ig["caption"]:
                print(f"  ?? {slug}: instagram {ig['id']} not found or no caption")
                continue
            tag = f'{{% embed provider="instagram" src="{m.group(1)}" caption={md_string(ig["caption"])}'
            tag += f" credit={md_string(ig['credit'])} /%}}" if ig["credit"] else " /%}"
            new = new[: m.start()] + tag + new[m.end():]
            print(f"{target.relative_to(ROOT)}: instagram {ig['id']} + caption ({len(ig['caption'].split())} words)")

        for v in videos(soup):
            if v["src"] in new:
                continue
            body_start = new.index("\n---\n", 4) + 5
            i = new.find(v["after"], body_start) if v["after"] else -1
            if i < 0:
                print(f"  ?? {slug}: can't place video {v['src']}")
                continue
            end = new.find("\n\n", i)
            end = len(new) if end < 0 else end
            new = new[:end] + f'\n\n{{% embed provider="video" src="{v["src"]}" /%}}' + new[end:]
            print(f"{target.relative_to(ROOT)}: video {v['src']} after \"{v['after'][:40]}…\"")

        if new != src:
            touched.append(target)
            if args.write:
                target.write_text(new, "utf-8")

    if args.write and touched:
        check_markdoc(touched)
    print(f"{len(touched)} files {'written and validated' if args.write else '(dry run)'}")


if __name__ == "__main__":
    main()
