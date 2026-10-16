#!/bin/sh
# Concatenates the MoxiePortal parent script and snippets into one file for pasting.
# Usage: ./build.sh [snippet.js ...] > dist/portal.js      (default: every snippet)
set -e
cd "$(dirname "$0")"
cat core/moxie-portal.js
if [ "$#" -eq 0 ]; then set -- snippets/*.js; fi
for f in "$@"; do
  printf '\n'
  cat "$f"
done
