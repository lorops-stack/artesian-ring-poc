#!/usr/bin/env bash
# Records Ring Studio in a headless browser and converts it to a phone-friendly MP4 and a short GIF.
# Needs node + playwright (ui/test) and ffmpeg. Output: ui/test/demo/ring-studio-demo.mp4 and .gif
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE/ui" && node test/record_demo.js
cd "$HERE/ui/test/demo"
ffmpeg -y -loglevel error -i ring-studio-demo.webm -vf "scale=1280:-2,fps=30" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart ring-studio-demo.mp4
# GIF for texting: 18 s, 520 px wide, 10 fps, two-pass palette (keeps it under a few MB)
ffmpeg -y -loglevel error -ss 1 -t 18 -i ring-studio-demo.webm -vf "fps=10,scale=520:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" palette.png
ffmpeg -y -loglevel error -ss 1 -t 18 -i ring-studio-demo.webm -i palette.png -lavfi "fps=10,scale=520:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ring-studio-demo.gif
rm -f palette.png
ls -la ring-studio-demo.mp4 ring-studio-demo.gif
