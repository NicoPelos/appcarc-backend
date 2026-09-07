// Backfill único: completa Socio.fechaDeAsociado para los socios que quedaron
// sin ese dato (nunca se cargó al alta, o vino sin el campo desde la
// migración del Excel viejo). Ver appcarc-backend — pedido del club, sep-2026.
//
// Estrategia por socio, dentro de cada club:
//   0. Alta individual real (createdAt confiable): si el socio se creó en un
//      día donde casi nadie más se creó en ese club (no fue parte de la
//      migración masiva del Excel viejo, que crea cientos de Socio en el
//      mismo día/minuto), su Socio.createdAt ES la fecha real de alta — se
//      usa directo, sin estimar nada.
//   1. Si no (es un registro migrado), se interpola por socioNumber: se
//      asume que los números de socio se asignaron en orden cronológico
//      (confirmado ~82% monótono contra los que sí tienen fecha real) —
//      interpolación lineal entre los vecinos más cercanos (uno de número
//      menor, uno de número mayor) que SÍ tengan fechaDeAsociado.
//   2. Primera Cuota real: el período más viejo de cualquier Cuota generada
//      para ese socio es prueba de que YA era socio en ese momento (una
//      Cuota nunca se genera antes de que exista la suscripción/alta) — cota
//      superior dura para la fecha real.
//   3. Fecha final (para los migrados) = la MENOR entre interpolación y
//      primera cuota (nunca puede ser posterior a su primera cuota real; si
//      no hay cuota, se usa la interpolación tal cual; si no hay ningún
//      vecino con fecha, se usa el otro lado que sí exista).
//
// Corre en modo dry-run por default (solo imprime qué haría) — pasar --apply
// para escribir de verdad. Igual que el backfill de vínculos MP: writes
// directos vía Socio.updateOne (no hay endpoint HTTP para setear este campo
// en bulk, y es un dato de reporting, no financiero).
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Socio from '../src/resources/socios/models/Socio.js';
import Cuota from '../src/resources/cuotas/models/Cuota.js';

const APLICAR = process.argv.includes('--apply');
// Un día con más socios creados que esto se considera una migración/import
// masivo, no altas individuales reales.
const UMBRAL_ALTA_MASIVA = 5;

await mongoose.connect(process.env.MONGO_URI);
console.log(`✅ MongoDB conectado (modo: ${APLICAR ? 'APLICAR CAMBIOS' : 'dry-run, pasá --apply para escribir'})`);

const diaDe = (fecha) => new Date(fecha).toISOString().slice(0, 10);

const periodoAFecha = (periodo) => {
  const [y, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

const interpolar = (n, conFechaOrdenados) => {
  let menor = null;
  let mayor = null;
  for (const x of conFechaOrdenados) {
    if (x.n < n) menor = x;
    if (x.n > n && !mayor) mayor = x;
  }
  if (menor && mayor) {
    const t = (n - menor.n) / (mayor.n - menor.n);
    return new Date(menor.fecha.getTime() + t * (mayor.fecha.getTime() - menor.fecha.getTime()));
  }
  return menor?.fecha || mayor?.fecha || null;
};

const todos = await Socio.find({ fechaDeAsociado: null, socioNumber: { $ne: null } }).lean();
const clubIds = [...new Set(todos.map((s) => s.clubId))];
console.log(`Socios sin fechaDeAsociado (con socioNumber numérico): a revisar en ${clubIds.length} club(es)`);

let actualizados = 0;
let sinDatoSuficiente = 0;
let flagsBajaConfianza = 0;
let porCreatedAtReal = 0;

for (const clubId of clubIds) {
  // Distribución de altas por día en TODO el club (no solo los sin fecha) —
  // así se detecta el/los día(s) de migración masiva aunque el socio en
  // cuestión ya tenga o no fechaDeAsociado cargada.
  const todosDelClub = await Socio.find({ clubId }).select('createdAt').lean();
  const porDia = new Map();
  for (const s of todosDelClub) {
    const dia = diaDe(s.createdAt);
    porDia.set(dia, (porDia.get(dia) || 0) + 1);
  }

  const conFecha = await Socio.find({ clubId, fechaDeAsociado: { $ne: null }, socioNumber: { $ne: null } })
    .select('socioNumber fechaDeAsociado')
    .lean();
  const conFechaOrdenados = conFecha
    .filter((s) => /^\d+$/.test(s.socioNumber))
    .map((s) => ({ n: Number(s.socioNumber), fecha: new Date(s.fechaDeAsociado) }))
    .sort((a, b) => a.n - b.n);

  const sinFecha = todos.filter((s) => s.clubId === clubId && /^\d+$/.test(s.socioNumber));
  console.log(`\n— Club ${clubId}: ${sinFecha.length} socios sin fecha, ${conFechaOrdenados.length} con fecha real para interpolar —`);

  for (const s of sinFecha) {
    const n = Number(s.socioNumber);
    const esAltaIndividual = s.createdAt && porDia.get(diaDe(s.createdAt)) <= UMBRAL_ALTA_MASIVA;

    let final;
    let detalle;
    let bajaConfianza = false;

    if (esAltaIndividual) {
      final = new Date(s.createdAt);
      detalle = `createdAt real, alta individual (${porDia.get(diaDe(s.createdAt))} altas ese día)`;
      porCreatedAtReal++;
    } else {
      const interpolado = interpolar(n, conFechaOrdenados);
      const [cuotaMasVieja] = await Cuota.find({ clubId, socioId: s._id }).sort({ periodo: 1 }).limit(1).lean();
      const cuotaFecha = cuotaMasVieja ? periodoAFecha(cuotaMasVieja.periodo) : null;

      final = interpolado && cuotaFecha ? (interpolado < cuotaFecha ? interpolado : cuotaFecha) : (interpolado || cuotaFecha);
      detalle = `interp=${interpolado?.toISOString().slice(0, 10) ?? '—'}, cuota=${cuotaFecha?.toISOString().slice(0, 10) ?? '—'}`;

      const gapMeses = interpolado && cuotaFecha
        ? Math.abs((cuotaFecha.getTime() - interpolado.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;
      bajaConfianza = gapMeses > 18;
    }

    if (!final) {
      sinDatoSuficiente++;
      console.warn(`⚠️  #${s.socioNumber} ${s.apellido}, ${s.nombre}: sin vecinos con fecha ni Cuota — no se puede estimar, queda en null`);
      continue;
    }
    if (bajaConfianza) flagsBajaConfianza++;

    console.log(
      `${bajaConfianza ? '🟡' : '✅'} #${s.socioNumber} ${s.apellido}, ${s.nombre} → ${final.toISOString().slice(0, 10)} (${detalle})`,
    );

    if (APLICAR) {
      await Socio.updateOne({ _id: s._id }, { $set: { fechaDeAsociado: final } });
    }
    actualizados++;
  }
}

console.log(`\nResumen: ${APLICAR ? 'actualizados' : 'a_actualizar'}=${actualizados} por_createdAt_real=${porCreatedAtReal} sin_dato_suficiente=${sinDatoSuficiente} baja_confianza=${flagsBajaConfianza}`);

await mongoose.disconnect();
