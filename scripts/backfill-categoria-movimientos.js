/**
 * backfill-categoria-movimientos.js
 *
 * Issue #55: Movimiento sumó un campo `categoria` (obligatorio de acá en
 * adelante para los cargados a mano desde "Registrar Movimiento"), pero los
 * movimientos manuales históricos no lo tienen. Este script les asigna una
 * categoría por palabras clave sobre el `concept` de texto libre — mismo
 * criterio que ya usaba sheetsExport.service.js para el resumen, para no
 * inventar una clasificación nueva.
 *
 * Idempotente: solo toca movimientos con categoria null/inexistente.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Movimiento from '../src/resources/movimientos/models/Movimiento.js';

const IMPORT_USER = 'backfill-categoria-movimientos-2026-08-11';

const categoriaIngreso = (concept = '') => {
  const c = concept.toLowerCase();
  if (/trekking|treking|treeking|viaje/.test(c)) return 'Viajes';
  if (/evento|asado|fiesta|cena/.test(c)) return 'Eventos';
  if (/venta|reventa|remera|merch/.test(c)) return 'Ventas / Reventa';
  if (/subsidio|donaci[oó]n/.test(c)) return 'Subsidios / Donaciones';
  return 'Otros';
};

const categoriaEgreso = (concept = '') => {
  const c = concept.toLowerCase();
  if (/honorario/.test(c)) return 'Honorarios';
  if (/alquiler|epec|federaci[oó]n patronal|federaci[oó]n andinista|impuesto/.test(c)) return 'Costos Fijos';
  return 'Varios';
};

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const pendientes = await Movimiento.find({
  sourceType: 'manual',
  active: true,
  $or: [{ categoria: null }, { categoria: { $exists: false } }],
}).select('type concept');

console.log(`Movimientos manuales sin categoría: ${pendientes.length}`);

const porCategoria = {};
let ok = 0;

for (const m of pendientes) {
  const categoria = m.type === 'Ingreso' ? categoriaIngreso(m.concept) : categoriaEgreso(m.concept);
  await Movimiento.updateOne({ _id: m._id }, { $set: { categoria, updatedBy: IMPORT_USER } });
  porCategoria[`${m.type} / ${categoria}`] = (porCategoria[`${m.type} / ${categoria}`] || 0) + 1;
  ok++;
}

console.log(`\n✅ Actualizados: ${ok}`);
console.log('Desglose por categoría asignada:');
for (const [k, v] of Object.entries(porCategoria).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

await mongoose.disconnect();
process.exit(0);
