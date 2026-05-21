#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f docs/guide-screenshots/01-performance-overview.png ]]; then
  echo "Capturing screenshots (dev server must be running on :3000)..."
  node scripts/capture-guide-screenshots.mjs
fi

HTML="file://${ROOT}/docs/editor-guide.html"
PDF="${ROOT}/docs/NMAC-KPI-Editor-Guide.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found. Open docs/editor-guide.html and Print → Save as PDF."
  exit 1
fi

"$CHROME" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PDF" "$HTML"
echo "Wrote $PDF"
