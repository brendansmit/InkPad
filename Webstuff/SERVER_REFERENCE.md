# Server Reference

## The droplet

| | |
|---|---|
| Provider | DigitalOcean |
| IP | 167.172.71.219 |
| OS | Ubuntu 24.04 LTS |
| Region | SGP1 (Singapore) |
| SSH command | `ssh -i ~/.ssh/id_ed25519 root@167.172.71.219` |
| SSH key | `~/.ssh/id_ed25519` |
| Domain | inkheron.app (DNS via DigitalOcean) |

## Live sites

| Site | PM2 name | Port | URL |
|---|---|---|---|
| Speed Dating | `speed-dating` | 3464 | https://speeddating.inkheron.app |
| Grammar Arcade | `grammar-arcade` | 3465 | https://eap.inkheron.app |
| AP Lang | `ap-lang` | — | (internal) |

Next free port: **3466+**

## Stack

- **Reverse proxy:** nginx (ports 80/443) — configs in `/etc/nginx/sites-enabled/`
- **SSL:** Let's Encrypt via certbot, auto-renewing
- **Process manager:** PM2 (Node apps)
- **Node:** nvm, Node 22, lives at `/root/.nvm/versions/node/v22.x.x/bin/node`
- **App code:** `/var/www/APP-NAME/`

## CRITICAL: Caddy conflict

InkHeron-Platform's build spec mentions Caddy. **Caddy cannot run alongside nginx on ports 80/443.**
Before starting Caddy: stop nginx first and migrate all nginx configs to Caddy.
Forgetting this takes down every site instantly.

## Nginx pattern for a new subdomain

```nginx
server {
    listen 80;
    server_name APPNAME.inkheron.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name APPNAME.inkheron.app;
    ssl_certificate /etc/letsencrypt/live/APPNAME.inkheron.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/APPNAME.inkheron.app/privkey.pem;
    location / {
        proxy_pass http://localhost:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After editing: `nginx -t && systemctl reload nginx`

## Deploy a Node app

```bash
# Local
git push origin main

# Remote
ssh -i ~/.ssh/id_ed25519 root@167.172.71.219 \
  "cd /var/www/APP-NAME && git pull && npm install --omit=dev && pm2 restart APP-NAME"
```

## SSL for a new subdomain

```bash
# Add A record in DigitalOcean DNS first, wait 2-5 min, then:
certbot --nginx -d APPNAME.inkheron.app
```

## Secrets

- Stored in `.env` in each app's root on the droplet
- Never committed to git
- Copy to server: `scp -i ~/.ssh/id_ed25519 .env root@167.172.71.219:/var/www/APP-NAME/.env`

## If SSH stops working

Your public key is on GitHub. From the recovery console:
```bash
cd ~/.ssh
wget -O authorized_keys https://github.com/brendansmit.keys
chmod 600 authorized_keys
```
That's it. No typing the key manually.

## Useful commands

```bash
pm2 list                          # see all apps
pm2 logs APP-NAME --lines 60      # tail logs
pm2 restart APP-NAME              # restart one app
pm2 restart all                   # restart everything
pm2 save                          # persist list across reboots
systemctl status nginx            # check nginx
systemctl reload nginx            # reload after config change
nginx -t                          # test config before reloading
journalctl -xeu nginx.service     # nginx error detail
lsof -i :80                       # see what's holding port 80
```
