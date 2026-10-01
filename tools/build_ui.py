#!/usr/bin/env python3
"""Builds Ring Studio for the laptop (ui/dist) and for the ESP32 filesystem image (ui/dist-fs, gzip-compressed).

Run: python tools/build_ui.py
Then on the ESP32: PlatformIO "Upload Filesystem Image" (data_dir = ../ui/dist-fs).

Steps: regenerate js/data/*.js from the docs, bundle every <script> in ui/src/index.html (in order) into one app.js,
copy the CSS and the Geist fonts (with their OFL licence), write dist/ (plain files) and dist-fs/ (index.html.gz,
app.js.gz, app.css.gz plus the fonts, which are already compressed).
"""
import gzip
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ui" / "src"
DIST = ROOT / "ui" / "dist"
DIST_FS = ROOT / "ui" / "dist-fs"


def main() -> int:
    subprocess.run([sys.executable, str(ROOT / "tools" / "gen_docs_data.py")], check=True)
    html = (SRC / "index.html").read_text(encoding="utf-8")
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    parts = []
    for s in scripts:
        p = SRC / s
        parts.append(f"\n/* ==== {s} ==== */\n" + p.read_text(encoding="utf-8"))
    bundle = "/* Ring Studio bundle. Built by tools/build_ui.py from ui/src. Do not edit; edit ui/src and rebuild. */\n" + "".join(parts)
    # a quick syntax check with node when available
    try:
        tmp = ROOT / "ui" / ".bundle-check.js"
        tmp.write_text(bundle, encoding="utf-8")
        subprocess.run(["node", "--check", str(tmp)], check=True)
        tmp.unlink()
    except FileNotFoundError:
        print("node not found: skipping the syntax check")
    ver = hashlib.sha1(bundle.encode("utf-8")).hexdigest()[:8]
    css = (SRC / "css" / "app.css").read_text(encoding="utf-8")
    out_html = re.sub(r"<!-- build:scripts.*?<!-- /build:scripts -->", f'<script src="app.js?v={ver}"></script>', html, flags=re.S)
    out_html = out_html.replace('href="css/app.css"', f'href="app.css?v={ver}"')
    css = css.replace("url('fonts/", "url('fonts/")

    for d in (DIST, DIST_FS):
        if d.exists():
            shutil.rmtree(d)
        (d / "fonts").mkdir(parents=True)
    (DIST / "index.html").write_text(out_html, encoding="utf-8")
    (DIST / "app.js").write_text(bundle, encoding="utf-8")
    (DIST / "app.css").write_text(css, encoding="utf-8")
    for f in (SRC / "fonts").iterdir():
        shutil.copy(f, DIST / "fonts" / f.name)
        shutil.copy(f, DIST_FS / "fonts" / f.name)
    for name, text in (("index.html", out_html), ("app.js", bundle), ("app.css", css)):
        with gzip.open(DIST_FS / (name + ".gz"), "wb", compresslevel=9) as g:
            g.write(text.encode("utf-8"))
    total_fs = sum(p.stat().st_size for p in DIST_FS.rglob("*") if p.is_file())
    print(f"bundle {len(bundle) // 1024} kB ({len(scripts)} files) → ui/dist/ ; ui/dist-fs/ {total_fs // 1024} kB total for the ESP32 (v{ver})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
