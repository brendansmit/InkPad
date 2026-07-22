#!/usr/bin/env bash
#
# InkHeron droplet deploy: pull code from GitHub, ship it, keep data safe.
#
# Data safety is the whole point of this script:
#   - The live SQLite database (data/inkheron.db), library uploads
#     (data/eap-library/uploads) and the env/secrets file all live under the
#     runtime dir and are NEVER in git and NEVER synced. Nothing here can
#     overwrite them.
#   - Only src, migrations and public are copied from the repo into the
#     runtime. The database is backed up before every restart.
#   - Migrations are additive and self-apply on restart (openDatabase runs
#     runMigrations, which only runs new migrations, each in a transaction).
#   - This script never runs `git clean`, never touches data/, never deletes
#     the database.
#
# Usage on the droplet:
#   /opt/inkheron-platform/deploy/deploy.sh [branch]
# Default branch is analysis-ai (the production line).
#
# One-time setup is described in deploy/DEPLOY.md.

set -euo pipefail

BRANCH="${1:-analysis-ai}"
REPO_DIR="${INKHERON_REPO_DIR:-/opt/inkheron-repo}"     # git clone of the private InkPad repo
APP_DIR="${INKHERON_APP_DIR:-/opt/inkheron-platform}"   # live runtime dir (holds data/)
APP_SUBDIR="InkHeron-Platform"                          # the app lives in this subdir of the monorepo
SERVICE="${INKHERON_SERVICE:-inkheron-wrapper}"
APP_USER="${INKHERON_USER:-inkheron}"
HEALTH_URL="${INKHERON_HEALTH_URL:-http://127.0.0.1:3000/login}"
KEEP_BACKUPS="${INKHERON_KEEP_BACKUPS:-20}"

DB="$APP_DIR/data/inkheron.db"
BACKUP_DIR="$APP_DIR/data/backups"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null   || fail "git not found"
command -v rsync >/dev/null || fail "rsync not found"
[ -d "$REPO_DIR/.git" ] || fail "repo clone not found at $REPO_DIR (see deploy/DEPLOY.md)"
[ -d "$APP_DIR" ]       || fail "app dir not found at $APP_DIR"

# 1. Back up the live database first. Cheap (single file), never skipped.
if [ -f "$DB" ]; then
  mkdir -p "$BACKUP_DIR"
  TS="$(date +%Y%m%d-%H%M%S)"
  cp "$DB" "$BACKUP_DIR/inkheron.db.pre-deploy-$TS"
  log "database backed up -> $BACKUP_DIR/inkheron.db.pre-deploy-$TS"
  # Keep only the newest $KEEP_BACKUPS backups.
  ls -1t "$BACKUP_DIR"/inkheron.db.pre-deploy-* 2>/dev/null \
    | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f
else
  log "no database yet at $DB (first deploy?), skipping backup"
fi

# 2. Fetch the exact target commit from GitHub. reset --hard only affects the
#    separate repo clone, which holds no data.
log "fetching origin/$BRANCH"
git -C "$REPO_DIR" fetch --prune origin
git -C "$REPO_DIR" checkout -B "$BRANCH" "origin/$BRANCH" >/dev/null 2>&1
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
log "repo at $BRANCH ($COMMIT)"

SRC="$REPO_DIR/$APP_SUBDIR"
[ -d "$SRC/src" ] || fail "expected app subdir $SRC not found in repo"

# 3. Ship ONLY code dirs into the runtime. --delete mirrors the repo so removed
#    files disappear, but data/ is outside these paths so it is never touched.
for d in src migrations public; do
  rsync -a --delete "$SRC/$d/" "$APP_DIR/$d/"
done
# Ship package manifests too (deps may have changed).
cp "$SRC/package.json" "$APP_DIR/package.json"
[ -f "$SRC/package-lock.json" ] && cp "$SRC/package-lock.json" "$APP_DIR/package-lock.json"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/src" "$APP_DIR/migrations" "$APP_DIR/public" 2>/dev/null || true

# 4. Install production deps only when package.json actually changed.
if ! cmp -s "$APP_DIR/.deployed-package.json" "$APP_DIR/package.json"; then
  log "package.json changed, installing production deps"
  ( cd "$APP_DIR" && npm ci --omit=dev )
  cp "$APP_DIR/package.json" "$APP_DIR/.deployed-package.json"
else
  log "dependencies unchanged"
fi

# 5. Restart. Migrations self-apply on boot (additive only).
log "restarting $SERVICE"
systemctl restart "$SERVICE"

# 6. Health check. If it fails, the pre-deploy backup is in $BACKUP_DIR.
sleep 2
if curl -fsS -o /dev/null "$HEALTH_URL"; then
  log "OK: $SERVICE healthy at $COMMIT"
else
  fail "health check failed at $HEALTH_URL. Code is at $COMMIT; database backup is in $BACKUP_DIR. Check: journalctl -u $SERVICE -n 50"
fi
