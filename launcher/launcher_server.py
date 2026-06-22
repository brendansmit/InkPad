import json, subprocess, socket, time, os, signal
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")
ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_JSON = os.path.join(os.path.dirname(__file__), "apps.json")

PY_FLASK = "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
PY_VENV  = os.path.join(ROOT, "Writing analyzer", ".venv", "bin", "python")
NODE     = "/Users/brendansmit/.nvm/versions/node/v20.20.2/bin/node"

RUNTIMES = {
    "node":         NODE,
    "python_flask": PY_FLASK,
    "python_venv":  None,   # resolved at call time
}


# ── helpers ──────────────────────────────────────────────────────────

def _port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0

def _wait(port, timeout=12):
    for _ in range(timeout * 5):
        if _port_open(port): return True
        time.sleep(0.2)
    return False

def _bg(cmd, cwd, env=None):
    merged = {**os.environ, **(env or {})}
    subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=merged)

def _open(url):
    subprocess.Popen(["open", url])

def _launch_server(cmd, cwd, port, url, env=None):
    if not _port_open(port):
        _bg(cmd, cwd, env=env)
        if not _wait(port):
            raise RuntimeError(f"server did not start on port {port}")
    _open(url)


# ── config loader (read fresh on every /launch call) ─────────────────
#
# THIS IS THE CRITICAL DESIGN. App definitions live in apps.json, not
# in Python memory. The server reads the file on each request so you
# NEVER need to restart it to add or change an app. Just edit apps.json.
#
# To add a new app:
#   1. Add an entry to apps.json (runtime/entry/cwd/port/url/env).
#   2. Add the card to launcher.html APPS array with the same id.
#   3. That's it. No server restart. No Python changes.
#
# Runtime values: "node" | "python_flask" | "python_venv" | "open"
# For "open" set "path" (relative to ROOT) instead of entry/cwd/port/url.
# Optional "env": {} sets extra env vars when starting the process.

def _load_cfg(app_id):
    with open(APPS_JSON) as f:
        data = json.load(f)
    aliases = data.get("_aliases", {})
    resolved_id = aliases.get(app_id, app_id)
    return data.get(resolved_id)

def _dispatch(cfg):
    runtime = cfg.get("runtime")

    if runtime == "open":
        _open(os.path.join(ROOT, cfg["path"]))
        return

    if runtime == "python_venv":
        exe = PY_VENV if os.path.exists(PY_VENV) else PY_FLASK
    else:
        exe = RUNTIMES.get(runtime)
        if not exe:
            raise RuntimeError(f"unknown runtime: {runtime}")

    cwd  = os.path.join(ROOT, cfg["cwd"])
    cmd  = [exe, cfg["entry"]]
    env  = cfg.get("env")
    port = cfg.get("port")
    url  = cfg.get("url")

    if port and url:
        _launch_server(cmd, cwd, port, url, env=env)
    else:
        _bg(cmd, cwd, env=env)


# ── routes ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(os.path.dirname(__file__), "launcher.html")

@app.route("/logo")
def logo():
    return send_from_directory("/Users/brendansmit/Documents/InkHeron", "Logo.png")

@app.route("/launch/<app_id>")
def launch(app_id):
    try:
        cfg = _load_cfg(app_id)
    except Exception as e:
        return jsonify({"ok": False, "error": f"could not read apps.json: {e}"}), 500

    if not cfg:
        return jsonify({"ok": False, "error": f"unknown app '{app_id}' — add it to launcher/apps.json"}), 404

    try:
        _dispatch(cfg)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/shutdown", methods=["POST"])
def shutdown():
    os.kill(os.getpid(), signal.SIGTERM)
    return jsonify({"ok": True, "message": "shutting down"})


if __name__ == "__main__":
    app.run(port=5099, debug=False, use_reloader=True)
