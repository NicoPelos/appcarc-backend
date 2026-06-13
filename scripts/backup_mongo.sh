#!/usr/bin/env bash
set -euo pipefail

# Backup path on SSD
BACKUP_DIR=${BACKUP_DIR:-/mnt/ssd/backups}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="$BACKUP_DIR/mongodump-$TIMESTAMP"

mkdir -p "$OUT_DIR"

echo "Starting mongodump to $OUT_DIR"
mongodump --uri="${MONGO_URI:-mongodb://localhost:27017}" --out "$OUT_DIR"

echo "Backup complete: $OUT_DIR"
