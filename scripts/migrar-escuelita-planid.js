/**
 * migrar-escuelita-planid.js
 *
 * Para cada registro de Escuelita que tiene categoriaId (viejo),
 * encuentra el Plan correspondiente (via Plan.atributos.categoriaEscuelitaId)
 * y setea planId en el registro.
 *
 * Idempotente: omite registros que ya tienen planId.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Escuelita from '../src/resources/escuelita/models/Escuelita.js';
import Plan from '../src/resources/planes/models/Plan.js';
import User from '../src/resources/usuarios/models/User.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const adminUser = await User.findOne({ roles: 'admin' }).lean();
const clubId = adminUser?.clubId;
console.log(`📋 Club: ${clubId}\n`);

// Armar mapa categoriaEscuelitaId → planId
const planes = await Plan.find({ clubId, tipo: 'escuelita', active: true }).lean();
const catAPlan = {};
for (const p of planes) {
  const catId = p.atributos?.categoriaEscuelitaId?.toString();
  if (catId) catAPlan[catId] = p._id;
}
console.log(`🗺  Planes escuelita mapeados: ${Object.keys(catAPlan).length}`);

// Buscar Escuelita sin planId (o con planId null)
const sinPlan = await Escuelita.find({ clubId, planId: null, active: true }).lean();
console.log(`📋 Registros sin planId: ${sinPlan.length}`);

let actualizados = 0;
let sinCategoria = 0;
let sinMatch = 0;

for (const alumno of sinPlan) {
  const catId = alumno.categoriaId?.toString();
  if (!catId) { sinCategoria++; continue; }

  const planId = catAPlan[catId];
  if (!planId) {
    console.warn(`  ⚠️  Sin plan para categoría ${catId} (socioId: ${alumno.socioId})`);
    sinMatch++;
    continue;
  }

  await Escuelita.updateOne({ _id: alumno._id }, { $set: { planId } });
  actualizados++;
}

console.log(`\n✅ Actualizados: ${actualizados} | Sin categoría: ${sinCategoria} | Sin match: ${sinMatch}`);

await mongoose.disconnect();
