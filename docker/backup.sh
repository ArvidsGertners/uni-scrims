#!/usr/bin/env bash
# Nightly database backup (ARCHITECTURE §8): pg_dump, encrypted for a public GPG key (the private
# key stays offline), kept 14 days here and mirrored to an external storage. Uploads are not backed up.
#
# The age comes from the UTC time in the name. A backup is removed in the first run in which it is
# older than 14 days minus two hours, so the one made 14 nights ago goes tonight, also when cron runs
# an hour earlier after a change of daylight saving time. This holds when the dump fails too: old
# backups are removed here first, and the mirror (rsync --delete) runs anyway. Only the newest backup
# always stays, even when it is older, so a dump that keeps failing never leaves no backup at all. A
# failed dump ends with a non-zero exit code, so cron reports it (MAILTO, README).
#
# Needs: BACKUP_GPG_RECIPIENT (imported public key), BACKUP_REMOTE (rsync target over SSH).
# Optional: BACKUP_DIR (default /var/backups/uni-scrims), BACKUP_SSH_PORT (default 22; Storage Box: 23).
# Cron example in the README; docker/test/backup.test.ts runs this script against stubs.
set -euo pipefail

: "${BACKUP_GPG_RECIPIENT:?set BACKUP_GPG_RECIPIENT to the ID or email of the public GPG key}"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE to the rsync target, e.g. user@host:uni-scrims}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/uni-scrims}"
BACKUP_SSH_PORT="${BACKUP_SSH_PORT:-22}"
KEEP_DAYS=14
MARGIN_SECONDS=$((2 * 60 * 60))
PATTERN='uniscrims-[0-9]{8}T[0-9]{6}Z\.dump\.gpg'

cd "$(dirname "$0")/.."
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Names carry the UTC time, so they sort and compare as strings.
name_at() { echo "uniscrims-$(date -u -d "@$1" +%Y%m%dT%H%M%SZ).dump.gpg"; }
cutoff=$(name_at $(($(date -u +%s) - KEEP_DAYS * 24 * 60 * 60 + MARGIN_SECONDS)))
local_backups() { find "$BACKUP_DIR" -maxdepth 1 -type f -printf '%f\n' | grep -xE "$PATTERN" | sort || true; }
newest_of() { sort | tail -n 1; }

# Removes local backups older than the cutoff, except the newest.
prune() {
  local newest file
  newest=$(local_backups | newest_of)
  while read -r file; do
    if [[ -n "$file" && "$file" < "$cutoff" && "$file" != "$newest" ]]; then rm -f -- "$BACKUP_DIR/$file"; fi
  done < <(local_backups)
}
prune

name=$(name_at "$(date -u +%s)")
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

# The listing must succeed: a failed listing would hide what the external storage holds. If it is
# unreachable, nothing can be removed there either; the next run catches up.
remote_list=$(rsync --list-only -e "ssh -p $BACKUP_SSH_PORT" "$BACKUP_REMOTE/")
remote_backups=$(grep -oE "$PATTERN\$" <<<"$remote_list" | sort || true)
newest_remote=$(newest_of <<<"$remote_backups")
newest_local=$(local_backups | newest_of)

# A local directory that lost its backups (e.g. a rebuilt server) must not empty the external copy
# through --delete: external backups that are not expired, and the newest external one unless a
# newer one exists here, must all exist here. Otherwise only expired external backups go.
missing=0
expired=()
while read -r file; do
  [[ -z "$file" ]] && continue
  if [[ "$file" < "$cutoff" && "$file" != "$newest_remote" ]]; then
    expired+=("$file")
  elif [[ ! -e "$BACKUP_DIR/$file" && ("$file" > "$newest_local" || ! "$file" < "$cutoff") ]]; then
    missing=$((missing + 1))
  fi
done <<<"$remote_backups"
if ((missing > 0)); then
  if ((${#expired[@]} > 0)); then
    # --delete from an empty directory, limited to the expired names: only they are removed.
    empty=$(mktemp -d)
    includes=()
    for file in "${expired[@]}"; do includes+=(--include="$file"); done
    rsync -r --delete "${includes[@]}" --exclude='*' -e "ssh -p $BACKUP_SSH_PORT" \
      "$empty/" "$BACKUP_REMOTE/"
    rmdir "$empty"
  fi
  echo "$missing external backups are missing here: only expired ones were removed there, no mirror." >&2
  echo "Copy the external backups back to $BACKUP_DIR first (README, Backups)." >&2
  exit 1
fi
rsync -a --delete --exclude '.*.tmp' -e "ssh -p $BACKUP_SSH_PORT" "$BACKUP_DIR/" "$BACKUP_REMOTE/"

if ((dump_failed)); then
  if [[ -n "$newest_local" ]]; then
    echo "Backup failed; old backups were removed and mirrored, the newest one ($newest_local) is kept" >&2
  else
    echo "Backup failed, and there is no backup yet" >&2
  fi
  exit 1
fi
echo "Backup $name done"
