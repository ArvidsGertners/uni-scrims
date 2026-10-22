#!/usr/bin/env bash
# Nightly database backup (ARCHITECTURE §8): pg_dump, encrypted for a public GPG key (the private
# key stays offline), kept 14 days here and mirrored to an external storage. Uploads are not backed up.
#
# Needs: BACKUP_GPG_RECIPIENT (imported public key), BACKUP_REMOTE (rsync target over SSH).
# Optional: BACKUP_DIR (default /var/backups/uni-scrims), BACKUP_SSH_PORT (default 22; Storage Box: 23).
# Cron example in the README.
set -euo pipefail

: "${BACKUP_GPG_RECIPIENT:?set BACKUP_GPG_RECIPIENT to the ID or email of the public GPG key}"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE to the rsync target, e.g. user@host:uni-scrims}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/uni-scrims}"
BACKUP_SSH_PORT="${BACKUP_SSH_PORT:-22}"
KEEP_DAYS=14

cd "$(dirname "$0")/.."
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

name="uniscrims-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
tmp="$BACKUP_DIR/.$name.tmp"
trap 'rm -f "$tmp"' EXIT

# Written to a temporary file first, so a failed dump never looks like a backup.
docker compose --env-file .env -f docker/docker-compose.yml exec -T db \
  pg_dump -U uniscrims -d uniscrims --format=custom |
  gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$tmp"
mv "$tmp" "$BACKUP_DIR/$name"

# Keep the last KEEP_DAYS days, here and (through --delete) on the external storage.
find "$BACKUP_DIR" -maxdepth 1 -name 'uniscrims-*.dump.gpg' -mtime +$((KEEP_DAYS - 1)) -delete
rsync -a --delete --exclude '.*.tmp' -e "ssh -p $BACKUP_SSH_PORT" "$BACKUP_DIR/" "$BACKUP_REMOTE/"
echo "Backup $name done"
