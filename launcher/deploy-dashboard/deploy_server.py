import subprocess, threading, os, json, time
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__, static_folder='.', static_url_path='')

SSH_KEY  = os.path.expanduser('~/.ssh/id_ed25519')
SSH_HOST = 'root@167.172.71.219'

SERVERS = {
    'speed-dating': {
        'pm2_name':    'speed-dating',
        'local_repo':  os.path.expanduser('~/Documents/Claude/speed-dating'),
        'remote_path': '/var/www/speed-dating',
        'npm_restart': 'pm2 restart speed-dating',
        'label':       'speeddating.inkheron.app',
    },
    'ap-lang': {
        'pm2_name':    'ap-lang',
        'local_repo':  os.path.expanduser('~/Documents/Claude/ap-lang-dashboard'),
        'remote_path': '/var/www/ap-lang-dashboard',
        'npm_install': 'rm -rf node_modules && npm install --omit=dev',
        'npm_restart': 'pm2 restart ap-lang',
        'label':       'lang.inkheron.app',
    },
}

def get_server():
    key = request.args.get('server', 'speed-dating')
    return SERVERS.get(key) or SERVERS['speed-dating']

def ssh(cmd, timeout=20):
    result = subprocess.run(
        ['ssh', '-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no',
         '-o', 'ConnectTimeout=8', SSH_HOST, cmd],
        capture_output=True, text=True, timeout=timeout
    )
    return result.stdout + result.stderr, result.returncode == 0

@app.route('/')
def index():
    return send_from_directory(os.path.dirname(__file__), 'dashboard.html')

@app.route('/api/status')
def status():
    srv = get_server()
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
                'label':      srv['label'],
            })
        return jsonify({'online': False, 'status': 'not found', 'label': srv['label']})
    except Exception as e:
        return jsonify({'online': False, 'status': 'unreachable', 'error': str(e), 'label': srv['label']})

@app.route('/api/deploy', methods=['POST'])
def deploy():
    srv = get_server()
    lines = []

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
    out, _ = ssh(f"pm2 logs {srv['pm2_name']} --lines 60 --nostream --raw", timeout=15)
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
