"""Create content/videos/*.yaml from the Drive file list in drive_zoomin.tsv (one-off, re-runnable).

Source: Martina's Google Drive folder "Journalism Work/ZoomIn.Tv" (her ZoomIn.TV video reports).
Each line is "<Drive file id>\t<file name>". The title is the file name with ".mp4" removed and the
characters Windows/Drive could not store in file names restored (": " and "/" were saved as "_").
No other wording is changed. Existing files are left alone, so edits made in Keystatic survive a re-run.

Usage: python3 tools/videos/import_drive.py
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).with_name("drive_zoomin.tsv")
OUT = ROOT / "content" / "videos"

FILM = ("Tribeca", "Liam Neeson", "Keira Knightley", "Chloë Grace Moretz", "Christina Applegate",
        "Lily Tomlin", "Monty Python", "Gal Gadot")
FASHION = ("NYFW", "Fashion Week", "Alice + Olivia", "catwalk", "Runways", "Daphne Guinness",
           "Thin-shamed model")


def title_of(name: str) -> str:
    t = re.sub(r"\.mp4$", "", name)
    t = re.sub(r"\bF_W\b", "F/W", t).replace("Fall_Winter", "Fall/Winter")
    t = re.sub(r"_ ?", ": ", t)  # "NYFW_ Zang Toi", "NYFW_Drew" -> "NYFW: …"
    return t


def section_of(title: str) -> str:
    if any(k in title for k in FILM):
        return "film"
    if any(k in title for k in FASHION):
        return "fashion"
    return "new-york"


def slug_of(title: str) -> str:
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def yaml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = 0
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        drive_id, name = line.split("\t", 1)
        title = title_of(name)
        path = OUT / f"{slug_of(title)}.yaml"
        if path.exists():
            continue
        path.write_text(
            f"title: {yaml_str(title)}\n"
            f"outlet: ZoomIn.TV\n"
            f"section: {section_of(title)}\n"
            f"driveId: {drive_id}\n"
            f"hidden: false\n",
            encoding="utf-8",
        )
        made += 1
    print(f"{made} written, {len(list(OUT.glob('*.yaml')))} total in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
