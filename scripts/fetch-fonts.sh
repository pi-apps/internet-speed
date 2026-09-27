#!/usr/bin/env bash
set -uo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/fonts"
mkdir -p "$DEST"

fetch() {
  local name="$1" url="$2"
  printf 'fetching %-26s ' "$name"
  if curl -fsL --retry 3 -o "$DEST/$name" "$url"; then echo "ok"
  else echo "failed - the site will fall back to system fonts"; fi
}

fetch manrope-var.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/manrope:vf@latest/latin-wght-normal.woff2"
fetch space-grotesk-var.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk:vf@latest/latin-wght-normal.woff2"

ls -la "$DEST"
