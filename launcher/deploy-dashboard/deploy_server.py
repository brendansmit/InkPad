import subprocess, threading, os, json, time
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')

SSH_KEY  = os.path.expanduser('~/.ssh/id_ed25519')
SSH_HOST = 'root@167.172.71.219'
LOCAL_REPO = os.path.expanduser('~/Documents/Claude/speed-dating')
APP_NAME = 'speed-dating'

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
    try:
        out, ok = ssh('pm2 jlist', timeout=10)
        processes = json.loads(out.strip())
        sd = next((p for p in processes if p['name'] == APP_NAME), None)
        if sd:
            env = sd.get('pm2_env', {})
            monit = sd.get('monit', {})
            uptime_ms = int(time.time() * 1000) - env.get('pm_uptime', 0)
            return jsonify({
                'online': env.get('status') == 'online',
                'status': env.get('status', 'unknown'),
                'uptime_ms': uptime_ms,
                'restarts': env.get('restart_time', 0),
                'memory_mb': round(monit.get('memory', 0) / 1024 / 1024, 1),
                'cpu': monit.get('cpu', 0),
            })
        return jsonify({'online': False, 'status': 'not found'})
    except Exception as e:
        return jsonify({'online': False, 'status': 'unreachable', 'error': str(e)})

@app.route('/api/deploy', methods=['POST'])
def deploy():
    lines = []
    # 1. local git push
    push = subprocess.run(
        ['git', 'push', 'origin', 'main'],
        capture_output=True, text=True, cwd=LOCAL_REPO
    )
    lines.append('$ git push origin main')
    lines.append((push.stdout + push.stderr).strip() or '(no output)')
    # 2. remote pull + restart
    lines.append('\n$ ssh: git pull && npm install --omit=dev && pm2 restart speed-dating')
    out, ok = ssh(
        'cd /var/www/speed-dating && git pull && npm install --omit=dev && pm2 restart speed-dating',
        timeout=90
    )
    lines.append(out.strip() or '(no output)')
    return jsonify({'output': '\n'.join(lines), 'success': ok})

@app.route('/api/logs')
def logs():
    out, _ = ssh('pm2 logs speed-dating --lines 60 --nostream --raw', timeout=15)
    return jsonify({'output': out or '(no logs)'})

@app.route('/api/restart', methods=['POST'])
def restart():
    out, ok = ssh('pm2 restart speed-dating', timeout=15)
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
