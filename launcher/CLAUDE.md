# Launcher — rules for adding apps

## How to add a new app (the only correct way)

**Step 1 — add to `apps.json`**

```json
"your-app-id": {
  "runtime": "node",
  "entry": "your-app/src/index.js",
  "cwd": "your-app",
  "port": 3472,
  "url": "http://localhost:3472",
  "env": { "PORT": "3472" }
}
```

Runtime options: `"node"` | `"python_flask"` | `"python_venv"` | `"open"`
- `node` → uses the NVM node binary defined in launcher_server.py
- `python_flask` → system Python 3.12
- `python_venv` → Writing Analyzer venv if it exists, else system Python
- `open` → just opens a local file; use `"path"` instead of entry/cwd/port/url

If your app needs extra env vars (e.g. a non-default PORT), add `"env": {}`.

**Step 2 — add to `launcher.html` APPS array**

The `id` field MUST exactly match the key you used in apps.json.

```js
{ id: "your-app-id", name: "Your App", desc: "One line description", num: "09" }
```

Update the grid CSS card placements and the sidebar "N tools" count.

**Step 3 — done. No server restart needed.**

The launcher server reads apps.json fresh on every /launch request. There is no in-memory dict to update, no process to kill, no port conflict to fight.

---

## Why this design exists

Previous approach: app definitions were a Python dict compiled into memory at startup.
Result: every time a new app was added, the running launcher server didn't know about it →
"unknown app" error. Restarting to fix it caused "port already in use" because the old
process was still alive. This happened every single time.

Current approach: apps.json is the source of truth, read live. The server process never
needs to be restarted to pick up new apps.

---

## If you need to restart the launcher server

The only reasons you'd need to restart: changing Python code in launcher_server.py itself
(not just adding apps), or the process crashed.

The server runs with `use_reloader=True` so changes to launcher_server.py auto-restart it.

If the port is stuck in use:
```bash
lsof -ti :5099 | xargs kill
```
Then restart via the Claude Code launcher panel.

There is also a `/shutdown` POST endpoint if you need a clean stop.

---

## Aliases

Add aliases under `"_aliases"` in apps.json:
```json
"_aliases": {
  "your-alias": "your-app-id"
}
```
