import json, subprocess, socket, time, os, signal
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")
ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_JSON = os.path.join(os.path.dirname(__file__), "apps.json")

PY_FLASK = "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
PY_VENV  = os.path.join(ROOT, "Writing analyzer", ".venv", "bin", "python")

NVM_DIR      = os.path.expanduser("~/.nvm/versions/node")
DEFAULT_NODE = "20"   # what every existing node app has always run on

RUNTIMES = {
    "python_flask": PY_FLASK,
    "python_venv":  None,   # resolved at call time
    "node":         None,   # resolved at call time
}


def _nvm_versions():
    """Installed nvm node versions, newest first."""
    try:
        names = [n for n in os.listdir(NVM_DIR) if n.startswith("v")]
    except OSError:
        return []

    def sort_key(name):
        parts = name[1:].split(".")
        return tuple(int(p) if p.isdigit() else 0 for p in parts)

    return sorted(names, key=sort_key, reverse=True)


def _node_binary(major=None):
    """Newest installed node for a major version, e.g. "20" or "24".

    The path used to be a hardcoded v20.20.2 string, which broke silently on
    any nvm upgrade and gave apps needing a newer node no way to ask for one.
    Apps pin a major with "node": "24" in apps.json.
    """
    major = str(major or DEFAULT_NODE)
    for name in _nvm_versions():
        if name.startswith(f"v{major}."):
            candidate = os.path.join(NVM_DIR, name, "bin", "node")
            if os.path.exists(candidate):
                return candidate
    raise RuntimeError(
        f"node {major}.x not installed under {NVM_DIR} "
        f"(found: {', '.join(_nvm_versions()) or 'nothing'})"
    )


# ── helpers ──────────────────────────────────────────────────────────

def _port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0

def _wait(port, timeout=25):
    for _ in range(timeout * 5):
        if _port_open(port): return True
        time.sleep(0.2)
    return False

def _bg(cmd, cwd, env=None):
    inherited = dict(os.environ)
    # Strip werkzeug reloader flag so child Flask apps don't think they're
    # already inside a reloader child and skip binding their port.
    inherited.pop('WERKZEUG_RUN_MAIN', None)
    # Never leak our own PORT into a child. If this process was started with
    # PORT set (a dev-server wrapper does exactly that), any app reading
    # process.env.PORT would bind the launcher's port instead of its own and
    # silently collide. The app's port comes from apps.json, nowhere else.
    inherited.pop('PORT', None)
    merged = {**inherited, **(env or {})}
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
        path = cfg["path"]
        _open(path if path.startswith("http://") or path.startswith("https://") else os.path.join(ROOT, path))
        return

    if runtime == "python_venv":
        exe = PY_VENV if os.path.exists(PY_VENV) else PY_FLASK
    elif runtime == "node":
        exe = _node_binary(cfg.get("node"))
    else:
        exe = RUNTIMES.get(runtime)
        if not exe:
            raise RuntimeError(f"unknown runtime: {runtime}")

    cwd  = os.path.join(ROOT, cfg["cwd"])
    # Optional "args" for apps whose entry point needs arguments, e.g. a tsx
    # CLI that takes the real server file as its argument.
    cmd  = [exe, cfg["entry"], *cfg.get("args", [])]
    env  = dict(cfg.get("env") or {})
    port = cfg.get("port")
    url  = cfg.get("url")

    # Declaring "port" is enough. Apps that read process.env.PORT get it for
    # free, so they can't drift from the port the launcher is waiting on.
    if port and "PORT" not in env:
        env["PORT"] = str(port)

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
    # The old absolute path (~/Documents/InkHeron/Logo.png) no longer exists, so
    # the header image was broken. Fall back through the copies that do.
    candidates = [
        (os.path.join(ROOT, "InkHeron-Platform", "public"), "InkHeron Logo.png"),
        (os.path.join(ROOT, "ap-lang-dashboard"), "InkHeron Logo.png"),
        (os.path.join(ROOT, "ap-lang-dashboard", "public"), "logo.png"),
    ]
    for directory, filename in candidates:
        if os.path.exists(os.path.join(directory, filename)):
            return send_from_directory(directory, filename)
    return ("", 404)

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

@app.route("/restart/<app_id>", methods=["POST"])
def restart_app(app_id):
    try:
        cfg = _load_cfg(app_id)
    except Exception as e:
        return jsonify({"ok": False, "error": f"could not read apps.json: {e}"}), 500
    if not cfg:
        return jsonify({"ok": False, "error": f"unknown app '{app_id}'"}), 404
    port = cfg.get("port")
    if not port:
        return jsonify({"ok": False, "error": "app has no port (not a server)"}), 400

    # Kill whatever is on that port
    try:
        result = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
        pids = result.stdout.strip().split()
        for pid in pids:
            if pid:
                os.kill(int(pid), signal.SIGTERM)
        if pids:
            time.sleep(1)
    except Exception:
        pass

    # Start fresh
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
