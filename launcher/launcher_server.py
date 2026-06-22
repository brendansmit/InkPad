import subprocess, socket, time, os, sys
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PY_FLASK = "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
PY_VENV  = os.path.join(ROOT, "Writing analyzer", ".venv", "bin", "python")
NODE     = "/Users/brendansmit/.nvm/versions/node/v20.20.2/bin/node"


def _port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0

def _wait(port, timeout=12):
    for _ in range(timeout * 5):
        if _port_open(port): return True
        time.sleep(0.2)
    return False

def _bg(cmd, cwd):
    subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def _open(url):
    subprocess.Popen(["open", url])

def _launch_server(cmd, cwd, port, url):
    if not _port_open(port):
        _bg(cmd, cwd)
        if not _wait(port):
            raise RuntimeError(f"server did not start on port {port}")
    _open(url)


LAUNCHERS = {
    "grade-importer": lambda: (
        _launch_server([PY_FLASK, "app.py"], os.path.join(ROOT, "grade-importer"), 5050, "http://localhost:5050")
    ),
    "writing-analyzer": lambda: (
        _bg([PY_VENV if os.path.exists(PY_VENV) else PY_FLASK, "app.py"],
            os.path.join(ROOT, "Writing analyzer")),
    ),
    "maestro": lambda: (
        _launch_server([NODE, "server.js"], os.path.join(ROOT, "class-grouper"), 3456, "http://localhost:3456/v2/")
    ),
    "bugsmash": lambda: (
        _open(os.path.join(ROOT, "bug-detector", "index.html")),
    ),
    "speed-dating": lambda: (
        _launch_server([NODE, "server.js"], os.path.join(ROOT, "speed-dating"), 3464, "http://localhost:3464/public/organiser.html")
    ),
    "server-dashboard": lambda: (
        _launch_server([PY_FLASK, "deploy_server.py"], os.path.join(ROOT, "launcher", "deploy-dashboard"), 5095, "http://localhost:5095")
    ),
    "model-router-coder": lambda: (
        _launch_server([NODE, "server.js"], os.path.join(ROOT, "model-router-coder"), 3470, "http://127.0.0.1:3470")
    ),
}
LAUNCHERS["bug-detector"] = LAUNCHERS["bugsmash"]
LAUNCHERS["debugger"] = LAUNCHERS["bugsmash"]
LAUNCHERS["model-router"] = LAUNCHERS["model-router-coder"]


@app.route("/")
def index():
    return send_from_directory(os.path.dirname(__file__), "launcher.html")

@app.route("/logo")
def logo():
    return send_from_directory("/Users/brendansmit/Documents/InkHeron", "Logo.png")

@app.route("/launch/<app_id>")
def launch(app_id):
    fn = LAUNCHERS.get(app_id)
    if not fn:
        return jsonify({"error": "unknown app"}), 404
    try:
        fn()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5099, debug=False)
