# Server context

Drop this whole file into a chat when you want help deploying a new app to my
server. It describes the two machines, the conventions every app follows, and
the mistakes that have already cost me an outage.

There are TWO droplets. They do not share a proxy, a process manager, or a
deploy method. Check which one an app lives on before touching anything.

## Droplet 1 — `167.172.71.219`

- DigitalOcean droplet, Ubuntu
- SSH as `root` (key auth): `ssh root@167.172.71.219`
- Domain `inkheron.app`, each app on its own subdomain
- nginx as the only public-facing service (ports 80 and 443)
- Let's Encrypt certificates, auto-renewed by certbot
- PM2 runs and restarts every Node app; InkPad runs under systemd
  (`inkheron-wrapper`)
- Node `v24.18.0` at `/usr/bin/node`, npm `11.16.0`

Nothing except nginx listens on a public port. Every app binds a high local
port and nginx reverse-proxies a subdomain to it.

## Droplet 2 — `165.22.242.91`

- SSH as `root` (key auth): `ssh root@165.22.242.91`
- **Caddy, inside Docker, owns 80 and 443.** Host nginx is installed but
  INACTIVE. Do not start it: two proxies cannot share those ports.
- The Caddyfile lives at `/opt/healthspan/Caddyfile` (historical location; it
  routes all four sites, not just healthspan). Editing it means
  `docker compose -f /opt/healthspan/docker-compose.yml up -d caddy`.
- Caddy issues its own certificates. certbot is not involved here.
- Most apps are Docker Compose services. The Serve panel is the exception: it
  is a host process under pm2, reached from Caddy over
  `host.docker.internal:3469`, which is why that compose file sets
  `extra_hosts: host.docker.internal:host-gateway`.

| App | Domain | How it runs | Directory |
|---|---|---|---|
| mosaic | mosaic.inkheron.app | compose service `web` | /opt/mosaic |
| healthspan | healthspan.inkheron.app | compose service `app` | /opt/healthspan |
| smitrecipes | smitrecipes.inkheron.app | compose service `app`, `-f docker-compose.deploy.yml` | /opt/smitrecipes |
| inkheron-serve | serve.inkheron.app | pm2, host process, port 3469 | /opt/admin-platform |

Port 3469 binds `0.0.0.0` so Caddy can reach it across the bridge, and ufw
allows it only from `172.16.0.0/12` (the Docker subnets). Do not open it
wider.

## The two control surfaces

Both do the same three things (status, restart, deploy) for both droplets.

- **Deploy Dashboard**, on the Mac, `http://localhost:5095`, launched from the
  app launcher. Full reach: it holds the GitHub credentials and is the only
  thing that can rsync code up.
- **Serve panel**, `https://serve.inkheron.app`, for doing it from a phone.
  Password login, then a second secret unlocks actions for 15 minutes, then a
  typed hostname confirms each one. Everything is written to an audit log.

The Serve panel runs on droplet 2 and reaches droplet 1 over a **restricted
key**: `/root/.ssh/id_serve_remote`, forced to run
`/usr/local/bin/serve-remote` (source: `Admin/serve/ops/serve-remote`). That
wrapper accepts only `<verb> <app>` pairs from a fixed table and refuses
everything else, so the panel cannot run arbitrary commands on droplet 1 even
if it is fully compromised. To add an app to the panel, add it to that table
AND to `Admin/serve/config.js`.

## What is already running on droplet 1

| App | Domain | Port | Directory | Entry point |
|---|---|---|---|---|
| speed-dating | speeddating.inkheron.app | 3464 | /var/www/speed-dating | server.js |
| ap-lang | (internal) | 3474 | /var/www/ap-lang-dashboard | server.js |
| grammar-arcade | (internal) | - | /var/www/grammar-arcade | tsx CLI |
| eap-platform | eap.inkheron.app | 3465, 3466 | /opt/eap-platform | src/server.js |
| admin-platform | admin.inkheron.app | 5051 | /opt/admin-platform | src/server.js |
| grade-importer | (internal) | - | /var/www/grade-importer | app.py (Python) |
| InkPad | inkpad.inkheron.app | 3000, 9001 | - | - |
| lang | lang.inkheron.app | 3002 | - | - |

Pick a free port for anything new. `ss -tlnp` on the droplet shows what is
taken.

## Deploying a new app

1. Push the code to a GitHub repo.
2. On the droplet: `git clone` into `/var/www/<app>`.
3. `npm install --omit=dev`, then read the "native modules" section below,
   because this step lies to you.
4. Start it: `pm2 start server.js --name <app>` then `pm2 save`.
5. Write the nginx site file (template below), symlink it into
   `sites-enabled`, `nginx -t`, `systemctl reload nginx`.
6. Get a certificate: `certbot --nginx -d <sub>.inkheron.app`.

Deploying an update to an existing app:

```bash
ssh root@167.172.71.219 'cd /var/www/<app> && git pull && npm install --omit=dev && pm2 restart <app>'
```

## nginx site template

```nginx
server {
    server_name <sub>.inkheron.app;

    location / {
        # 127.0.0.1, NOT localhost. See the trap below.
        proxy_pass http://127.0.0.1:<PORT>;
        proxy_http_version 1.1;

        # Required for WebSockets.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

certbot rewrites this file to add the TLS block and an HTTP redirect. Let it.

## Traps that have actually bitten me

### 1. Never write `proxy_pass http://localhost:PORT`

`localhost` resolves to both `127.0.0.1` and `[::1]`. A Node app listening on
`0.0.0.0` is IPv4 only, so nginx round-robins onto the IPv6 address and that
half of the requests get connection-refused. The symptom is a maddening
intermittent 502, roughly 8% of requests, with no application error at all.

Always `127.0.0.1`. `lang.inkheron.app` had this bug and was fixed on
2026-08-16.

### 2. npm 11 silently skips native module builds

npm 11 gates package install scripts behind an approval prompt. During
`npm install` it prints a warning like:

```
npm warn allow-scripts   better-sqlite3@12.11.1 (install: node-gyp rebuild)
```

and then does not run `node-gyp rebuild`. The stale prebuilt binary from
whatever Node version it was last built against stays in place. Because the
droplet runs Node 24 (NODE_MODULE_VERSION 137) and most binaries were built
for Node 20 (115), the app dies at startup with `ERR_DLOPEN_FAILED` and PM2
crash-loops it. Every route returns 502.

Fix, for any app using `better-sqlite3`, `bcrypt`, or similar:

```bash
npm approve-scripts --allow-scripts-pending
npm rebuild better-sqlite3 --update-binary --foreground-scripts
npm rebuild bcrypt --foreground-scripts
pm2 restart <app>
```

After any deploy, check `pm2 jlist` and look at the restart counter. If it is
climbing, it is crash-looping, and this is the first thing to check.

### 3. Fastify apps need `trustProxy`

Behind nginx, `request.ip` is the proxy's address unless you enable it:

```js
const app = fastify({ logger: false, trustProxy: true });
```

With `trustProxy` on, Fastify parses `X-Forwarded-For` correctly and
`request.ip` is the real client. Do NOT read the header yourself and take
`split(',')[0]` — nginx appends to any header the client sent, so the first
value is attacker-controlled and any rate limiter built on it is bypassable.

### 4. Static file serving needs an allowlist, not a denylist

If an app serves files off disk, allow only the directories that are meant to
be public and 403 everything else. A denylist misses something eventually, and
that something is `events.db` or `.env`.

Verify after every deploy that the private paths really are private:

```bash
for p in /events.db /.env /server.js /package.json; do curl -s -o /dev/null -w "$p %{http_code}\n" https://<sub>.inkheron.app$p; done
```

Expect 403 on all of them.

### 5. Not every app on the droplet can `git pull`

Only three of droplet 1's apps have a git remote on the droplet: `ap-lang`,
`speed-dating` and `grammar-arcade`. Everything else was rsynced up from the
Mac and has no remote to pull from, so a "deploy" that runs `git pull` there
does nothing useful. `/opt/mosaic` on droplet 2 is not a git repo at all. Both
control surfaces say so per app rather than offering a button that cannot
work.

### 6. Exit codes lie about whether an app is up

`pm2 jlist` exits 0 whatever state the app is in, and `docker compose ps`
exits 0 with empty output when the container is down. Checking the exit code
alone reports a dead app as healthy. Parse the pm2 list for the app's real
status, and use `docker compose ps -q --status running <svc>` and treat empty
output as down.

Same class of bug on the health-check side: a python.org framework build ships
no CA bundle, so every HTTPS check fails with `CERTIFICATE_VERIFY_FAILED` and
falls through to the process check. Point `ssl.create_default_context` at
`certifi.where()`.

## Secrets

Every app keeps its secrets in a git-ignored `.env` in its own directory.
`.env` is never committed, never pasted into a chat, never put in code.
Databases (`events.db` and friends) are git-ignored too, so `git pull` on the
droplet never touches live data.

Never put a token in a git remote URL. `/opt/healthspan` had a GitHub PAT
sitting in plaintext in `.git/config`; it now uses per-repo SSH deploy keys
(`/root/.ssh/id_github_verax`, `/root/.ssh/id_github_smitrecipes`) with host
aliases in `/root/.ssh/config`. GitHub refuses the same deploy key on two
repos, which is why there are two.

## Useful commands

Droplet 1:

```bash
pm2 list                      # what is running
pm2 logs <app> --lines 50     # app output
pm2 restart <app>
pm2 jlist                     # JSON status, includes restart counter
nginx -t && systemctl reload nginx
tail -50 /var/log/nginx/error.log
ss -tlnp                      # which ports are in use
```

Droplet 2:

```bash
docker compose -f /opt/healthspan/docker-compose.yml ps
docker compose -f /opt/healthspan/docker-compose.yml logs --tail 50 caddy
docker compose -f /opt/healthspan/docker-compose.yml up -d caddy   # after a Caddyfile edit
pm2 logs inkheron-serve --lines 50
ufw status
```
