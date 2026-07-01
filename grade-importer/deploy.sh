#!/usr/bin/env bash
# Deploy Grade Importer to admin.inkheron.app
# Usage: ./deploy.sh [SYNC_KEY]
# Run from the project root (Documents/Claude/)

set -e

SERVER="root@167.172.71.219"
SSH="ssh -i ~/.ssh/id_ed25519"
SCP="scp -i ~/.ssh/id_ed25519"
REMOTE_DIR="/var/www/grade-importer"
LOCAL_DIR="$(dirname "$0")"
SYNC_KEY="${1:-}"
ADMIN_PASS="${2:-}"

if [[ -z "$SYNC_KEY" ]]; then
  echo "Usage: ./deploy.sh <sync-key> [admin-password]"
  echo "  sync-key     — shared secret used by both local and server for /api/sync auth"
  echo "  admin-password — nginx basic auth password for admin.inkheron.app (optional if already set)"
  exit 1
fi

echo "==> Syncing files to server..."
rsync -avz --exclude '*.pyc' --exclude '__pycache__' --exclude 'grades.db' --exclude '.env*' \
  -e "ssh -i ~/.ssh/id_ed25519" \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

echo "==> Installing Python dependencies..."
$SSH $SERVER "pip3 install --break-system-packages --ignore-installed flask xlrd xlutils pypinyin requests 2>&1 | tail -5"

echo "==> Initialising database and setting sync key..."
$SSH $SERVER "cd $REMOTE_DIR && python3 -c \"
import database
database.init_db()
database.set_setting('sync_key', '$SYNC_KEY')
database.set_setting('sync_url', '')
print('DB ready. sync_key set.')
\""

echo "==> Starting / restarting via PM2..."
$SSH $SERVER "cd $REMOTE_DIR && pm2 delete grade-importer 2>/dev/null || true && pm2 start ecosystem.config.cjs && pm2 save"

echo "==> Writing nginx config..."
$SSH $SERVER "cat > /etc/nginx/sites-available/admin.inkheron.app << 'NGINX'
server {
    listen 80;
    server_name admin.inkheron.app;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name admin.inkheron.app;

    ssl_certificate     /etc/letsencrypt/live/admin.inkheron.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.inkheron.app/privkey.pem;

    # Sync API — no basic auth (uses Bearer token instead)
    location /api/sync {
        proxy_pass http://localhost:5051;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Everything else — basic auth
    location / {
        auth_basic \"Grade Importer\";
        auth_basic_user_file /etc/nginx/.htpasswd-admin;
        proxy_pass http://localhost:5051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX"

$SSH $SERVER "ln -sf /etc/nginx/sites-available/admin.inkheron.app /etc/nginx/sites-enabled/"

if [[ -n "$ADMIN_PASS" ]]; then
  echo "==> Setting nginx basic auth password..."
  $SSH $SERVER "echo 'admin:$(openssl passwd -apr1 "$ADMIN_PASS")' > /etc/nginx/.htpasswd-admin"
else
  echo "==> Skipping basic auth password (pass as 3rd arg or set manually with:"
  echo "    ssh $SERVER \"echo 'admin:\$(openssl passwd -apr1 YOUR_PASSWORD)' > /etc/nginx/.htpasswd-admin\""
fi

echo "==> Issuing SSL certificate..."
$SSH $SERVER "certbot --nginx -d admin.inkheron.app --non-interactive --agree-tos -m brendansmit1@gmail.com 2>&1 | tail -5" || \
  echo "(SSL cert may already exist — check manually if needed)"

echo "==> Reloading nginx..."
$SSH $SERVER "nginx -t && systemctl reload nginx"

echo ""
echo "✓ Deployed to https://admin.inkheron.app"
echo ""
echo "Next: configure your local app at http://localhost:5050 → Settings → Sync"
echo "  Server URL: https://admin.inkheron.app"
echo "  Sync key:   $SYNC_KEY"
