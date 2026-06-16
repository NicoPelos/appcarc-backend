import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Socio from '../src/resources/socios/models/Socio.js';
import Cuota from '../src/resources/cuotas/models/Cuota.js';
import { getSheetValues } from '../src/services/googleSheetsService.js';

dotenv.config();

const SPREADSHEET_ID = '12gJWSqSCYkUeDILuxrJDBBstocZGy1kD4eSTUP5do8I';
const SHEET_NAME = 'Hoja 12';
const CLUB_ID = process.env.DEFAULT_CLUB_ID;
const IMPORT_USER = 'sheet-import-cuotas';

const TIPO_MAP = {
  'cuota social': 'social',
  'cuota escuelita': 'escuelita',
};

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const addMonths = (periodo, n) => {
  const [year, month] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const expandPeriodos = (desde, hasta) => {
  const periodos = [];
  let current = desde;
  let guard = 0;
  while (current <= hasta && guard < 500) {
    periodos.push(current);
    current = addMonths(current, 1);
    guard++;
  }
  return periodos;
};

const parseTipo = (raw) => TIPO_MAP[String(raw || '').trim().toLowerCase()] || null;

const run = async () => {
  if (!CLUB_ID) {
    console.error('Falta DEFAULT_CLUB_ID en .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB');

  const values = await getSheetValues(SPREADSHEET_ID, `${SHEET_NAME}!A:M`);
  if (!values.length) {
    console.log('Hoja vacía');
    process.exit(0);
  }

  const [header, ...rows] = values;

  const col = (name) => header.findIndex((h) => h.trim() === name);
  const COL = {
    idSocio:    col('idSocio'),
    desde:      col('Desde'),
    hasta:      col('Hasta'),
    estado:     col('Estado'),
    tipo:       col('TipoDeCuota'),
  };

  const summary = { ok: 0, skipped: 0, errors: 0, socioNotFound: 0 };
  const notFound = [];

  // Cache socios por DNI para no repetir queries
  const socioCache = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;

    const dni    = String(row[COL.idSocio] || '').trim();
    const desde  = String(row[COL.desde]   || '').trim();
    const hasta  = String(row[COL.hasta]   || '').trim();
    const estado = String(row[COL.estado]  || '').trim();
    const tipoRaw = String(row[COL.tipo]   || '').trim();
    const tipo   = parseTipo(tipoRaw);

    if (!dni || !desde || !hasta) {
      console.log(`Fila ${sheetRow}: saltada — faltan datos (dni="${dni}", desde="${desde}", hasta="${hasta}")`);
      summary.skipped++;
      continue;
    }

    if (!PERIODO_RE.test(desde) || !PERIODO_RE.test(hasta)) {
      console.log(`Fila ${sheetRow}: saltada — formato de período inválido (desde="${desde}", hasta="${hasta}")`);
      summary.skipped++;
      continue;
    }

    if (!tipo) {
      console.log(`Fila ${sheetRow}: saltada — tipo de cuota desconocido ("${tipoRaw}")`);
      summary.skipped++;
      continue;
    }

    // Buscar socio por DNI
    let socio = socioCache.get(dni);
    if (!socio) {
      socio = await Socio.findOne({ dni, clubId: CLUB_ID }).lean();
      socioCache.set(dni, socio || null);
    }

    if (!socio) {
      console.log(`Fila ${sheetRow}: socio no encontrado (dni="${dni}", estado="${estado}")`);
      notFound.push({ sheetRow, dni, desde, hasta, estado });
      summary.socioNotFound++;
      continue;
    }

    const periodos = expandPeriodos(desde, hasta);
    let rowOk = 0;
    let rowErr = 0;

    for (const periodo of periodos) {
      try {
        await Cuota.updateOne(
          { clubId: CLUB_ID, socioId: socio._id, tipo, periodo },
          {
            $set: {
              estado: 'pagada',
              montoEsperadoSnapshot: 0,
              montoPagadoSnapshot: 0,
              precioSugeridoSnapshot: null,
              precioCodigo: tipo === 'social' ? 'cuota_social' : 'cuota_escuelita',
              paymentMethod: 'Efectivo',
              description: 'Importado desde planilla histórica',
              fechaPago: new Date(`${periodo}-01`),
              cobroId: null,
              movimientoId: null,
              active: true,
              updatedBy: IMPORT_USER,
            },
            $setOnInsert: {
              createdBy: IMPORT_USER,
            },
          },
          { upsert: true },
        );
        rowOk++;
      } catch (err) {
        console.error(`Fila ${sheetRow} periodo ${periodo}: error — ${err.message}`);
        rowErr++;
      }
    }

    console.log(`Fila ${sheetRow}: socio dni=${dni} (${socio.apellido} ${socio.nombre}) — ${periodos.length} períodos (${desde} → ${hasta}), estado="${estado}" → ${rowOk} ok, ${rowErr} errores`);
    summary.ok += rowOk;
    summary.errors += rowErr;
  }

  console.log('\n── Resumen ──────────────────────────────');
  console.log(`  Cuotas importadas/actualizadas: ${summary.ok}`);
  console.log(`  Filas saltadas:                 ${summary.skipped}`);
  console.log(`  Socios no encontrados:          ${summary.socioNotFound}`);
  console.log(`  Errores:                        ${summary.errors}`);

  if (notFound.length) {
    console.log('\n── Socios no encontrados (DNI a corregir en el sheet) ──');
    notFound.forEach(({ sheetRow, dni, desde, hasta, estado }) =>
      console.log(`  Fila ${sheetRow}: dni="${dni}", ${desde}→${hasta}, estado="${estado}"`));
  }

  await mongoose.disconnect();
  process.exit(summary.errors > 0 ? 1 : 0);
};

run();
