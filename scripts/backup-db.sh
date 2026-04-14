#!/usr/bin/env bash
#
# MySQL/MariaDB backup script with 30-day retention.
# Usage: ./scripts/backup-db.sh
# Typically invoked via cron: 0 2 * * * /path/to/scripts/backup-db.sh

set -euo pipefail

# --- Configuration (override via environment) ---
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-volunteer_helper}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mysql}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# --- Derived ---
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# --- Ensure backup directory exists ---
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting backup of ${DB_NAME}..."

# --- Dump & compress ---
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --quick \
  "${DB_NAME}" | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup saved to ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# --- Prune old backups ---
DELETED=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date)] Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date)] Backup complete."
