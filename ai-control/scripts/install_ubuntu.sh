#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/ai-control

if ! id ai-control >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin ai-control
fi

mkdir -p "$APP_DIR"
rsync -a --delete ./ "$APP_DIR"/
chown -R ai-control:ai-control "$APP_DIR"
chmod 700 "$APP_DIR"

if [ ! -f /etc/ai-control.env ]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat >/etc/ai-control.env <<ENV
AI_CONTROL_PASSWORD=change-this-now
AI_CONTROL_SESSION_SECRET=$SESSION_SECRET
ENV
  chmod 600 /etc/ai-control.env
fi

cp "$APP_DIR/systemd/ai-control.service" /etc/systemd/system/ai-control.service
systemctl daemon-reload
systemctl enable --now ai-control

echo "Installed ai-control on 127.0.0.1:8099."
echo "Edit /etc/ai-control.env and $APP_DIR/config/projects.json before real use."
