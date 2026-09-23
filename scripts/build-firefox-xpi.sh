#!/usr/bin/env bash
# Packages the Firefox-specific manifest + runtime files into a signable .xpi.
# Chrome only ever reads manifest.json, so manifest.firefox.json is merged in
# as manifest.json inside a throwaway staging dir instead of touching the repo.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./manifest.firefox.json').version)")
mkdir -p "${1:-.}"
OUT_DIR=$(cd "${1:-.}" && pwd)
OUT_FILE="$OUT_DIR/foxlog-firefox-$VERSION.xpi"
STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT

cp manifest.firefox.json "$STAGE_DIR/manifest.json"
cp popup.html popup.js "$STAGE_DIR/"
cp -R src "$STAGE_DIR/"

rm -f "$OUT_FILE"
(cd "$STAGE_DIR" && zip -r -X -q "$OUT_FILE" manifest.json popup.html popup.js src -x "*.DS_Store")

echo "Built $OUT_FILE"
