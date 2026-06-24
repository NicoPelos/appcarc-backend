import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Socio from '../src/resources/socios/models/Socio.js';
import { getSheetValues } from '../src/services/googleSheetsService.js';
import { columnsToSocioData } from '../src/resources/socios/services/socioSheetSync.js';
import { syncSocioUserFromSocio } from '../src/resources/usuarios/services/userSync.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
const sheetName = process.env.GOOGLE_SHEETS_SOCIOS_SHEET_NAME || 'Socios';

if (!MONGO_URI) {
  console.error('Falta la variable MONGO_URI en .env');
  process.exit(1);
}

if (!spreadsheetId) {
  console.error('Falta la variable GOOGLE_SHEETS_SOCIOS_ID en .env');
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Conectado a MongoDB');

    const values = await getSheetValues(spreadsheetId, `${sheetName}!A:Z`);
    if (!values.length) {
      console.log('La hoja está vacía');
      return;
    }

    const [headerRow, ...dataRows] = values;
    const results = [];
    const importUser = process.env.IMPORT_USER_ID || 'sheet-import';

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const sheetRowNumber = i + 2; // header is row 1
      try {
        const record = columnsToSocioData(headerRow, row);
        record.clubId = record.clubId || process.env.DEFAULT_CLUB_ID;
        if (!record.dni || !record.apellido || !record.nombre) {
          results.push({ status: 'skipped', row: sheetRowNumber, reason: 'Falta DNI, apellido o nombre' });
          continue;
        }

        const estadoVal = (record.estado || '').toString().toLowerCase();
        const isTrash = estadoVal.includes('papelera') || estadoVal.includes('trash') || estadoVal.includes('eliminad');
        const active = !isTrash;

        // Ensure domicilioCompleto
        if (!record.domicilioCompleto) {
          if (record.calle) record.domicilioCompleto = `${record.calle}${record.altura ? ' ' + record.altura : ''}`;
          else if (record.direccionActual) record.domicilioCompleto = record.direccionActual;
        }

        const updateOps = {
          $set: {
            ...record,
            active,
            sheetRowNumber,
            sheetName,
            spreadsheetId,
            sheetUpdatedAt: new Date(),
            updatedBy: importUser,
          },
          $setOnInsert: {
            createdBy: importUser,
          },
        };

        // Only mark deletedAt/deletedBy when the sheet explicitly indicates the record is in the trash
        if (isTrash) {
          updateOps.$set.deletedAt = new Date();
          updateOps.$set.deletedBy = importUser;
        }

        const socio = await Socio.findOneAndUpdate(
          { dni: record.dni, clubId: record.clubId },
          updateOps,
          { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        );

        if (socio?.correoElectronico && socio?.dni) {
          await syncSocioUserFromSocio(socio);
        }

        results.push({ status: 'ok', row: sheetRowNumber, dni: record.dni, id: socio._id, active });
      } catch (errRow) {
        results.push({ status: 'error', row: i + 2, error: errRow.message });
      }
    }

    console.log('Importación finalizada', results.length, 'filas procesadas');
    results.forEach((item) => console.log(item));
  } catch (error) {
    console.error('Error durante la importación:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
