#!/usr/bin/env bash
# Packages the Chrome manifest + runtime files into a .zip for the Chrome Web Store.
# Only what the extension loads ships: tests, docs, scripts and the Firefox
# manifest stay out. The files are staged in a throwaway dir so the archive
# only ever holds the listed paths, with manifest.json at its root.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./manifest.json').version)")
mkdir -p "${1:-.}"
OUT_DIR=$(cd "${1:-.}" && pwd)
OUT_FILE="$OUT_DIR/foxlog-chrome-$VERSION.zip"
STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT

cp manifest.json popup.html popup.js "$STAGE_DIR/"
cp -R src "$STAGE_DIR/"

rm -f "$OUT_FILE"
(cd "$STAGE_DIR" && zip -r -X -q "$OUT_FILE" manifest.json popup.html popup.js src -x "*.DS_Store")

# The Web Store rejects a package whose manifest.json is nested in a folder
if ! unzip -Z1 "$OUT_FILE" | grep -qx 'manifest.json'; then
  echo "manifest.json is not at the root of $OUT_FILE" >&2
  exit 1
fi

echo "Built $OUT_FILE"
