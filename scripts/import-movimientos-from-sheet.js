import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Movimiento from '../src/resources/movimientos/models/Movimiento.js';
import { getSheetValues } from '../src/services/googleSheetsService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const spreadsheetId = process.env.GOOGLE_SHEETS_SOCIOS_ID;
const sheetName = process.env.GOOGLE_SHEETS_MOVIMIENTOS_SHEET_NAME || 'Movimientos';
const CLUB_ID = process.env.DEFAULT_CLUB_ID || 'CARC';
const ADMIN_USER_ID = new mongoose.Types.ObjectId(process.env.IMPORT_USER_ID || '6a34648889a6a9edc330f309');

if (!MONGO_URI) {
  console.error('Falta la variable MONGO_URI en .env');
  process.exit(1);
}

if (!spreadsheetId) {
  console.error('Falta la variable GOOGLE_SHEETS_SOCIOS_ID en .env');
  process.exit(1);
}

const parseMonto = (val) => {
  if (!val) return 0;
  // "$45.000,00" → 45000
  return parseFloat(val.replace(/[$.]/g, '').replace(',', '.')) || 0;
};

const parseDate = (val) => {
  if (!val) return null;
  const match = val.match(/^(\d{1,2})\/(\d{2})\/(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1].padStart(2, '0')}`);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const TIPO_MAP = { 'Entrada': 'Ingreso', 'Salida': 'Egreso' };
const PAGO_VALID = ['Efectivo', 'Transferencia'];

const rowToMovimiento = (header, row) => {
  const get = (col) => {
    const idx = header.indexOf(col);
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  const creadoPor = get('CreadoPor');
  const responsable = get('Responsable') || creadoPor;
  const formaPago = PAGO_VALID.includes(get('forma de pago')) ? get('forma de pago') : 'Efectivo';
  const tipo = TIPO_MAP[get('TipoDeMovimiento')] || 'Ingreso';

  return {
    clubId:        CLUB_ID,
    userId:        ADMIN_USER_ID,
    responsable,
    type:          tipo,
    amount:        parseMonto(get('Monto')),
    concept:       get('Descripción'),
    paymentMethod: formaPago,
    formId:        get('idMovimientos'),
    sourceType:    'manual',
    date:          parseDate(get('Fecha')),
    createdBy:     creadoPor,
    updatedBy:     get('ActualizadoPor') || creadoPor,
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
        const record = rowToMovimiento(header, row);

        if (!record.formId) {
          results.push({ status: 'skipped', row: sheetRow, reason: 'Sin idMovimientos' });
          continue;
        }

        if (!record.concept) {
          results.push({ status: 'skipped', row: sheetRow, reason: 'Sin descripción' });
          continue;
        }

        await Movimiento.findOneAndUpdate(
          { formId: record.formId, clubId: CLUB_ID },
          { $set: record },
          { upsert: true, setDefaultsOnInsert: true }
        );

        results.push({ status: 'ok', row: sheetRow, formId: record.formId, amount: record.amount });
      } catch (err) {
        results.push({ status: 'error', row: sheetRow, error: err.message });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    console.log(`Importación finalizada: ${ok} ok, ${skipped} omitidos, ${errors} errores`);
    results.filter((r) => r.status === 'ok').forEach((r) => console.log(r));
    if (errors) results.filter((r) => r.status === 'error').forEach((r) => console.error(r));
  } catch (error) {
    console.error('Error durante la importación:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
