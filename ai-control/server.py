#!/usr/bin/env python3
import base64
import fnmatch
import hashlib
import hmac
import html
import json
import os
import shlex
import sqlite3
import subprocess
import threading
import time
import uuid
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(os.environ.get("AI_CONTROL_HOME", Path(__file__).resolve().parent))
CONFIG_PATH = Path(os.environ.get("AI_CONTROL_CONFIG", BASE_DIR / "config" / "projects.json"))
DATA_DIR = Path(os.environ.get("AI_CONTROL_DATA", BASE_DIR / "data"))
WORKSPACE_DIR = Path(os.environ.get("AI_CONTROL_WORKSPACES", BASE_DIR / "workspaces"))
LOG_DIR = DATA_DIR / "logs"
ARTIFACT_DIR = DATA_DIR / "artifacts"
DB_PATH = DATA_DIR / "ai-control.sqlite"
STATIC_DIR = BASE_DIR / "static"
SESSION_COOKIE = "ai_control_session"
DB_LOCK = threading.Lock()


def now():
    return int(time.time())


def ensure_dirs():
    for path in (DATA_DIR, WORKSPACE_DIR, LOG_DIR, ARTIFACT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def load_config():
    if not CONFIG_PATH.exists():
        return {"projects": {}}
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def public_project(project_id, project):
    return {
        "id": project_id,
        "name": project.get("name", project_id),
        "repo": project.get("repo", ""),
        "branch": project.get("branch", "main"),
        "disabled": bool(project.get("disabled")),
        "description": project.get("description", ""),
        "ai_command": command_label(project),
        "has_deploy": bool(project.get("deploy_command")),
        "has_tests": bool(project.get("test_command")),
        "has_build": bool(project.get("build_command")),
    }


def command_label(project):
    command = project.get("codex_command")
    if not command:
        command = load_config().get("default_codex_command")
    if isinstance(command, list) and command:
        return str(command[0])
    if isinstance(command, str) and command.strip():
        return command.strip().split()[0]
    return "not configured"


def run_probe(command, timeout=8):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        output = (result.stdout + result.stderr).strip()
        return {
            "ok": result.returncode == 0,
            "code": result.returncode,
            "output": output[-1000:],
        }
    except FileNotFoundError:
        return {"ok": False, "code": 127, "output": "not installed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": 124, "output": "timed out"}
    except Exception as exc:
        return {"ok": False, "code": 1, "output": str(exc)}


def tool_status(name):
    probe = run_probe(["/usr/bin/env", "sh", "-lc", f"command -v {shlex.quote(name)}"], timeout=4)
    if not probe["ok"]:
        return {"ok": False, "path": "", "version": ""}
    path = probe["output"].splitlines()[-1].strip()
    version = run_probe([path, "--version"], timeout=6)
    return {"ok": True, "path": path, "version": version.get("output", "")[:300]}


def setup_status():
    config = load_config()
    projects = config.get("projects") or {}
    public_key = Path.home() / ".ssh" / "id_ed25519.pub"
    github_probe = run_probe(
        ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "git@github.com"],
        timeout=10,
    )
    github_ok = github_probe["ok"] or "successfully authenticated" in github_probe.get("output", "").lower()
    return {
        "config_path": str(CONFIG_PATH),
        "data_dir": str(DATA_DIR),
        "workspace_dir": str(WORKSPACE_DIR),
        "env": {
            "openai": bool(os.environ.get("OPENAI_API_KEY")),
            "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
        },
        "tools": {
            "git": tool_status("git"),
            "node": tool_status("node"),
            "npm": tool_status("npm"),
            "codex": tool_status("codex"),
            "claude": tool_status("claude"),
        },
        "github": {
            "ssh_key": public_key.exists(),
            "ssh_public_key": public_key.read_text(encoding="utf-8").strip() if public_key.exists() else "",
            "auth_ok": github_ok,
            "auth_output": github_probe.get("output", ""),
        },
        "projects": [public_project(pid, project) for pid, project in projects.items()],
    }


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            create table if not exists jobs (
                id text primary key,
                project_id text not null,
                task text not null,
                status text not null,
                branch text,
                workspace text,
                created_at integer not null,
                updated_at integer not null,
                summary text default '',
                error text default '',
                tests_ok integer default null,
                build_ok integer default null,
                warnings text default '[]',
                changed_files text default '[]',
                commit_sha text default '',
                push_output text default '',
                deploy_output text default ''
            )
            """
        )
        db.commit()


def db_execute(sql, params=()):
    with DB_LOCK:
        with sqlite3.connect(DB_PATH) as db:
            db.execute(sql, params)
            db.commit()


def db_query(sql, params=(), one=False):
    with DB_LOCK:
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            rows = db.execute(sql, params).fetchall()
    if one:
        return dict(rows[0]) if rows else None
    return [dict(row) for row in rows]


def update_job(job_id, **fields):
    if not fields:
        return
    fields["updated_at"] = now()
    cols = ", ".join(f"{key}=?" for key in fields)
    db_execute(f"update jobs set {cols} where id=?", [*fields.values(), job_id])


def job_public(row):
    row = dict(row)
    for key in ("warnings", "changed_files"):
        try:
            row[key] = json.loads(row.get(key) or "[]")
        except json.JSONDecodeError:
            row[key] = []
    return row


def password():
    return os.environ.get("AI_CONTROL_PASSWORD", "")


def session_secret():
    return os.environ.get("AI_CONTROL_SESSION_SECRET", "dev-secret-change-me")


def sign_value(value):
    sig = hmac.new(session_secret().encode(), value.encode(), hashlib.sha256).hexdigest()
    return f"{value}.{sig}"


def verify_signed(value):
    try:
        payload, sig = value.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(session_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        raw = base64.urlsafe_b64decode(payload.encode()).decode()
        data = json.loads(raw)
    except Exception:
        return None
    if now() - int(data.get("ts", 0)) > 60 * 60 * 24 * 7:
        return None
    return data


def make_session_cookie():
    payload = base64.urlsafe_b64encode(json.dumps({"ts": now(), "nonce": uuid.uuid4().hex}).encode()).decode()
    secure = "; Secure" if os.environ.get("AI_CONTROL_COOKIE_SECURE") == "1" else ""
    return f"{SESSION_COOKIE}={sign_value(payload)}; HttpOnly; SameSite=Lax; Path=/{secure}"


def log_path(job_id):
    return LOG_DIR / f"{job_id}.log"


def append_log(job_id, text):
    with log_path(job_id).open("a", encoding="utf-8") as f:
        f.write(text)
        if not text.endswith("\n"):
            f.write("\n")


def run_logged(job_id, command, cwd, timeout=None):
    if isinstance(command, list):
        printable = " ".join(shlex.quote(str(part)) for part in command)
        popen_args = command
        shell = False
    else:
        printable = command
        popen_args = command
        shell = True

    append_log(job_id, f"\n$ {printable}\n")
    process = subprocess.Popen(
        popen_args,
        cwd=str(cwd),
        shell=shell,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=os.environ.copy(),
    )

    started = time.time()
    output = []
    while True:
        line = process.stdout.readline() if process.stdout else ""
        if line:
            output.append(line)
            append_log(job_id, line.rstrip("\n"))
        if process.poll() is not None:
            rest = process.stdout.read() if process.stdout else ""
            if rest:
                output.append(rest)
                append_log(job_id, rest.rstrip("\n"))
            break
        if timeout and time.time() - started > timeout:
            process.kill()
            append_log(job_id, f"\nCommand timed out after {timeout} seconds.")
            return 124, "".join(output)
    return process.returncode, "".join(output)


def substitute_command(command, values):
    if isinstance(command, list):
        return [str(part).format(**values) for part in command]
    return str(command).format(**values)


def changed_files(workspace):
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
    )
    files = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    status = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
    )
    files.extend(line.strip() for line in status.stdout.splitlines() if line.strip())
    return sorted(set(files))


def write_diff(job_id, workspace):
    artifact = ARTIFACT_DIR / job_id
    artifact.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(["git", "diff", "HEAD"], cwd=str(workspace), capture_output=True, text=True)
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
    )
    extra = []
    for filename in [x for x in untracked.stdout.splitlines() if x.strip()]:
        extra.append(f"\n--- untracked: {filename}\n")
        try:
            extra.append((workspace / filename).read_text(encoding="utf-8", errors="replace"))
        except Exception as exc:
            extra.append(f"(could not read file: {exc})")
    diff = result.stdout + "\n".join(extra)
    (artifact / "diff.patch").write_text(diff, encoding="utf-8")
    return diff


def is_allowed(path, project):
    blocked = project.get("blocked_paths", [])
    for pattern in blocked:
        if fnmatch.fnmatch(path, pattern) or path.startswith(pattern.rstrip("/") + "/"):
            return False, f"blocked path changed: {path}"

    allowed = project.get("allowed_paths", [])
    if not allowed:
        return True, ""
    for pattern in allowed:
        if fnmatch.fnmatch(path, pattern) or path == pattern or path.startswith(pattern.rstrip("/") + "/"):
            return True, ""
    return False, f"outside allowed paths: {path}"


def run_job(job_id):
    config = load_config()
    row = db_query("select * from jobs where id=?", [job_id], one=True)
    if not row:
        return
    project = (config.get("projects") or {}).get(row["project_id"])
    if not project or project.get("disabled"):
        update_job(job_id, status="failed", error="Project not found or disabled.")
        return

    workspace = WORKSPACE_DIR / job_id
    branch = f"ai-control/{row['project_id']}/{job_id[:8]}"
    update_job(job_id, status="cloning", branch=branch, workspace=str(workspace))
    append_log(job_id, f"Job {job_id} started for {row['project_id']}")

    try:
        clone_cmd = ["git", "clone", "--depth", "1", "--branch", project.get("branch", "main"), project["repo"], str(workspace)]
        code, _ = run_logged(job_id, clone_cmd, BASE_DIR, timeout=600)
        if code != 0:
            update_job(job_id, status="failed", error="git clone failed")
            return

        run_logged(job_id, ["git", "checkout", "-b", branch], workspace, timeout=60)

        if project.get("install_command"):
            update_job(job_id, status="installing")
            code, _ = run_logged(job_id, project["install_command"], workspace, timeout=int(project.get("install_timeout", 900)))
            if code != 0:
                append_log(job_id, "Install failed. Continuing to collect diff if Codex already changed files.")

        codex_command = project.get("codex_command") or config.get("default_codex_command")
        if not codex_command:
            update_job(job_id, status="failed", error="No codex_command configured.")
            return

        prompt = (
            "You are editing a temporary clone for a phone-triggered job. "
            "Stay inside this repository. Do not edit secrets, deployment config, databases or unrelated apps. "
            "Task: " + row["task"]
        )
        update_job(job_id, status="running_ai")
        code, _ = run_logged(job_id, substitute_command(codex_command, {"prompt": prompt, "job_id": job_id}), workspace, timeout=int(project.get("ai_timeout", 1800)))
        if code != 0:
            append_log(job_id, "Codex command exited non-zero. Tests/build will still run if configured.")

        tests_ok = None
        if project.get("test_command"):
            update_job(job_id, status="testing")
            code, _ = run_logged(job_id, project["test_command"], workspace, timeout=int(project.get("test_timeout", 900)))
            tests_ok = 1 if code == 0 else 0

        build_ok = None
        if project.get("build_command"):
            update_job(job_id, status="building", tests_ok=tests_ok)
            code, _ = run_logged(job_id, project["build_command"], workspace, timeout=int(project.get("build_timeout", 900)))
            build_ok = 1 if code == 0 else 0

        files = changed_files(workspace)
        warnings = []
        for filename in files:
            ok, warning = is_allowed(filename, project)
            if not ok:
                warnings.append(warning)

        write_diff(job_id, workspace)
        status = "review"
        if warnings:
            status = "blocked"
        elif tests_ok == 0 or build_ok == 0:
            status = "review_failed"

        summary = f"{len(files)} changed file(s)."
        update_job(
            job_id,
            status=status,
            tests_ok=tests_ok,
            build_ok=build_ok,
            warnings=json.dumps(warnings),
            changed_files=json.dumps(files),
            summary=summary,
        )
        append_log(job_id, f"\nFinished: {summary}")
        if warnings:
            append_log(job_id, "Safety warnings:\n" + "\n".join(f"- {w}" for w in warnings))
    except Exception as exc:
        append_log(job_id, f"Fatal worker error: {exc}")
        update_job(job_id, status="failed", error=str(exc))


def push_job(job_id):
    row = db_query("select * from jobs where id=?", [job_id], one=True)
    if not row:
        return False, "Job not found."
    if row["status"] not in ("review", "review_failed"):
        return False, f"Cannot push from status {row['status']}."
    workspace = Path(row["workspace"])
    if not workspace.exists():
        return False, "Workspace missing."

    run_logged(job_id, ["git", "add", "-A"], workspace, timeout=60)
    code, _ = run_logged(job_id, ["git", "commit", "-m", f"AI task: {row['task'][:80]}"], workspace, timeout=120)
    if code != 0:
        return False, "Nothing committed or commit failed."
    code, out = run_logged(job_id, ["git", "push", "-u", "origin", row["branch"]], workspace, timeout=300)
    if code != 0:
        return False, "Push failed."
    sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(workspace), capture_output=True, text=True).stdout.strip()
    update_job(job_id, status="pushed", commit_sha=sha, push_output=out)
    return True, out


def deploy_job(job_id, force=False):
    config = load_config()
    row = db_query("select * from jobs where id=?", [job_id], one=True)
    if not row:
        return False, "Job not found."
    project = (config.get("projects") or {}).get(row["project_id"])
    if not project:
        return False, "Project missing."
    if row["status"] not in ("review", "review_failed", "pushed"):
        return False, f"Cannot deploy from status {row['status']}."
    if row["status"] == "review_failed" and not force:
        return False, "Build or tests failed. Send force=true to deploy anyway."
    deploy_command = project.get("deploy_command")
    if not deploy_command:
        return False, "No deploy_command configured."
    cwd = Path(project.get("deploy_cwd") or row["workspace"] or BASE_DIR)
    update_job(job_id, status="deploying")
    code, out = run_logged(job_id, deploy_command, cwd, timeout=int(project.get("deploy_timeout", 900)))
    status = "deployed" if code == 0 else "deploy_failed"
    update_job(job_id, status=status, deploy_output=out)
    return code == 0, out


class Handler(BaseHTTPRequestHandler):
    server_version = "AIControl/0.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def send_bytes(self, body, content_type="application/octet-stream", status=HTTPStatus.OK, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text, content_type="text/plain", status=HTTPStatus.OK, headers=None):
        self.send_bytes(text.encode("utf-8"), content_type, status, headers)

    def send_json(self, data, status=HTTPStatus.OK):
        self.send_text(json.dumps(data), "application/json", status)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def authenticated(self):
        cookie = SimpleCookie(self.headers.get("Cookie"))
        morsel = cookie.get(SESSION_COOKIE)
        return bool(morsel and verify_signed(morsel.value))

    def require_auth(self):
        if self.authenticated():
            return True
        self.send_json({"error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            return self.send_json({"ok": True})
        if path == "/login":
            return self.send_login()
        if path.startswith("/static/"):
            return self.send_static(path.removeprefix("/static/"))
        if not self.authenticated():
            return self.redirect("/login")
        if path == "/":
            return self.send_static("index.html", "text/html")
        if path == "/api/projects":
            return self.api_projects()
        if path == "/api/setup":
            return self.api_setup()
        if path == "/api/jobs":
            return self.api_jobs()
        if path.startswith("/api/jobs/"):
            return self.api_job_get(path)
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/login":
            return self.handle_login()
        if path == "/logout":
            return self.redirect("/login", {"Set-Cookie": f"{SESSION_COOKIE}=; Max-Age=0; Path=/"})
        if not self.require_auth():
            return
        if path == "/api/jobs":
            return self.create_job()
        if path.startswith("/api/jobs/"):
            return self.api_job_post(path)
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def redirect(self, location, headers=None):
        merged = {"Location": location}
        merged.update(headers or {})
        self.send_text("", "text/plain", HTTPStatus.FOUND, merged)

    def send_static(self, filename, content_type=None):
        safe = Path(filename)
        if safe.is_absolute() or ".." in safe.parts:
            return self.send_text("bad path", status=HTTPStatus.BAD_REQUEST)
        path = STATIC_DIR / safe
        if not path.exists() or not path.is_file():
            return self.send_text("not found", status=HTTPStatus.NOT_FOUND)
        if content_type is None:
            content_type = "text/css" if path.suffix == ".css" else "application/javascript" if path.suffix == ".js" else "text/html"
        self.send_bytes(path.read_bytes(), content_type)

    def send_login(self):
        missing = "" if password() else "<p class='error'>AI_CONTROL_PASSWORD is not set on the server.</p>"
        body = f"""<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Control Login</title><link rel="stylesheet" href="/static/style.css"></head>
<body class="login"><form method="post" action="/login" class="login-box"><h1>AI Control</h1>{missing}<input name="password" type="password" placeholder="Password" autofocus><button>Log in</button></form></body></html>"""
        self.send_text(body, "text/html")

    def handle_login(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        data = parse_qs(body)
        supplied = (data.get("password") or [""])[0]
        if password() and hmac.compare_digest(supplied, password()):
            return self.redirect("/", {"Set-Cookie": make_session_cookie()})
        self.send_text("Bad password", "text/plain", HTTPStatus.FORBIDDEN)

    def api_projects(self):
        projects = load_config().get("projects") or {}
        visible = [public_project(pid, p) for pid, p in projects.items()]
        self.send_json({"projects": visible})

    def api_setup(self):
        self.send_json(setup_status())

    def api_jobs(self):
        rows = db_query("select * from jobs order by created_at desc limit 40")
        self.send_json({"jobs": [job_public(row) for row in rows]})

    def api_job_get(self, path):
        parts = path.split("/")
        job_id = parts[3] if len(parts) > 3 else ""
        row = db_query("select * from jobs where id=?", [job_id], one=True)
        if not row:
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        if len(parts) == 5 and parts[4] == "logs":
            path = log_path(job_id)
            return self.send_text(path.read_text(encoding="utf-8") if path.exists() else "", "text/plain")
        if len(parts) == 5 and parts[4] == "diff":
            path = ARTIFACT_DIR / job_id / "diff.patch"
            return self.send_text(path.read_text(encoding="utf-8") if path.exists() else "", "text/plain")
        self.send_json({"job": job_public(row)})

    def create_job(self):
        data = self.read_json()
        project_id = str(data.get("project_id", "")).strip()
        task = str(data.get("task", "")).strip()
        projects = load_config().get("projects") or {}
        if not task:
            return self.send_json({"error": "Task required."}, HTTPStatus.BAD_REQUEST)
        if project_id not in projects or projects[project_id].get("disabled"):
            return self.send_json({"error": "Project not found or disabled."}, HTTPStatus.BAD_REQUEST)
        job_id = uuid.uuid4().hex
        db_execute(
            "insert into jobs (id, project_id, task, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
            [job_id, project_id, task, "queued", now(), now()],
        )
        thread = threading.Thread(target=run_job, args=(job_id,), daemon=True)
        thread.start()
        self.send_json({"job_id": job_id})

    def api_job_post(self, path):
        parts = path.split("/")
        job_id = parts[3] if len(parts) > 3 else ""
        action = parts[4] if len(parts) > 4 else ""
        if action == "push":
            ok, output = push_job(job_id)
            return self.send_json({"success": ok, "output": output}, HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)
        if action == "deploy":
            data = self.read_json()
            ok, output = deploy_job(job_id, force=bool(data.get("force")))
            return self.send_json({"success": ok, "output": output}, HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)


def main():
    ensure_dirs()
    init_db()
    host = os.environ.get("AI_CONTROL_HOST", "127.0.0.1")
    port = int(os.environ.get("AI_CONTROL_PORT", "8099"))
    print(f"AI Control listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
