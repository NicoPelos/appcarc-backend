import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Horarios from '../src/resources/muroLibre/models/Horarios.js';
import { getSheetValues } from '../src/services/googleSheetsService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
const sheetName = process.env.GOOGLE_SHEETS_HORARIOS_SHEET_NAME || 'Horarios';

if (!MONGO_URI) {
  console.error('Falta la variable MONGO_URI en .env');
  process.exit(1);
}

if (!spreadsheetId) {
  console.error('Falta la variable GOOGLE_SHEETS_SOCIOS_ID en .env');
  process.exit(1);
}

const parseDate = (val) => {
  if (!val) return null;
  // DD/MM/YYYY HH:MM:SS
  const full = val.match(/^(\d{1,2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (full) return new Date(`${full[3]}-${full[2]}-${full[1].padStart(2, '0')}T${full[4]}`);
  // D/MM/YYYY or DD/MM/YYYY
  const date = val.match(/^(\d{1,2})\/(\d{2})\/(\d{4})$/);
  if (date) return new Date(`${date[3]}-${date[2]}-${date[1].padStart(2, '0')}`);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const parseTotalHoras = (val) => {
  if (!val) return null;
  const clean = val.replace(/<[^>]+>/g, '').trim();
  const match = clean.match(/^(\d+):(\d{2})(?::\d{2})?$/);
  if (match) return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
  return null;
};

const rowToHorario = (header, row) => {
  const get = (col) => {
    const idx = header.indexOf(col);
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };
  return {
    fecha:        parseDate(get('Fecha')),
    observaciones: get('Observaciones'),
    horaEntrada:  parseDate(get('hora entrada')),
    horaSalida:   parseDate(get('hora salida')),
    nombre:       get('Nombre'),
    totalHoras:   parseTotalHoras(get('total de horas')),
    idHorarios:   get('idHorarios'),
    createdBy:    get('CreadoPor'),
    updatedBy:    get('ActualizadoPor'),
    tipoTarea:    get('Tipo de Tarea'),
  };
};

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Conectado a MongoDB');

    const values = await getSheetValues(spreadsheetId, `${sheetName}!A:L`);
    if (!values.length) {
      console.log('La hoja está vacía');
      return;
    }

    const [header, ...rows] = values;
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sheetRow = i + 2;
      try {
        const record = rowToHorario(header, row);

        if (!record.idHorarios) {
          results.push({ status: 'skipped', row: sheetRow, reason: 'Sin idHorarios' });
          continue;
        }

        await Horarios.findOneAndUpdate(
          { idHorarios: record.idHorarios },
          { $set: record },
          { upsert: true, setDefaultsOnInsert: true }
        );

        results.push({ status: 'ok', row: sheetRow, idHorarios: record.idHorarios });
      } catch (err) {
        results.push({ status: 'error', row: sheetRow, error: err.message });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    console.log(`Importación finalizada: ${ok} ok, ${skipped} omitidos, ${errors} errores`);
    if (errors) results.filter((r) => r.status === 'error').forEach((r) => console.error(r));
  } catch (error) {
    console.error('Error durante la importación:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
