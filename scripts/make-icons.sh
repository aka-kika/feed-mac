#!/bin/bash
# Draws every Feed icon from the sources in docs/icon/. Needs rsvg-convert and magick (Homebrew).
# feed-roll.svg       the receipt, transparent around its shape: 192, 512, 1024, About
# feed-roll-32.svg    fewer teeth, thicker lines: 32 px, favicon.svg, favicon.ico
# feed-roll-16.svg    the same on a 16 px grid
# feed-roll-tile.svg  solid, no transparency: apple touch icon (iOS fills transparency with black), maskable (what Safari puts in the Mac Dock)
set -euo pipefail
cd "$(dirname "$0")/.."
src=docs/icon out=public/icons
draw(){ rsvg-convert -w "$2" -h "$2" "$src/$1.svg" -o "$3"; }
solid(){ rsvg-convert -w "$2" -h "$2" "$src/$1.svg" | magick png:- -alpha off "PNG24:$3"; }
tmp=$(mktemp -d); trap 'find "$tmp" -type f -delete; rmdir "$tmp"' EXIT

draw feed-roll-32 32 "$out/feed-v3-32.png"
for s in 192 512 1024; do draw feed-roll "$s" "$out/feed-v3-$s.png"; done
solid feed-roll-tile 180 "$out/feed-v3-180.png"
solid feed-roll-tile 512 "$out/feed-v3-maskable-512.png"
cp "$src/feed-roll-32.svg" public/favicon.svg
draw feed-roll-16 16 "$tmp/16.png"; draw feed-roll-32 32 "$tmp/32.png"; draw feed-roll-32 48 "$tmp/48.png"
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" public/favicon.ico

# The README's icon: margin and a soft shadow, so the pale paper reads on a white page.
rsvg-convert -w 106 -h 106 "$src/feed-roll.svg" | magick png:- -background none -gravity center -extent 128x128 \
  \( +clone -background '#000000' -shadow 28x3+0+2 \) +swap -background none -layers merge +repage -gravity center -extent 128x128 docs/icon.png
