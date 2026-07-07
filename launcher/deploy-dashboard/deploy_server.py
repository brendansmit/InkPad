import subprocess, threading, os, json, time, urllib.request
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__, static_folder='.', static_url_path='')

SSH_KEY  = os.path.expanduser('~/.ssh/id_ed25519')
SSH_HOST = 'root@167.172.71.219'

SERVERS = {
    'inkpad': {
        # Live platform: inkpad.inkheron.app -> /opt/inkheron-platform,
        # a systemd service (inkheron-wrapper), NOT pm2. Port 3000.
        'pm2_name':    'inkheron-wrapper',
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
    'speed-dating': {
        'pm2_name':    'speed-dating',
        'local_repo':  os.path.expanduser('~/Documents/Claude/speed-dating'),
        'remote_path': '/var/www/speed-dating',
        'npm_restart': 'pm2 restart speed-dating',
        'label':       'speeddating.inkheron.app',
        'health_url':  'https://speeddating.inkheron.app',
    },
    'ap-lang': {
        'pm2_name':    'ap-lang',
        'local_repo':  os.path.expanduser('~/Documents/Claude/ap-lang-dashboard'),
        'remote_path': '/var/www/ap-lang-dashboard',
        'npm_install': 'rm -rf node_modules && npm install --omit=dev',
        'npm_restart': 'pm2 restart ap-lang',
        'label':       'lang.inkheron.app',
        'health_url':  'https://lang.inkheron.app',
    },
    'eap-platform': {
        'pm2_name':    'eap-platform',
        'local_repo':  os.path.expanduser('~/Documents/Claude/InkHeron-Platform'),
        'remote_path': '/opt/eap-platform',
        'deploy_mode': 'rsync',
        'rsync_excludes': ['.git', 'node_modules', 'data', '.env'],
        'npm_install': 'npm install --omit=dev && INKHERON_DB_PATH=/opt/eap-platform/data/inkheron.db node src/db/migrate.js',
        'npm_restart': 'cd /opt/eap-platform && set -a && . /etc/eap-platform.env && set +a && (pm2 describe eap-platform >/dev/null 2>&1 && pm2 restart eap-platform --update-env || pm2 start src/server.js --name eap-platform --update-env)',
        'label':       'eap.inkheron.app',
        'health_url':  'https://eap.inkheron.app/healthz',
    },
    'grammar-arcade': {
        'pm2_name':    'grammar-arcade',
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
}

def get_server():
    key = request.args.get('server', 'inkpad')
    return SERVERS.get(key) or SERVERS['inkpad']

def ssh(cmd, timeout=20):
    result = subprocess.run(
        ['ssh', '-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no',
         '-o', 'ConnectTimeout=8', SSH_HOST, cmd],
        capture_output=True, text=True, timeout=timeout
    )
    return result.stdout + result.stderr, result.returncode == 0

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
    dst = f"{SSH_HOST}:{srv['remote_path'].rstrip('/')}/"
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

@app.route('/api/status')
def status():
    srv = get_server()
    label = srv['label']

    # Primary: fast HTTP health check on the public URL
    health_url = srv.get('health_url', f"https://{label}")
    try:
        req = urllib.request.Request(health_url, headers={'User-Agent': 'deploy-dashboard'})
        with urllib.request.urlopen(req, timeout=6) as resp:
            http_ok = resp.status < 400
        if http_ok:
            return jsonify({'online': True, 'status': 'online', 'label': label})
    except Exception:
        pass

    # Fallback: SSH pm2 jlist (only if HTTP check failed)
    try:
        out, ok = ssh('pm2 jlist', timeout=10)
        processes = json.loads(out.strip())
        proc = next((p for p in processes if p['name'] == srv['pm2_name']), None)
        if proc:
            env = proc.get('pm2_env', {})
            monit = proc.get('monit', {})
            uptime_ms = int(time.time() * 1000) - env.get('pm_uptime', 0)
            return jsonify({
                'online':     env.get('status') == 'online',
                'status':     env.get('status', 'unknown'),
                'uptime_ms':  uptime_ms,
                'restarts':   env.get('restart_time', 0),
                'memory_mb':  round(monit.get('memory', 0) / 1024 / 1024, 1),
                'cpu':        monit.get('cpu', 0),
                'label':      label,
            })
        return jsonify({'online': False, 'status': 'not found', 'label': label})
    except Exception as e:
        return jsonify({'online': False, 'status': 'unreachable', 'error': str(e), 'label': label})

@app.route('/api/deploy', methods=['POST'])
def deploy():
    srv = get_server()
    lines = []

    if srv.get('deploy_mode') == 'rsync':
        if not run_local_build(srv, lines):
            return jsonify({'output': '\n'.join(lines), 'success': False})

        if not rsync_repo(srv, lines):
            lines.append('Rsync failed. Aborting deploy.')
            return jsonify({'output': '\n'.join(lines), 'success': False})

        npm_install = srv.get('npm_install')
        remote_steps = []
        if npm_install:
            remote_steps.append(npm_install)
        remote_steps.append(srv['npm_restart'])
        remote_cmd = f"cd {srv['remote_path']} && " + " && ".join(remote_steps)

        lines.append(f'\n$ ssh: {" && ".join(remote_steps)}')
        out, ok = ssh(remote_cmd, timeout=120)
        lines.append(out.strip() or '(no output)')
        return jsonify({'output': '\n'.join(lines), 'success': ok})

    push = subprocess.run(
        ['git', 'push', 'origin', 'main'],
        capture_output=True, text=True, cwd=srv['local_repo']
    )
    lines.append('$ git push origin main')
    lines.append((push.stdout + push.stderr).strip() or '(no output)')

    npm_install = srv.get('npm_install', 'npm install --omit=dev')
    remote_cmd = (
        f"cd {srv['remote_path']} && "
        f"git pull && {npm_install} && {srv['npm_restart']}"
    )
    lines.append(f'\n$ ssh: git pull && {npm_install} && {srv["npm_restart"]}')
    out, ok = ssh(remote_cmd, timeout=90)
    lines.append(out.strip() or '(no output)')

    return jsonify({'output': '\n'.join(lines), 'success': ok})

@app.route('/api/logs')
def logs():
    srv = get_server()
    log_cmd = srv.get('logs_cmd', f"pm2 logs {srv['pm2_name']} --lines 60 --nostream --raw")
    out, _ = ssh(log_cmd, timeout=15)
    return jsonify({'output': out or '(no logs)'})

@app.route('/api/restart', methods=['POST'])
def restart():
    srv = get_server()
    out, ok = ssh(srv['npm_restart'], timeout=15)
    return jsonify({'output': out.strip() or '(no output)', 'success': ok})

@app.route('/api/run', methods=['POST'])
def run_cmd():
    data = request.get_json(silent=True) or {}
    cmd = (data.get('cmd') or '').strip()
    if not cmd:
        return jsonify({'output': '(no command)', 'success': False})
    out, ok = ssh(cmd, timeout=30)
    return jsonify({'output': out.strip() or '(no output)', 'success': ok})

@app.route('/api/ssh', methods=['POST'])
def open_ssh():
    cmd = f'ssh -i ~/.ssh/id_ed25519 root@167.172.71.219'
    subprocess.Popen([
        'osascript', '-e',
        f'tell application "Terminal" to do script "{cmd}"',
        '-e', 'tell application "Terminal" to activate'
    ])
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=5095, debug=False)
