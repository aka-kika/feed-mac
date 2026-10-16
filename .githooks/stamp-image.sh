#!/bin/bash
# stamp-image.sh: strip every metadata tag from an image (colour profile kept), report any AI-tool mention
# that was there, then write Kika's credit. Alt text is the page's job; this script never writes a Description
# unless one is passed. Exits non-zero when a file could not be stamped, so nothing leaves unstamped.
#
#   stamp-image.sh [--tool "App 1.2.0"] [--title "Title"] [--desc "Alt text"] file.png [file2.jpg ...]
#
# PNG, JPEG, WebP, TIFF, HEIC. SVG is skipped (ExifTool cannot write it; SVGs carry no camera metadata).
set -u
CREATOR="Veronica Loren aka Kika"
TOOL="akakika.com"; TITLE=""; DESC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tool) TOOL="$2"; shift 2;;
    --title) TITLE="$2"; shift 2;;
    --desc) DESC="$2"; shift 2;;
    *) break;;
  esac
done
# a working exiftool: Homebrew's first (a GUI git client may not have it on PATH), then whatever PATH finds
EXIF=""
for c in /opt/homebrew/bin/exiftool "$(command -v exiftool 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] && "$c" -ver >/dev/null 2>&1 && { EXIF="$c"; break; }
done
[ -n "$EXIF" ] || { echo "stamp-image: no working exiftool (brew install exiftool)" >&2; exit 2; }
YEAR=$(date +%Y); failed=0
for f in "$@"; do
  case "${f##*.}" in
    png|PNG|jpg|JPG|jpeg|JPEG|webp|WEBP|tif|TIF|tiff|TIFF|heic|HEIC) ;;
    *) echo "skip  $f"; continue;;
  esac
  [ -f "$f" ] || { echo "miss  $f"; continue; }
  # generator tags only; Title and Description are alt text and may legitimately name an agent
  hits=$("$EXIF" -s -s -s -Software -CreatorTool -Comment -UserComment -XMP-xmp:all -XMP-xmpMM:all -XMP-iptcExt:all -PNG:Software -PNG:Comment "$f" 2>/dev/null \
    | grep -iE 'midjourney|openai|chatgpt|dall.?e|stable ?diffusion|gemini|imagen|firefly|c2pa|generated|ai-generated|grok|minimax|claude|anthropic|photoshop|canva' | head -3)
  if ! "$EXIF" -q -overwrite_original -all= --icc_profile:all "$f" 2>/dev/null; then
    echo "FAIL  $f  (could not strip its metadata)" >&2; failed=1; continue
  fi
  # Title: --title, else the file name; a generic name (screenshot-01, img_1234) falls back to the folder name
  base=$(basename "${f%.*}")
  if echo "$base" | grep -qiE '^(screen ?shot|screenshot|image|img|photo|pic|untitled|capture|shot)[-_ ]?[0-9]*$'; then
    base="$(basename "$(dirname "$f")") ${base##*[-_ ]}"
  fi
  t="${TITLE:-$(echo "$base" | sed 's/[-_]/ /g')}"
  args=(-q -overwrite_original -XMP-dc:Creator="$CREATOR" -XMP-dc:Rights="Copyright $YEAR Kika, akakika.com" \
        -XMP-photoshop:Source="akakika.com" -XMP-photoshop:Credit="akakika.com" -XMP-xmp:CreatorTool="$TOOL" -XMP-dc:Title="$t")
  [ -n "$DESC" ] && args+=(-XMP-dc:Description="$DESC")
  "$EXIF" "${args[@]}" "$f" 2>/dev/null
  # read it back: a stamp that did not land is a failure, never a silent pass
  if [ "$("$EXIF" -s -s -s -XMP-dc:Creator "$f" 2>/dev/null)" != "$CREATOR" ]; then
    echo "FAIL  $f  (the credit did not land)" >&2; failed=1; continue
  fi
  if [ -n "$hits" ]; then echo "clean $f  (removed: $(echo "$hits" | tr '\n' ' ' | cut -c1-90))"; else echo "stamp $f"; fi
done
exit $failed
