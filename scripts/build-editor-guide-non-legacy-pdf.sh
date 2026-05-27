#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCREEN_DIR="docs/guide-screenshots-non-legacy"
if [[ ! -f "${SCREEN_DIR}/01-performance-overview.png" ]]; then
  echo "Capturing app screenshots in dark mode (dev server must be running on :3000)..."
  node scripts/capture-guide-screenshots-non-legacy.mjs
fi

HTML="file://${ROOT}/docs/editor-guide-non-legacy.html"
PDF="${ROOT}/docs/NMAC-KPI-Editor-Guide-Non-Legacy.pdf"
DOWNLOADS="${HOME}/Downloads/NMAC-KPI-Editor-Guide-Non-Legacy.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found. Open docs/editor-guide-non-legacy.html and Print → Save as PDF."
  exit 1
fi

"$CHROME" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PDF" "$HTML"
cp "$PDF" "$DOWNLOADS"
echo "Wrote $PDF"
echo "Copied to $DOWNLOADS"
