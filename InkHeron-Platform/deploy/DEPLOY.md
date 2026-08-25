# Deploying InkHeron from GitHub

This is the safe way to push code updates and roll them onto the droplet
without ever touching the live data.

## The golden rule

Your data is never in Git. The live database (`data/inkheron.db`), library
uploads (`data/eap-library/uploads`) and the env/secrets file all live under
the runtime dir `data/`, which is gitignored and never copied by a deploy.
A deploy only ships `src`, `migrations` and `public`. Migrations are additive
(they only add tables, never drop), and they self-apply when the service
restarts. So a deploy can add new features but cannot delete or corrupt
existing student data.

## Production branch

`analysis-ai` is the production line. It is complete, reviewed and green, and
already includes every shipped feature. Deploy from it.

Do NOT deploy `toefl-estimate`: it carries an unrelated whole-repo backup
commit and two unreviewed migrations (`033`, `034`). It is a backup branch,
not a release branch.

## Your workflow (laptop)

1. Make the fix on a feature branch.
2. Run the suite green:
   `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test`
3. Merge into `analysis-ai` (prefer `git merge --ff-only`).
4. Push: `git push origin analysis-ai`
   (git root is the parent `Claude/` dir; never `git add -A`, stage explicit
   `InkHeron-Platform/...` paths).

## One-time droplet setup

Done once, as root on the droplet (167.172.71.219).

1. Give the droplet read access to the private repo. Generate a deploy key:
   ```
   ssh-keygen -t ed25519 -f /root/.ssh/inkpad_deploy -N ""
   cat /root/.ssh/inkpad_deploy.pub
   ```
   Add that public key to the InkPad repo on GitHub as a read-only Deploy Key
   (Settings > Deploy keys > Add). Then point Git at it:
   ```
   printf 'Host github-inkpad\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/inkpad_deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
   ```

2. Clone the repo (separate from the runtime dir, holds no data):
   ```
   git clone git@github-inkpad:brendansmit/InkPad.git /opt/inkheron-repo
   ```

3. Put the deploy script where you can call it and make it executable:
   ```
   ln -sfn /opt/inkheron-repo/InkHeron-Platform/deploy /opt/inkheron-platform/deploy
   chmod +x /opt/inkheron-repo/InkHeron-Platform/deploy/deploy.sh
   ```

## Deploying

After pushing to `analysis-ai`:

```
/opt/inkheron-platform/deploy/deploy.sh
```

or a specific branch:

```
/opt/inkheron-platform/deploy/deploy.sh analysis-ai
```

The script:
1. Backs up `data/inkheron.db` to `data/backups/` (keeps the newest 20).
2. Fetches and hard-resets the repo clone to `origin/<branch>`.
3. rsyncs only `src`, `migrations`, `public` into the runtime.
4. Runs `npm ci --omit=dev` only if `package.json` changed.
5. Restarts `inkheron-wrapper` (new migrations apply here).
6. Curls `/login` and reports OK or FAIL.

## If a deploy goes wrong

Nothing destructive happens to data, but if the new code misbehaves:

1. Roll code back:
   ```
   /opt/inkheron-platform/deploy/deploy.sh <last-good-branch-or-after-git-checkout>
   ```
   or in the repo clone `git checkout <good-commit>` then re-run the rsync/
   restart steps.
2. Restore a database backup only if a migration genuinely damaged data (rare,
   since migrations are additive):
   ```
   systemctl stop inkheron-wrapper
   cp data/backups/inkheron.db.pre-deploy-<timestamp> data/inkheron.db
   systemctl start inkheron-wrapper
   ```
3. Read logs: `journalctl -u inkheron-wrapper -n 80`

## The summary token (optional)

`GET /api/summary/assignments` hands out counts for the assignment list: how
many students an assignment is set to, how many have not started, how many
handed in, how many are marked and how many are waiting. Names, essay text and
marks are not in it, so a leaked token leaks assignment titles and tallies and
nothing about a student. Cadence uses it to fill in its marking forecast.

It is off unless `INKHERON_SUMMARY_TOKEN` is set. With the variable unset the
route answers 503 to everybody, including a signed-in teacher. There is no
other way in: sessions and CSRF tokens do not open it, and a missing, malformed
or wrong token all get the same 401, so nobody learns anything by guessing.

To turn it on, put the variable wherever the service already reads
`INKHERON_SESSION_SECRET` from, then restart:

```
openssl rand -hex 32          # the token, treat it like a password
systemctl restart inkheron-wrapper
```

Give that value to the Cadence sync server as `INKPAD_TOKEN` (with
`INKPAD_URL=https://inkheron.app`). It belongs on a server and never in a
browser, which is why Cadence proxies the call rather than fetching it from the
page. To revoke, change the variable and restart.

## Notes

- `/opt/eap-platform` is a separate older app (eap.inkheron.app). Leave it
  alone; this script never touches it.
- The environment variables (`INKHERON_APP_DIR`, `INKHERON_SERVICE`, etc.) at
  the top of `deploy.sh` let you override paths without editing the script.
