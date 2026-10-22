#!/usr/bin/env bash
# Nightly database backup (ARCHITECTURE §8): pg_dump, encrypted for a public GPG key (the private
# key stays offline), kept 14 days here and mirrored to an external storage. Uploads are not backed up.
#
# The 14 days also hold when the dump fails: old backups are removed here first, and the mirror
# (rsync --delete) runs anyway. Only the newest backup always stays, even when it is older, so a
# dump that keeps failing never leaves no backup at all. A failed dump ends with a non-zero exit
# code, so cron reports it (MAILTO, README).
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

# Keeps the last KEEP_DAYS days here, and always the newest backup; the mirror below applies the
# same to the external storage. Names carry the UTC time, so the newest sorts last.
prune() {
  local newest
  newest=$(find "$BACKUP_DIR" -maxdepth 1 -name 'uniscrims-*.dump.gpg' -printf '%f\n' | sort | tail -n 1)
  find "$BACKUP_DIR" -maxdepth 1 -name 'uniscrims-*.dump.gpg' -mtime +$((KEEP_DAYS - 1)) \
    ! -name "${newest:-none}" -delete
}
prune

name="uniscrims-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
tmp="$BACKUP_DIR/.$name.tmp"
trap 'rm -f "$tmp"' EXIT

# Written to a temporary file first, so a failed dump never looks like a backup. The main compose
# file is enough: `exec db` is the same with the nginx override from the README.
dump_failed=0
if docker compose --env-file .env -f docker/docker-compose.yml exec -T db \
  pg_dump -U uniscrims -d uniscrims --format=custom |
  gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$tmp"; then
  mv "$tmp" "$BACKUP_DIR/$name"
  # The previous newest backup may have been kept only because it was the newest.
  prune
else
  dump_failed=1
  echo "Dump failed; backups older than $KEEP_DAYS days except the newest are removed anyway." >&2
fi

# A local directory that lost its backups (e.g. a rebuilt server) must not empty the external copy
# through --delete: external backups younger than KEEP_DAYS must all exist here. Older ones may go,
# also several at once after a few nights without a run. The names carry the UTC time, so they
# compare as strings. The listing must succeed: a failed listing would hide missing backups.
remote_list=$(rsync --list-only -e "ssh -p $BACKUP_SSH_PORT" "$BACKUP_REMOTE/")
cutoff="uniscrims-$(date -u -d "$KEEP_DAYS days ago" +%Y%m%dT%H%M%SZ).dump.gpg"
missing=0
while read -r file; do
  if [[ "$file" > "$cutoff" && ! -e "$BACKUP_DIR/$file" ]]; then missing=$((missing + 1)); fi
done < <(grep -oE 'uniscrims-[0-9]{8}T[0-9]{6}Z\.dump\.gpg$' <<<"$remote_list" || true)
if ((missing > 0)); then
  echo "$missing external backups of the last $KEEP_DAYS days are missing here: not mirroring." >&2
  echo "Copy the external backups back to $BACKUP_DIR first (README, Backups)." >&2
  exit 1
fi
rsync -a --delete --exclude '.*.tmp' -e "ssh -p $BACKUP_SSH_PORT" "$BACKUP_DIR/" "$BACKUP_REMOTE/"

if ((dump_failed)); then
  echo "Backup failed; old backups were removed and mirrored, the newest one is kept" >&2
  exit 1
fi
echo "Backup $name done"
