// Sube un backup de Mongo (mongodump --archive --gzip) a la carpeta de Drive
// configurada, y aplica retención: borra los backups más viejos que excedan
// BACKUP_RETENTION_COUNT. Pensado para correr dentro del contenedor `app`
// (tiene googleapis y google-credentials.json ya disponibles), disparado por
// un script de la Raspi vía cron: `node scripts/uploadBackupToDrive.js <archivo>`.
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT ?? 30);

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('❌ Uso: node uploadBackupToDrive.js <ruta-al-archivo>');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`❌ No existe el archivo: ${filePath}`);
    process.exit(1);
  }

  const folderId = process.env.BACKUP_DRIVE_FOLDER_ID;
  if (!folderId) {
    console.error('❌ Falta la variable de entorno BACKUP_DRIVE_FOLDER_ID');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: 'google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const fileName = path.basename(filePath);
  console.log(`⬆️  Subiendo ${fileName} a Drive...`);
  await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/gzip', body: fs.createReadStream(filePath) },
    fields: 'id',
    supportsAllDrives: true,
  });
  console.log('✅ Subida OK');

  fs.unlinkSync(filePath);

  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: 'createdTime desc',
    fields: 'files(id, name, createdTime)',
    pageSize: 1000,
    corpora: 'drive',
    driveId: folderId,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const archivos = data.files ?? [];
  const aBorrar = archivos.slice(RETENTION_COUNT);
  for (const f of aBorrar) {
    await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    console.log(`🗑️  Borrado backup viejo: ${f.name}`);
  }
  console.log(`✅ Retención aplicada: ${archivos.length - aBorrar.length}/${archivos.length} backups conservados (máx ${RETENTION_COUNT})`);
}

main().catch((err) => {
  console.error('❌ Error subiendo backup a Drive:', err.message);
  process.exit(1);
});
