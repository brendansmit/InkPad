import subprocess, os, json, time, ssl, urllib.request
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__, static_folder='.', static_url_path='')

# The python.org framework build ships no CA bundle, so every HTTPS health check
# died with CERTIFICATE_VERIFY_FAILED and quietly fell through to the process
# check. That made a down site look identical to a healthy one. Point SSL at
# certifi's bundle so the health checks actually run.
def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()

SSL_CTX = _ssl_context()

SSH_KEY = os.path.expanduser('~/.ssh/id_ed25519')

# Two droplets. Every server entry below names the host it lives on, because
# the host used to be a single module constant and droplet 2 could not be
# reached from this dashboard at all.
HOSTS = {
    'droplet-1': {
        'ssh':   'root@167.172.71.219',
        'label': 'Droplet 1 · 167.172.71.219',
        'note':  'nginx on 80/443, PM2 and systemd. InkHeron platform and classroom apps.',
    },
    'droplet-2': {
        'ssh':   'root@165.22.242.91',
        'label': 'Droplet 2 · 165.22.242.91',
        'note':  'Caddy in Docker on 80/443. Serve panel and the container apps.',
    },
}

# 'process' drives the status fallback and the default logs/restart commands.
#   {'kind': 'pm2',     'name': ...}
#   {'kind': 'systemd', 'unit': ...}
#   {'kind': 'docker',  'dir': ..., 'service': ..., 'file': optional}
SERVERS = {
    # ── droplet 1 ────────────────────────────────────────────────────────
    'inkpad': {
        'host': 'droplet-1',
        # Live platform: inkpad.inkheron.app -> /opt/inkheron-platform,
        # a systemd service (inkheron-wrapper), NOT pm2. Port 3000.
        'process':     {'kind': 'systemd', 'unit': 'inkheron-wrapper'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/InkHeron-Platform'),
        'remote_path': '/opt/inkheron-platform',
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', 'node_modules', 'data', '.env'],
        'npm_install': 'cp data/inkheron.db data/inkheron.db.pre-deploy-$(date +%Y%m%d%H%M%S) 2>/dev/null; npm install --omit=dev && INKHERON_DB_PATH=/opt/inkheron-platform/data/inkheron.db node src/db/migrate.js',
        'npm_restart': 'systemctl restart inkheron-wrapper',
        'logs_cmd':    'journalctl -u inkheron-wrapper -n 80 --no-pager',
        'label':       'inkpad.inkheron.app',
        'health_url':  'https://inkpad.inkheron.app/healthz',
    },
    'eap-platform': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'eap-platform'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/InkHeron-Platform'),
        'remote_path': '/opt/eap-platform',
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', 'node_modules', 'data', '.env'],
        'npm_install': 'npm install --omit=dev && INKHERON_DB_PATH=/opt/eap-platform/data/inkheron.db node src/db/migrate.js',
        'npm_restart': 'cd /opt/eap-platform && set -a && . /etc/eap-platform.env && set +a && (pm2 describe eap-platform >/dev/null 2>&1 && pm2 restart eap-platform --update-env || pm2 start src/server.js --name eap-platform --update-env)',
        'label':       'eap.inkheron.app',
        'health_url':  'https://eap.inkheron.app/healthz',
    },
    'ap-lang': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'ap-lang'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/ap-lang-dashboard'),
        'remote_path': '/var/www/ap-lang-dashboard',
        'npm_install': 'rm -rf node_modules && npm install --omit=dev',
        'npm_restart': 'pm2 restart ap-lang',
        'label':       'lang.inkheron.app',
        'health_url':  'https://lang.inkheron.app',
    },
    'speed-dating': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'speed-dating'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/speed-dating'),
        'remote_path': '/var/www/speed-dating',
        'npm_restart': 'pm2 restart speed-dating',
        'label':       'speeddating.inkheron.app',
        'health_url':  'https://speeddating.inkheron.app',
    },
    'grammar-arcade': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'grammar-arcade'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/Grammar Arcade/Gramm-Builder'),
        'remote_path': '/var/www/grammar-arcade',
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', 'node_modules', 'data', '.env', '.teacher-password'],
        'local_build': {
            'cmd':       'PATH=/Users/brendansmit/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PORT=3465 BASE_PATH=/grammar-arcade/ NODE_ENV=production ./artifacts/grammar-case-lab/node_modules/.bin/vite build --config ./artifacts/grammar-case-lab/vite.config.ts',
            'env':       {'PORT': '3465', 'BASE_PATH': '/grammar-arcade/', 'NODE_ENV': 'production'},
        },
        'npm_restart': 'cd /var/www/grammar-arcade && pm2 reload ecosystem.config.cjs --update-env',
        'label':       'eap.inkheron.app/grammar-arcade/',
        'health_url':  'https://eap.inkheron.app/grammar-arcade/api/health',
    },
    'admin-platform': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'admin-platform'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/InkHeron-Platform/Admin'),
        'remote_path': '/opt/admin-platform',
        # No .git on the droplet, so this one ships by rsync.
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', 'node_modules', 'data', '.env', 'serve'],
        'npm_install': 'npm install --omit=dev',
        'npm_restart': 'pm2 restart admin-platform --update-env',
        'label':       'admin.inkheron.app',
        'health_url':  'https://admin.inkheron.app',
    },
    'grade-importer': {
        'host': 'droplet-1',
        'process':     {'kind': 'pm2', 'name': 'grade-importer'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/grade-importer'),
        'remote_path': '/var/www/grade-importer',
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', '__pycache__', 'grades.db', '.env', 'GradeImporter.app'],
        # Python app, nothing to npm install.
        'npm_install': None,
        'npm_restart': 'pm2 restart grade-importer',
        'label':       'grade-importer (internal)',
        'health_url':  None,   # not exposed publicly, status comes from pm2
    },

    # ── droplet 2 ────────────────────────────────────────────────────────
    'inkheron-serve': {
        'host': 'droplet-2',
        'process':     {'kind': 'pm2', 'name': 'inkheron-serve'},
        'local_repo':  os.path.expanduser('~/Documents/Claude/InkHeron-Platform/Admin'),
        'remote_path': '/opt/admin-platform',
        'npm_install': 'npm install --omit=dev',
        'npm_restart': 'pm2 restart inkheron-serve --update-env',
        'label':       'serve.inkheron.app',
        'health_url':  'https://serve.inkheron.app/api/health',
    },
    'mosaic': {
        'host': 'droplet-2',
        'process':     {'kind': 'docker', 'dir': '/opt/mosaic', 'service': 'web'},
        'remote_path': '/opt/mosaic',
        # No git remote on the droplet: this one is deployed by copying a new
        # directory into place, so there is nothing for Deploy to pull.
        'deploy_mode': 'unsupported',
        'deploy_note': 'No git remote on the droplet. /opt/mosaic is deployed by copying a new directory into place, so Deploy cannot pull anything. Restart and Logs work.',
        'label':       'mosaic.inkheron.app',
        'health_url':  'https://mosaic.inkheron.app',
    },
    'healthspan': {
        'host': 'droplet-2',
        'process':     {'kind': 'docker', 'dir': '/opt/healthspan', 'service': 'app'},
        'remote_path': '/opt/healthspan',
        'deploy_mode': 'remote_git',
        'npm_install': None,
        'npm_restart': 'cd /opt/healthspan && docker compose up -d --build app',
        'label':       'healthspan.inkheron.app',
        'health_url':  'https://healthspan.inkheron.app',
    },
    'smitrecipes': {
        'host': 'droplet-2',
        'process':     {'kind': 'docker', 'dir': '/opt/smitrecipes', 'service': 'app',
                        'file': 'docker-compose.deploy.yml'},
        'remote_path': '/opt/smitrecipes',
        'deploy_mode': 'remote_git',
        'npm_install': None,
        'npm_restart': 'cd /opt/smitrecipes && docker compose -f docker-compose.deploy.yml up -d --build app',
        'label':       'smitrecipes.inkheron.app',
        'health_url':  'https://smitrecipes.inkheron.app',
    },
}


def get_server():
    key = request.args.get('server', 'inkpad')
    return SERVERS.get(key) or SERVERS['inkpad']


# Reuse one TCP/SSH connection per droplet instead of paying the full
# handshake on every status poll. Without this, a page load fires a dozen
# separate logins and the slowest ones stall behind the browser's per-host
# connection cap.
MUX_DIR = os.path.join(os.path.expanduser('~'), '.ssh', 'deploy-dashboard-mux')
os.makedirs(MUX_DIR, mode=0o700, exist_ok=True)

SSH_BASE = [
    'ssh', '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=8',
    '-o', 'ControlMaster=auto',
    '-o', f'ControlPath={MUX_DIR}/%r@%h:%p',
    '-o', 'ControlPersist=120',
]


def ssh(cmd, srv, timeout=20):
    """Run a command on the droplet this server lives on."""
    host = HOSTS[srv['host']]['ssh']
    result = subprocess.run(
        SSH_BASE + [host, cmd],
        capture_output=True, text=True, timeout=timeout
    )
    return result.stdout + result.stderr, result.returncode == 0


def warm_hosts():
    """Open one master connection per droplet before any parallel fan-out.

    Eleven ssh processes starting at once all race to create the same master
    socket; the losers fall back to their own handshake and some time out,
    which showed up as servers randomly flashing offline. Establishing the
    masters first means the fan-out only ever multiplexes."""
    for host in HOSTS.values():
        try:
            subprocess.run(SSH_BASE + [host['ssh'], 'true'],
                           capture_output=True, timeout=15)
        except Exception:
            pass


def compose(proc, *args):
    """docker compose invocation for a container app."""
    file_flag = f" -f {proc['file']}" if proc.get('file') else ''
    return f"cd {proc['dir']} && docker compose{file_flag} " + ' '.join(args)


def status_cmd(srv):
    proc = srv['process']
    if proc['kind'] == 'pm2':
        return f"pm2 describe {proc['name']}"
    if proc['kind'] == 'systemd':
        return f"systemctl is-active {proc['unit']}"
    return compose(proc, 'ps', proc['service'])


def logs_cmd(srv):
    if srv.get('logs_cmd'):
        return srv['logs_cmd']
    proc = srv['process']
    if proc['kind'] == 'pm2':
        return f"pm2 logs {proc['name']} --lines 80 --nostream --raw"
    if proc['kind'] == 'systemd':
        return f"journalctl -u {proc['unit']} -n 80 --no-pager"
    return compose(proc, 'logs', '--tail 80', proc['service'])


def restart_cmd(srv):
    if srv.get('npm_restart'):
        return srv['npm_restart']
    proc = srv['process']
    if proc['kind'] == 'pm2':
        return f"pm2 restart {proc['name']}"
    if proc['kind'] == 'systemd':
        return f"systemctl restart {proc['unit']}"
    return compose(proc, 'restart', proc['service'])


def run_local_build(srv, lines):
    local_build = srv.get('local_build')
    if not local_build:
        return True

    lines.append(f'\n$ local: {local_build["cmd"]}')
    build = subprocess.run(
        local_build['cmd'], shell=True, capture_output=True, text=True,
        cwd=srv['local_repo'], env={**os.environ, **local_build.get('env', {})}
    )
    lines.append((build.stdout + build.stderr).strip() or '(no output)')
    if build.returncode != 0:
        lines.append('Build failed. Aborting deploy.')
        return False
    return True


def rsync_repo(srv, lines):
    src = os.path.join(srv['local_repo'], '')
    dst = f"{HOSTS[srv['host']]['ssh']}:{srv['remote_path'].rstrip('/')}/"
    cmd = ['rsync', '-az', '--delete']
    for pattern in srv.get('rsync_excludes', []):
        cmd.append(f'--exclude={pattern}')
    cmd.extend(['-e', f'ssh -i {SSH_KEY} -o StrictHostKeyChecking=no', src, dst])

    lines.append(f'\n$ rsync {src} -> {dst}')
    rsync = subprocess.run(cmd, capture_output=True, text=True)
    lines.append((rsync.stdout + rsync.stderr).strip() or '(no output)')
    return rsync.returncode == 0


@app.route('/')
def index():
    return send_from_directory(os.path.dirname(__file__), 'dashboard.html')


@app.route('/api/servers')
def servers():
    """The switcher is built from this, so the UI can never drift from config."""
    groups = []
    for host_key, host in HOSTS.items():
        entries = [
            {
                'key':        key,
                'label':      srv['label'],
                'health_url': srv.get('health_url'),
                'can_deploy': srv.get('deploy_mode') != 'unsupported',
                'deploy_note': srv.get('deploy_note'),
                'kind':       srv['process']['kind'],
            }
            for key, srv in SERVERS.items() if srv['host'] == host_key
        ]
        groups.append({
            'host':    host_key,
            'label':   host['label'],
            'note':    host['note'],
            'servers': entries,
        })
    return jsonify({'groups': groups})


def server_status(srv):
    """Status dict for one server. Shared by /api/status and /api/status-all."""
    label = srv['label']

    # Two independent signals, both always collected: can the public URL be
    # reached, and is the process actually running. Returning early on a good
    # health check would skip the uptime/memory/CPU stats the panel renders.
    health_url = srv.get('health_url')
    unreachable = None
    if health_url:
        try:
            req = urllib.request.Request(health_url, headers={'User-Agent': 'deploy-dashboard'})
            # Generous, because /api/status-all fires every check at once.
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
                if resp.status >= 400:
                    unreachable = f'HTTP {resp.status}'
        except Exception as e:
            unreachable = str(e)

    # A running process whose public URL failed is NOT simply "online" — the app
    # is up but the site is not serving, and calling that online hides an outage.
    def phrase(process_ok):
        if not process_ok:
            return 'stopped'
        if unreachable:
            return 'process up, site unreachable'
        return 'online'

    proc = srv['process']
    try:
        if proc['kind'] == 'pm2':
            out, _ = ssh('pm2 jlist', srv, timeout=15)
            processes = json.loads(out.strip())
            found = next((p for p in processes if p['name'] == proc['name']), None)
            if found:
                env = found.get('pm2_env', {})
                monit = found.get('monit', {})
                process_ok = env.get('status') == 'online'
                return {
                    'online':    process_ok and not unreachable,
                    'degraded':  bool(process_ok and unreachable),
                    'status':    phrase(process_ok) if process_ok else env.get('status', 'unknown'),
                    'uptime_ms': int(time.time() * 1000) - env.get('pm_uptime', 0),
                    'restarts':  env.get('restart_time', 0),
                    'memory_mb': round(monit.get('memory', 0) / 1024 / 1024, 1),
                    'cpu':       monit.get('cpu', 0),
                    'label':     label,
                    'detail':    unreachable,
                }
            return {'online': False, 'status': 'not found', 'label': label}

        out, ok = ssh(status_cmd(srv), srv, timeout=15)
        text = out.strip()
        if proc['kind'] == 'systemd':
            process_ok = text.startswith('active')
        else:
            process_ok = ' running' in text or 'Up ' in text
        return {
            'online':   process_ok and not unreachable,
            'degraded': bool(process_ok and unreachable),
            'status':   phrase(process_ok) if process_ok else (text.splitlines()[0] if text else 'stopped'),
            'label':    label,
            'detail':   unreachable or text,
        }
    except Exception as e:
        return {'online': False, 'status': 'unreachable', 'error': str(e), 'label': label}


@app.route('/api/status')
def status():
    return jsonify(server_status(get_server()))


@app.route('/api/status-all')
def status_all():
    """Every server in one request. The switcher dots used to fire one request
    per server, and the browser's per-host connection cap left the last few
    queued forever behind the slow SSH calls."""
    warm_hosts()
    with ThreadPoolExecutor(max_workers=len(SERVERS)) as pool:
        futures = {key: pool.submit(server_status, srv) for key, srv in SERVERS.items()}
        return jsonify({key: f.result() for key, f in futures.items()})


@app.route('/api/deploy', methods=['POST'])
def deploy():
    srv = get_server()
    mode = srv.get('deploy_mode', 'local_git')
    lines = []

    if mode == 'unsupported':
        return jsonify({
            'output': srv.get('deploy_note', 'Deploy is not configured for this app.'),
            'success': False,
        })

    def remote_steps_cmd():
        steps = []
        if srv.get('npm_install'):
            steps.append(srv['npm_install'])
        steps.append(restart_cmd(srv))
        return steps

    if mode == 'rsync':
        if not run_local_build(srv, lines):
            return jsonify({'output': '\n'.join(lines), 'success': False})
        if not rsync_repo(srv, lines):
            lines.append('Rsync failed. Aborting deploy.')
            return jsonify({'output': '\n'.join(lines), 'success': False})

        steps = remote_steps_cmd()
        lines.append(f'\n$ ssh: {" && ".join(steps)}')
        out, ok = ssh(f"cd {srv['remote_path']} && " + ' && '.join(steps), srv, timeout=180)
        lines.append(out.strip() or '(no output)')
        return jsonify({'output': '\n'.join(lines), 'success': ok})

    if mode == 'remote_git':
        # Nothing local to push: the droplet pulls straight from GitHub.
        steps = ['git pull'] + remote_steps_cmd()
        lines.append(f'$ ssh: {" && ".join(steps)}')
        out, ok = ssh(f"cd {srv['remote_path']} && " + ' && '.join(steps), srv, timeout=300)
        lines.append(out.strip() or '(no output)')
        return jsonify({'output': '\n'.join(lines), 'success': ok})

    # local_git: push from this Mac, then pull on the droplet.
    push = subprocess.run(
        ['git', 'push', 'origin', 'main'],
        capture_output=True, text=True, cwd=srv['local_repo']
    )
    lines.append('$ git push origin main')
    lines.append((push.stdout + push.stderr).strip() or '(no output)')
    if push.returncode != 0:
        lines.append('Push failed. Aborting deploy.')
        return jsonify({'output': '\n'.join(lines), 'success': False})

    steps = ['git pull'] + remote_steps_cmd()
    lines.append(f'\n$ ssh: {" && ".join(steps)}')
    out, ok = ssh(f"cd {srv['remote_path']} && " + ' && '.join(steps), srv, timeout=180)
    lines.append(out.strip() or '(no output)')
    return jsonify({'output': '\n'.join(lines), 'success': ok})


@app.route('/api/logs')
def logs():
    srv = get_server()
    out, _ = ssh(logs_cmd(srv), srv, timeout=25)
    return jsonify({'output': out or '(no logs)'})


@app.route('/api/restart', methods=['POST'])
def restart():
    srv = get_server()
    out, ok = ssh(restart_cmd(srv), srv, timeout=120)
    return jsonify({'output': out.strip() or '(no output)', 'success': ok})


@app.route('/api/run', methods=['POST'])
def run_cmd():
    data = request.get_json(silent=True) or {}
    cmd = (data.get('cmd') or '').strip()
    if not cmd:
        return jsonify({'output': '(no command)', 'success': False})
    out, ok = ssh(cmd, get_server(), timeout=60)
    return jsonify({'output': out.strip() or '(no output)', 'success': ok})


@app.route('/api/ssh', methods=['POST'])
def open_ssh():
    srv = get_server()
    cmd = f"ssh -i ~/.ssh/id_ed25519 {HOSTS[srv['host']]['ssh']}"
    subprocess.Popen([
        'osascript', '-e',
        f'tell application "Terminal" to do script "{cmd}"',
        '-e', 'tell application "Terminal" to activate'
    ])
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(port=5095, debug=False)
