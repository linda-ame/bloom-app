#!/usr/bin/env bash
#
# bump.sh — bump the cache-busting version string across the project.
#
# Usage:
#   ./bump.sh           # auto-bump current ?v=N to ?v=(N+1)
#   ./bump.sh 42        # set version to a specific number
#
# After running, commit and push:
#   git add -A && git commit -m "Bump asset version" && git push
#
# Browsers will refetch CSS/JS because the URL changed.

set -euo pipefail

cd "$(dirname "$0")"

# Find the current version. Default to 1 if nothing matches.
CURRENT=$(grep -h -oE '\?v=[0-9]+' *.html js/*.js 2>/dev/null \
  | head -n 1 \
  | sed 's/?v=//')

if [ -z "${CURRENT:-}" ]; then
  CURRENT=1
fi

if [ $# -ge 1 ]; then
  NEW="$1"
else
  NEW=$((CURRENT + 1))
fi

echo "Bumping cache-busting version: $CURRENT -> $NEW"

# macOS sed needs -i ''  (BSD sed). Linux sed needs -i (GNU sed).
SED_INPLACE=(-i '')
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
fi

# Replace ?v=CURRENT with ?v=NEW in all HTML and JS files
find . \
  \( -name "*.html" -o -name "*.js" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -print0 \
| xargs -0 sed "${SED_INPLACE[@]}" "s/?v=$CURRENT/?v=$NEW/g"

# Count changes for sanity
COUNT=$(grep -h -oE "\?v=$NEW" *.html js/*.js 2>/dev/null | wc -l | tr -d ' ')
echo "Done. Now ?v=$NEW appears $COUNT times."
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'Bump asset version to v$NEW'"
echo "  git push"
