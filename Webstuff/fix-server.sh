#!/bin/bash
# Quick server fix script
# Run from your Mac: bash ~/Documents/Claude/Webstuff/fix-server.sh

SERVER="root@167.172.71.219"
KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $KEY $SERVER"

echo "Connecting to server..."

$SSH bash << 'REMOTE'

echo ""
echo "=== PM2 STATUS ==="
pm2 list

echo ""
echo "=== NGINX STATUS ==="
systemctl is-active nginx

echo ""
echo "=== PORT 80/443 ==="
lsof -i :80 -i :443 2>/dev/null | grep LISTEN

echo ""
echo "=== FIXING ==="

# Kill anything that isn't nginx on port 80/443
PORT80_CMD=$(lsof -ti :80 2>/dev/null)
if [ -n "$PORT80_CMD" ]; then
  PORT80_NAME=$(ps -p $PORT80_CMD -o comm= 2>/dev/null)
  if [ "$PORT80_NAME" != "nginx" ]; then
    echo "Stopping $PORT80_NAME (PID $PORT80_CMD) on port 80..."
    systemctl stop $PORT80_NAME 2>/dev/null || kill $PORT80_CMD 2>/dev/null
  fi
fi

# Ensure nginx is running
if ! systemctl is-active --quiet nginx; then
  echo "Starting nginx..."
  systemctl start nginx
  nginx -t && echo "nginx OK" || echo "nginx config error — run: nginx -t"
else
  echo "nginx already running"
fi

# Restart any stopped PM2 apps
STOPPED=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
apps=json.load(sys.stdin)
stopped=[a['name'] for a in apps if a['pm2_env']['status']!='online']
print('\n'.join(stopped))
" 2>/dev/null)

if [ -n "$STOPPED" ]; then
  echo "Restarting stopped apps: $STOPPED"
  echo "$STOPPED" | while read app; do pm2 restart "$app"; done
  pm2 save
else
  echo "All PM2 apps online"
fi

echo ""
echo "=== FINAL STATUS ==="
pm2 list
echo ""
systemctl is-active nginx && echo "nginx: running" || echo "nginx: STOPPED"

REMOTE
