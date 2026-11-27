#!/usr/bin/env bash
# Fallback deploy that doesn't run the GitHub Actions build:
# builds on this Mac and pushes dist/ to the gh-pages branch.
#
#   npm run deploy:pages              build + push to the gh-pages branch
#   npm run deploy:pages -- --switch  ...and point GitHub Pages at the gh-pages branch
#   npm run pages:actions             point GitHub Pages back at the Actions workflow (default)
set -euo pipefail

REPO="ihamzajameel/fuel-and-lift"
ACCOUNT="ihamzajameel"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TOKEN="$(gh auth token --user "$ACCOUNT" 2>/dev/null || gh auth token)"
export GH_TOKEN="$TOKEN"

if [[ "${1:-}" == "--actions" ]]; then
  gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null
  echo "GitHub Pages now deploys from the Actions workflow (push to main)."
  exit 0
fi

cd "$ROOT"
npm run build
touch dist/.nojekyll # serve files as-is (no Jekyll processing)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$ACCOUNT" -c user.email="272156382+$ACCOUNT@users.noreply.github.com" \
  commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git -c credential.helper= \
  -c "credential.helper=!f() { echo username=$ACCOUNT; echo \"password=\$GH_TOKEN\"; }; f" \
  push -q -f "https://github.com/$REPO.git" gh-pages
echo "Pushed build to the gh-pages branch."

if [[ "${1:-}" == "--switch" ]]; then
  gh api -X PUT "repos/$REPO/pages" -f build_type=legacy -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null
  echo "GitHub Pages now serves the gh-pages branch. Live in ~1 min: https://$ACCOUNT.github.io/fuel-and-lift/"
  echo "Switch back later with: npm run pages:actions"
else
  echo "Pages still deploys from Actions. Add --switch to serve this branch instead."
fi
