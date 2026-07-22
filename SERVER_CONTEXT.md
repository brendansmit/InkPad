# Server Context

Paste this into any AI session before asking it to deploy or configure an app on my server.

---

## The server

| | |
|---|---|
| Provider | DigitalOcean droplet |
| IP | 167.172.71.219 |
| OS | Ubuntu (root access) |
| SSH key | `~/.ssh/id_ed25519` |
| SSH command | `ssh -i ~/.ssh/id_ed25519 root@167.172.71.219` |
| Domain | inkheron.app (DNS managed in DigitalOcean) |
| SSL | Let's Encrypt via certbot, auto-renewing |
| Reverse proxy | nginx |
| Process manager | PM2 (Node), systemd for nginx |
| Node runtime | nvm, Node 20 (`/root/.nvm/versions/node/v20.x.x/bin/node`) |

---

## What's already running

| App | PM2 name | Local port | Public URL |
|---|---|---|---|
| Speed Dating | `speed-dating` | 3464 | https://speeddating.inkheron.app |
| Grammar Arcade | `grammar-arcade` | 3465 | https://eap.inkheron.app |

---

## How nginx is configured

Each app gets a subdomain on inkheron.app. nginx proxies that subdomain to the app's local port. SSL is terminated at nginx — the Node/Python app itself runs plain HTTP on localhost only.

Config files live at `/etc/nginx/sites-enabled/`. Pattern for a new app:

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

The `Upgrade`/`Connection` headers are required because some apps use WebSockets.

After editing nginx config:
```bash
nginx -t && systemctl reload nginx
```

---

## How SSL certificates are issued

```bash
certbot --nginx -d APPNAME.inkheron.app
```

Certbot edits the nginx config automatically and adds auto-renewal via a systemd timer.

---

## How apps are deployed

### Node apps (current pattern — speed-dating)

1. Code lives locally at `~/Documents/Claude/APP-NAME/`
2. Git remote is `git@github.com:...` (or origin on the droplet)
3. On the droplet: code lives at `/var/www/APP-NAME/`
4. PM2 runs `node server.js` (or whatever the entry point is)

Deploy sequence:
```bash
# Local
git push origin main

# Remote (via SSH)
cd /var/www/APP-NAME && git pull && npm install --omit=dev && pm2 restart APP-NAME
```

One-liner:
```bash
ssh -i ~/.ssh/id_ed25519 root@167.172.71.219 \
  "cd /var/www/APP-NAME && git pull && npm install --omit=dev && pm2 restart APP-NAME"
```

### First-time setup for a new app on the droplet

```bash
# On the droplet
cd /var/www
git clone REPO_URL APP-NAME
cd APP-NAME
npm install --omit=dev

# Start with PM2 and save so it survives reboots
pm2 start server.js --name APP-NAME
pm2 save
```

### Python/Flask apps

Same pattern but use:
```bash
pip install -r requirements.txt
pm2 start "python3 app.py" --name APP-NAME
```

---

## Useful PM2 commands

```bash
pm2 list                        # see all running processes
pm2 logs APP-NAME --lines 60    # tail logs
pm2 restart APP-NAME            # restart
pm2 stop APP-NAME               # stop
pm2 delete APP-NAME             # remove from PM2
pm2 save                        # persist current process list across reboots
pm2 startup                     # (re-)install the systemd boot hook
```

---

## Port allocation (keep updated)

| Port | App |
|---|---|
| 3464 | speed-dating |
| 3465 | grammar-arcade |
| _next available_ | 3466+ |

Pick the next free port when adding a new app. Do not reuse ports.

---

## DNS

DNS is managed in the DigitalOcean control panel under the `inkheron.app` domain. To add a subdomain for a new app:

1. Log into DigitalOcean → Networking → Domains → inkheron.app
2. Add an **A record**: hostname = `APPNAME`, value = `167.172.71.219`, TTL = 3600
3. Wait 1-5 min for propagation, then run certbot

---

## Environment variables / secrets

- Secrets live in a `.env` file in the app root on the droplet
- `.env` is git-ignored and never committed
- Copy to the droplet manually via scp: `scp -i ~/.ssh/id_ed25519 .env root@167.172.71.219:/var/www/APP-NAME/.env`
- Apps read `.env` via `dotenv` (Node) or `python-dotenv` / `os.environ` (Python)

**Never paste secrets into chat or commit them.**

---

## Local launcher integration

New apps should also be registered in the local launcher at `~/Documents/Claude/launcher/apps.json`:

```json
"your-app-id": {
  "runtime": "node",
  "entry": "server.js",
  "cwd": "your-app",
  "port": PORT,
  "url": "http://localhost:PORT"
}
```

And added to the APPS array in `launcher/launcher.html`. See `launcher/CLAUDE.md` for the full process.
