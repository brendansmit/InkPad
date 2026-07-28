# Server context

Drop this whole file into a chat when you want help deploying a new app to my
server. It describes the machine, the conventions every app follows, and the
mistakes that have already cost me an outage.

## The machine

- DigitalOcean droplet, Ubuntu, IP `167.172.71.219`
- SSH as `root` (key auth): `ssh root@167.172.71.219`
- Domain `inkheron.app`, each app on its own subdomain
- nginx as the only public-facing service (ports 80 and 443)
- Let's Encrypt certificates, auto-renewed by certbot
- PM2 runs and restarts every Node app
- Node `v24.18.0` at `/usr/bin/node`, npm `11.16.0`

Nothing except nginx listens on a public port. Every app binds a high local
port and nginx reverse-proxies a subdomain to it.

## What is already running

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

Always `127.0.0.1`. `lang.inkheron.app` still has this bug and should be fixed
next time it is touched.

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

## Secrets

Every app keeps its secrets in a git-ignored `.env` in its own directory.
`.env` is never committed, never pasted into a chat, never put in code.
Databases (`events.db` and friends) are git-ignored too, so `git pull` on the
droplet never touches live data.

## Useful commands

```bash
pm2 list                      # what is running
pm2 logs <app> --lines 50     # app output
pm2 restart <app>
pm2 jlist                     # JSON status, includes restart counter
nginx -t && systemctl reload nginx
tail -50 /var/log/nginx/error.log
ss -tlnp                      # which ports are in use
```
