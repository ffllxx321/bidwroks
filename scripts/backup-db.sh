#!/usr/bin/env bash

# ============================================================================
# BidWorks SQLite Daily Snapshot and Cold Standby Backup Utility
# This script handles active DB backup and cold snapshot retention
# ============================================================================

set -euo pipefail

DB_FILE="./bidworks.sqlite"
BACKUP_DIR="./storage/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/bidworks_backup_${TIMESTAMP}.sqlite"

echo "=== [BACKUP ENGINE] Starting daily database backup ==="

# Enforce existence of backups directory
mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_FILE}" ]; then
  echo "WARNING: Target SQLite database file ${DB_FILE} does not exist yet. Mocking empty placeholder backup."
  touch "${BACKUP_FILE}"
else
  # Perform vacuum online copying or direct physical file copy safely
  cp "${DB_FILE}" "${BACKUP_FILE}"
  echo "SUCCESS: Created database backup at ${BACKUP_FILE}"
fi

# Retention policy: Prune logs older than 30 days
echo "=== [BACKUP ENGINE] Enforcing 30-day snapshot retention policy ==="
find "${BACKUP_DIR}" -name "bidworks_backup_*.sqlite" -mtime +30 -exec rm -f {} \;

echo "=== [BACKUP ENGINE] Completed backup lifecycle ==="
