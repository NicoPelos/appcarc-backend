// Backfill único: completa Socio.fechaDeAsociado para los socios que quedaron
// sin ese dato (nunca se cargó al alta, o vino sin el campo desde la
// migración del Excel viejo). Ver appcarc-backend — pedido del club, sep-2026.
//
// Estrategia por socio, dentro de cada club:
//   1. Interpolación por socioNumber: se asume que los números de socio se
//      asignaron en orden cronológico (confirmado ~82% monótono contra los
//      que sí tienen fecha real) — se interpola linealmente entre los
//      vecinos más cercanos (uno de número menor, uno de número mayor) que
//      SÍ tengan fechaDeAsociado.
//   2. Primera Cuota real: el período más viejo de cualquier Cuota generada
//      para ese socio es prueba de que YA era socio en ese momento (una
//      Cuota nunca se genera antes de que exista la suscripción/alta) — cota
//      superior dura para la fecha real.
//   3. Fecha final = la MENOR entre las dos (nunca puede ser posterior a su
//      primera cuota real; si no hay cuota, se usa la interpolación tal
//      cual; si no hay ningún vecino con fecha, se usa el otro lado que sí
//      exista).
//
// Corre en modo dry-run por default (solo imprime qué haría) — pasar --apply
// para escribir de verdad. Igual que el backfill de vínculos MP: writes
// directos vía socio.save() (no hay endpoint HTTP para setear este campo en
// bulk, y es un dato de reporting, no financiero).
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Socio from '../src/resources/socios/models/Socio.js';
import Cuota from '../src/resources/cuotas/models/Cuota.js';

const APLICAR = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGO_URI);
console.log(`✅ MongoDB conectado (modo: ${APLICAR ? 'APLICAR CAMBIOS' : 'dry-run, pasá --apply para escribir'})`);

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

for (const clubId of clubIds) {
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
    const interpolado = interpolar(n, conFechaOrdenados);

    const [cuotaMasVieja] = await Cuota.find({ clubId, socioId: s._id }).sort({ periodo: 1 }).limit(1).lean();
    const cuotaFecha = cuotaMasVieja ? periodoAFecha(cuotaMasVieja.periodo) : null;

    let final = null;
    if (interpolado && cuotaFecha) final = interpolado < cuotaFecha ? interpolado : cuotaFecha;
    else final = interpolado || cuotaFecha;

    if (!final) {
      sinDatoSuficiente++;
      console.warn(`⚠️  #${s.socioNumber} ${s.apellido}, ${s.nombre}: sin vecinos con fecha ni Cuota — no se puede estimar, queda en null`);
      continue;
    }

    const gapMeses = interpolado && cuotaFecha
      ? Math.abs((cuotaFecha.getTime() - interpolado.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 0;
    const bajaConfianza = gapMeses > 18;
    if (bajaConfianza) flagsBajaConfianza++;

    console.log(
      `${bajaConfianza ? '🟡' : '✅'} #${s.socioNumber} ${s.apellido}, ${s.nombre} → ${final.toISOString().slice(0, 10)}`
      + ` (interp=${interpolado?.toISOString().slice(0, 10) ?? '—'}, cuota=${cuotaFecha?.toISOString().slice(0, 10) ?? '—'})`,
    );

    if (APLICAR) {
      await Socio.updateOne({ _id: s._id }, { $set: { fechaDeAsociado: final } });
    }
    actualizados++;
  }
}

console.log(`\nResumen: ${APLICAR ? 'actualizados' : 'a_actualizar'}=${actualizados} sin_dato_suficiente=${sinDatoSuficiente} baja_confianza=${flagsBajaConfianza}`);

await mongoose.disconnect();
