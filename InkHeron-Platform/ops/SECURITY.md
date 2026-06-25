# InkHeron Security Notes

## Disk Encryption

The current DigitalOcean droplet root disk is not converted to full-disk encryption in place.
Doing that remotely on a live boot disk is not a safe operational step.

Current at-rest posture:

- Platform and Etherpad databases are readable only to the server user and root by convention.
- Nightly backups are encrypted with AES-256-CBC and PBKDF2.
- Backup key is stored at `/etc/inkheron/backup.key` with root-only permissions.

To get true full-disk encryption, rebuild the droplet from an encrypted image or move the data to
an encrypted block volume during a planned maintenance window.
