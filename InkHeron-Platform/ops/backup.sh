#!/usr/bin/env bash
set -euo pipefail

APP_DB="${APP_DB:-/opt/inkheron-platform/data/inkheron.db}"
ETHERPAD_DB="${ETHERPAD_DB:-/opt/etherpad-lite/var/etherpad.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/inkheron}"
KEY_FILE="${KEY_FILE:-/etc/inkheron/backup.key}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
archive="${BACKUP_DIR}/inkheron-${timestamp}.tar.gz.enc"

cleanup() {
  rm -rf "${workdir}"
}
trap cleanup EXIT

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

require_file "${APP_DB}"
require_file "${ETHERPAD_DB}"
require_file "${KEY_FILE}"

install -d -m 700 "${BACKUP_DIR}"

sqlite3 "${APP_DB}" ".backup '${workdir}/inkheron.db'"
sqlite3 "${ETHERPAD_DB}" ".backup '${workdir}/etherpad.sqlite'"

cat > "${workdir}/manifest.txt" <<MANIFEST
created_at=${timestamp}
app_db=${APP_DB}
etherpad_db=${ETHERPAD_DB}
host=$(hostname)
MANIFEST

tar -C "${workdir}" -czf - inkheron.db etherpad.sqlite manifest.txt \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:${KEY_FILE}" -out "${archive}"

chmod 600 "${archive}"

find "${BACKUP_DIR}" -type f -name 'inkheron-*.tar.gz.enc' -mtime "+${RETENTION_DAYS}" -delete

echo "${archive}"
