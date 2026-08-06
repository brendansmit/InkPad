# AI Control MVP

Private phone dashboard for launching Codex jobs on a droplet. This is the one-hour MVP: Python standard library only, SQLite job history, per-job clones, logs, diffs, approve push and approve deploy.

## What It Does

- Password login.
- Lists configured projects.
- Starts a background job.
- Clones the selected repo into `workspaces/{job_id}`.
- Runs configured install command.
- Runs Codex from a configurable command.
- Runs configured test and build commands.
- Saves logs and git diff.
- Blocks review if forbidden paths changed.
- Requires button approval for push and deploy.

Codex does not edit the live app path directly. It edits a temporary clone.

## Local Run

```bash
cd ai-control
AI_CONTROL_PASSWORD=dev AI_CONTROL_SESSION_SECRET=dev-secret python3 server.py
```

Open `http://127.0.0.1:8099`.

## Droplet Install

On the new droplet, point DNS first:

```text
builder.inkheron.app -> 165.22.242.91
```

Then copy this folder to the droplet and run:

```bash
scp -r ai-control root@165.22.242.91:/root/ai-control
ssh root@165.22.242.91
cd /root/ai-control
sudo bash scripts/install_ubuntu.sh
```

Then configure secrets and projects:

```bash
sudo nano /etc/ai-control.env
sudo nano /opt/ai-control/config/projects.json
sudo systemctl restart ai-control
```

Nginx:

```bash
sudo cp /opt/ai-control/nginx/builder.inkheron.app.conf /etc/nginx/sites-available/builder.inkheron.app
sudo ln -s /etc/nginx/sites-available/builder.inkheron.app /etc/nginx/sites-enabled/builder.inkheron.app
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d builder.inkheron.app
```

## Project Config

Copy from `config/projects.example.json` into `config/projects.json`, set `"disabled": false` for the first pilot project and update the repo URL.

Important fields:

- `repo`: GitHub SSH repo URL.
- `branch`: starting branch.
- `install_command`: optional setup command.
- `test_command`: optional test command.
- `build_command`: optional build command.
- `deploy_command`: allowlisted deploy command.
- `allowed_paths`: paths Codex may change.
- `blocked_paths`: paths that block review if changed.

## Codex Command

Default:

```json
[
  "codex",
  "exec",
  "--dangerously-bypass-approvals-and-sandbox",
  "{prompt}"
]
```

That is intentionally broad inside the clone. Safety comes from the Unix user, the temporary workspace, blocked path checks and separate deploy approval.

## Hard Safety Rules

For real use, run this as the `ai-control` Unix user, not root. Give that user GitHub access only to the repos it needs. Do not give it passwordless sudo. Keep deploy commands explicit and project-specific.

If a project needs a restart command, add a narrow sudoers rule for that exact command only. Do not give the service user broad sudo.
