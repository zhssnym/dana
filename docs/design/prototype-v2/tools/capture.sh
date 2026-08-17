#!/usr/bin/env bash
# Deterministic screen capture for prototype-v2.
#
# Usage: bash capture.sh <output-dir> [base-url]
#   default base-url: http://localhost:5200
#
# Runs Playwright's CLI from app/'s installed version, because that exact
# version already has its browsers on this machine (the CI browser leg).
# The prototype itself has no Playwright dependency and needs none.
#
# v1's handoff shipped 09-search.png as a byte-duplicate of 07-all.png and
# nobody noticed because exports were captured by hand. This list is the
# fix: one URL per screen, the same URLs every time, and a trailing
# duplicate check so a repeat of that defect fails loudly.

set -euo pipefail

OUT="${1:?usage: capture.sh <output-dir> [base-url]}"
BASE="${2:-http://localhost:5200}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../../../app"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # absolute, because the capture below runs from $APP

shots=(
  "01-my-day|/?handoff=clean"
  "02-tasks|/?page=tasks&handoff=clean"
  "03-folder-shared|/?state=folder&folder=Wedding&handoff=clean"
  "04-planned-calendar|/?page=planned&mode=calendar&handoff=clean"
  "05-task-form-edit|/?view=form&form=expanded&review=edit&handoff=clean"
  "06-important|/?page=important&handoff=clean"
  "07-all|/?page=all&handoff=clean"
  "08-done|/?page=done&handoff=clean"
  "09-search|/?search=open&handoff=clean"
  "10-people|/?page=people&handoff=clean"
  "11-settings|/?page=settings&handoff=clean"
  "12-landing|/?view=landing"
  "13-auth-unverified|/?view=auth-unverified"
  "14-incoming-invites|/?view=invites"
  "15-system-offline|/?state=offline&handoff=clean"
  "16-email-reminder|/?view=email"
  "17-states-lab|/?view=states"
  "18-privacy|/?view=privacy"
  "19-terms|/?view=terms"
)

for shot in "${shots[@]}"; do
  name="${shot%%|*}"
  path="${shot#*|}"
  echo "-> $name"
  (cd "$APP" && npx playwright screenshot \
    --viewport-size=1440,900 --wait-for-timeout=1200 \
    "$BASE$path" "$OUT/$name.png") >/dev/null 2>&1
done

# The duplicate check v1 never had.
dupes="$(cd "$OUT" && md5sum ./*.png | sort | awk '{print $1}' | uniq -d)"
if [ -n "$dupes" ]; then
  echo "DUPLICATE CAPTURES DETECTED:" >&2
  (cd "$OUT" && md5sum ./*.png | sort) >&2
  exit 1
fi

echo "OK: $(ls "$OUT" | wc -l) unique captures in $OUT"
