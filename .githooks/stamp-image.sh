#!/bin/bash
# stamp-image.sh: strip every metadata tag from an image (colour profile kept), report any AI-tool mention
# that was there, then write Kika's credit. Alt text is the page's job; this script never writes a Description
# unless one is passed.
#
#   stamp-image.sh [--tool "App 1.2.0"] [--title "Title"] [--desc "Alt text"] file.png [file2.jpg ...]
#
# PNG, JPEG, WebP, TIFF, HEIC. SVG is skipped (ExifTool cannot write it; SVGs carry no camera metadata).
set -u
TOOL="akakika.com"; TITLE=""; DESC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tool) TOOL="$2"; shift 2;;
    --title) TITLE="$2"; shift 2;;
    --desc) DESC="$2"; shift 2;;
    *) break;;
  esac
done
command -v exiftool >/dev/null || { echo "stamp-image: exiftool not found (brew install exiftool)"; exit 1; }
YEAR=$(date +%Y)
for f in "$@"; do
  case "${f##*.}" in
    png|PNG|jpg|JPG|jpeg|JPEG|webp|WEBP|tif|tiff|heic|HEIC) ;;
    *) echo "skip  $f"; continue;;
  esac
  [ -f "$f" ] || { echo "miss  $f"; continue; }
  # anything that names a generator or AI tool, before it is gone
  # generator tags only; Title and Description are alt text and may legitimately name an agent
  hits=$(exiftool -s -s -s -Software -CreatorTool -Comment -UserComment -XMP-xmp:all -XMP-xmpMM:all -XMP-iptcExt:all -PNG:Software -PNG:Comment "$f" 2>/dev/null \
    | grep -iE 'midjourney|openai|chatgpt|dall.?e|stable ?diffusion|gemini|imagen|firefly|c2pa|generated|ai-generated|grok|minimax|claude|anthropic|photoshop|canva' | head -3)
  exiftool -q -overwrite_original -all= --icc_profile:all "$f" 2>/dev/null
  t="${TITLE:-$(basename "${f%.*}" | sed 's/[-_]/ /g')}"
  args=(-q -overwrite_original -XMP-dc:Creator="Kika (akakika)" -XMP-dc:Rights="Copyright $YEAR Kika, akakika.com" \
        -XMP-photoshop:Source="akakika.com" -XMP-photoshop:Credit="akakika.com" -XMP-xmp:CreatorTool="$TOOL" -XMP-dc:Title="$t")
  [ -n "$DESC" ] && args+=(-XMP-dc:Description="$DESC")
  exiftool "${args[@]}" "$f" 2>/dev/null
  if [ -n "$hits" ]; then echo "clean $f  (removed: $(echo "$hits" | tr '\n' ' ' | cut -c1-90))"; else echo "stamp $f"; fi
done
