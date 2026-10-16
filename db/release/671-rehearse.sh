#!/usr/bin/env bash
# Rehearse #671 only on a freshly restored, isolated PostgreSQL 18 instance.
# This script NEVER applies migrations to the source database.
set -Eeuo pipefail
umask 077

cd "$(dirname "$0")/../.."

: "${DANA_671_SOURCE_URL:?Set the production READ URL through a secure environment mechanism}"
: "${DANA_671_REHEARSAL_URL:?Set the URL for a disposable EMPTY PostgreSQL 18 instance}"
: "${DANA_671_ARTIFACT_DIR:?Set a secure artifact directory OUTSIDE the Git checkout}"
: "${DANA_671_ACK:?Set DANA_671_ACK=ISOLATED_REHEARSAL_ONLY}"
[[ "$DANA_671_ACK" == 'ISOLATED_REHEARSAL_ONLY' ]] || { echo 'Release gate acknowledgment missing' >&2; exit 2; }

for command in node pg_dump pg_restore psql sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 2; }
done

# Reject even different database names on the same host: rehearse on a separate instance.
node <<'NODE'
const source = new URL(process.env.DANA_671_SOURCE_URL)
const target = new URL(process.env.DANA_671_REHEARSAL_URL)
for (const u of [source, target]) {
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || !u.pathname.slice(1)) {
    throw new Error('Expected PostgreSQL URL with hostname and database name')
  }
}
if (source.hostname.toLowerCase() === target.hostname.toLowerCase() &&
    (source.port || '5432') === (target.port || '5432')) {
  throw new Error('Source and target share a host/port; an ISOLATED database instance is required')
}
NODE

root="$(pwd -P)"
mkdir -p -- "$DANA_671_ARTIFACT_DIR"
artifacts="$(cd "$DANA_671_ARTIFACT_DIR" && pwd -P)"
case "$artifacts/" in "$root/"*) echo 'Artifact directory must be outside the Git checkout' >&2; exit 2;; esac
chmod 700 "$artifacts"

# Never echo database URLs or SQL rows. Connection strings belong in secure environment variables.
source_major="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_SOURCE_URL" -c 'SHOW server_version_num')"
target_major="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" -c 'SHOW server_version_num')"
[[ "$source_major" == 18* && "$target_major" == 18* ]] || { echo 'Both databases must use PostgreSQL 18' >&2; exit 2; }
[[ "$(pg_dump --version)" == *' 18.'* ]] || { echo 'pg_dump 18 required' >&2; exit 2; }
[[ "$(pg_restore --version)" == *' 18.'* ]] || { echo 'pg_restore 18 required' >&2; exit 2; }

source_ok="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_SOURCE_URL" -c "SELECT to_regclass('public.folders') IS NOT NULL AND to_regclass('public.page_facets') IS NULL")"
[[ "$source_ok" == t ]] || { echo 'Source is not the expected pre-0092 Dana database' >&2; exit 2; }
target_tables="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
[[ "$target_tables" == 0 ]] || { echo 'Rehearsal target must be EMPTY; refusing to restore/overwrite' >&2; exit 2; }

backup="$artifacts/dana-671-$(date -u +%Y%m%dT%H%M%SZ).dump"
[[ ! -e "$backup" ]] || { echo 'Backup filename already exists; refusing overwrite' >&2; exit 2; }
printf 'Creating a production logical backup (no writes to production) ...\n'
pg_dump --format=custom --no-owner --no-acl --file="$backup" "$DANA_671_SOURCE_URL"
[[ -s "$backup" ]] || { echo 'Backup file is missing or empty' >&2; exit 1; }
pg_restore --list "$backup" > "$artifacts/backup-contents.txt"
[[ -s "$artifacts/backup-contents.txt" ]] || { echo 'Backup TOC is empty' >&2; exit 1; }
sha256sum "$backup" > "$backup.sha256"
printf 'Restoring backup to the verified EMPTY isolated database ...\n'
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$DANA_671_REHEARSAL_URL" "$backup"

psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" \
  -f db/release/671-facet-preservation-fingerprints.sql > "$artifacts/fingerprints-before.txt"
printf 'Applying migrations to the isolated rehearsal database ...\n'
npx --no-install tsx db/release/671-apply-migrations.ts
psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" \
  -f db/release/671-facet-preservation-fingerprints.sql > "$artifacts/fingerprints-after.txt"
diff -u "$artifacts/fingerprints-before.txt" "$artifacts/fingerprints-after.txt" > "$artifacts/fingerprint-diff.txt" || {
  echo 'BLOCKED: original content or IDs changed; inspect fingerprint-diff.txt' >&2; exit 1;
}
psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" \
  -f db/release/671-facet-association-checks.sql > "$artifacts/facet-associations.txt"
awk -F '|' '
  NF == 2 && $2 ~ /^[0-9]+$/ { checks++; if ($2 != 0) { print "Failed association check: " $1 > "/dev/stderr"; failed=1 } }
  END { if (checks != 8) { print "Expected 8 association checks, received " checks > "/dev/stderr"; failed=1 }; exit failed }
' "$artifacts/facet-associations.txt" || {
  echo 'BLOCKED: Facet association checks failed' >&2; exit 1;
}
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DANA_671_REHEARSAL_URL" -c "SELECT to_regclass('public.page_facets') IS NOT NULL")" == t ]] || {
  echo 'BLOCKED: missing page_facets on target' >&2; exit 1;
}
printf 'PASSED: restored, migrated, row fingerprints unchanged, association checks zero.\n'
printf 'Backup and diagnostic files: %s\n' "$artifacts"
printf 'This DOES NOT approve production deployment; complete app-level and rollback checks.\n'
