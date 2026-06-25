# InkHeron Backup Restore

Backups are encrypted tarballs stored on the droplet in `/var/backups/inkheron`.

The encryption key is `/etc/inkheron/backup.key`. If that key is lost, the backups cannot be
decrypted.

## Test A Backup

```sh
backup_file="$(ls -t /var/backups/inkheron/inkheron-*.tar.gz.enc | head -n 1)"
tmpdir="$(mktemp -d)"
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/inkheron/backup.key \
  -in "$backup_file" \
  | tar -C "$tmpdir" -xzf -
sqlite3 "$tmpdir/inkheron.db" "PRAGMA integrity_check;"
sqlite3 "$tmpdir/etherpad.sqlite" "PRAGMA integrity_check;"
cat "$tmpdir/manifest.txt"
rm -rf "$tmpdir"
```

Both integrity checks should print `ok`.

## Restore

Stop services first:

```sh
sudo systemctl stop inkheron-wrapper etherpad
```

Decrypt the backup:

```sh
backup_file="/var/backups/inkheron/inkheron-YYYYMMDDTHHMMSSZ.tar.gz.enc"
tmpdir="$(mktemp -d)"
sudo openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/inkheron/backup.key \
  -in "$backup_file" \
  | sudo tar -C "$tmpdir" -xzf -
```

Restore the database files:

```sh
sudo install -m 644 -o inkheron -g inkheron "$tmpdir/inkheron.db" /opt/inkheron-platform/data/inkheron.db
sudo install -m 644 -o inkheron -g inkheron "$tmpdir/etherpad.sqlite" /opt/etherpad-lite/var/etherpad.sqlite
```

Start services again:

```sh
sudo systemctl start etherpad inkheron-wrapper
```
