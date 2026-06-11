import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Socio from '../src/resources/socios/models/Socio.js';
import { getSheetValues } from '../src/services/googleSheetsService.js';
import { columnsToSocioData } from '../src/resources/socios/services/socioSheetSync.js';

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

    for (const row of dataRows) {
      const record = columnsToSocioData(headerRow, row);
      record.clubId = record.clubId || process.env.DEFAULT_CLUB_ID;
      if (!record.dni || !record.apellido || !record.nombre) {
        results.push({ status: 'skipped', row, reason: 'Falta DNI, apellido o nombre' });
        continue;
      }

      const update = {
        ...record,
        active: true,
      };

      const socio = await Socio.findOneAndUpdate(
        { dni: record.dni, clubId: record.clubId },
        update,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      results.push({ status: 'ok', dni: record.dni, id: socio._id });
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
