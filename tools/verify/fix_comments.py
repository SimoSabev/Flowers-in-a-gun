"""Re-parse archived comments from data/raw/html and rewrite the `comments:` block of the matching
content files (posts and pages). Scripted, reviewable content fix; nothing else in the files changes.

Why: the first export looked for WordPress-default markup (.fn, <time>), but the blog's theme puts
author and date as plain text in .comment-author / .comment-meta. All 46 comments lost author and
date, and the About page's 15 were skipped because pages had no comments field.

For every comment already in content/, the words must be unchanged: the script compares the old and
new text (ignoring whitespace and Markdown escapes from the first export) and refuses to write if
they differ.

    python fix_comments.py           # dry run: prints what would change
    python fix_comments.py --write   # rewrites content/**/*.mdoc
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
CONTENT = HERE.parent.parent / "content"
RAW = HERE / "data" / "raw" / "html"
POSTS_JSON = HERE / "data" / "posts"

spec = importlib.util.spec_from_file_location("parse03", HERE / "03_parse.py")
parse03 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parse03)

FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def q(s: str) -> str:
    """YAML double-quoted scalar (JSON string syntax is valid YAML)."""
    return json.dumps(s, ensure_ascii=False)


def comments_block(comments: list[dict]) -> list[str]:
    lines = ["comments:"]
    for c in comments:
        lines += [
            f"  - author: {q(c['author'])}",
            f"    date: {q(c['date'])}",
            f"    depth: {c['depth']}",
            f"    text: {q(c['text'])}",
        ]
    return lines


def norm(url: str) -> str:
    return re.sub(r"^www\.", "", url.split("://", 1)[-1]).rstrip("/")


def words(s: str) -> str:
    """Comparable form: no Markdown escapes/hard-break backslashes, whitespace collapsed."""
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # [text](url) -> text
    s = re.sub(r"\\(.)", r"\1", s.replace("\\\n", "\n"))
    return re.sub(r"\s+", " ", s).strip()


def old_texts(fm_lines: list[str]) -> list[str]:
    out = []
    for ln in fm_lines:
        m = re.match(r'^\s+text: (".*")\s*$', ln)
        if m:
            out.append(json.loads(m.group(1)))
    return out


def replace_block(fm: str, block: list[str]) -> str:
    lines = fm.split("\n")
    try:
        i = next(k for k, ln in enumerate(lines) if re.match(r"^comments:", ln))
    except StopIteration:
        return "\n".join(lines + block)
    j = i + 1
    while j < len(lines) and (lines[j].startswith(" ") or lines[j].startswith("-")):
        j += 1
    return "\n".join(lines[:i] + block + lines[j:])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    by_url = {}
    for f in list(CONTENT.glob("posts/*.mdoc")) + list(CONTENT.glob("pages/*.mdoc")):
        m = re.search(r'^originalUrl:\s*"?([^"\n]+)"?\s*$', f.read_text("utf-8"), re.M)
        if m:
            by_url[norm(m.group(1))] = f

    total = changed = 0
    for jf in sorted(POSTS_JSON.glob("*.json")):
        raw = RAW / (jf.stem + ".html")
        if not raw.exists():
            continue
        comments = parse03.parse_comments(BeautifulSoup(raw.read_text("utf-8", errors="replace"), "html.parser"))
        if not comments:
            continue
        url = norm(json.loads(jf.read_text("utf-8"))["original_url"])
        target = by_url.get(url)
        if not target:
            print(f"!! no content file for {url} ({len(comments)} comments)")
            continue
        src = target.read_text("utf-8")
        m = FRONTMATTER.match(src)
        fm = m.group(1)
        old = old_texts(fm.split("\n")[next((k for k, ln in enumerate(fm.split("\n")) if ln.startswith("comments:")), len(fm)) :]) if "comments:" in fm else []
        new_texts = [c["text"] for c in comments]
        # every existing comment must survive word-for-word
        missing = [t for t in old if words(t) not in {words(n) for n in new_texts}]
        if missing:
            raise SystemExit(f"text mismatch in {target.name}: {missing[:2]}")
        new_fm = replace_block(fm, comments_block(comments))
        total += len(comments)
        if new_fm != fm:
            changed += 1
            rel = target.relative_to(CONTENT.parent)
            print(f"{rel}: {len(old)} -> {len(comments)} comments, authors: {', '.join(sorted({c['author'] for c in comments}))}")
            if args.write:
                target.write_text("---\n" + new_fm + "\n---\n" + src[m.end():], "utf-8")
    print(f"{total} comments in {changed} files {'written' if args.write else '(dry run)'}")


if __name__ == "__main__":
    main()
