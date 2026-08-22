#!/bin/bash
# Backup diario de Mongo -> Google Drive, con retención (ver uploadBackupToDrive.js).
# Pensado para correr por cron en el host de la Raspi, no dentro de un contenedor.
set -euo pipefail
cd "$(dirname "$0")/.."

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="appcarc-backup-$TIMESTAMP.gz"

docker compose exec -T mongo mongodump --archive="/backups/$FILENAME" --gzip --db=appcarc
docker compose exec -T app node scripts/uploadBackupToDrive.js "/backups/$FILENAME"
