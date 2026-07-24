/**
 * migrar-escuelita-estado-pausado.js
 *
 * El enum de Escuelita.estado se simplificó de ['activo', 'pausado', 'baja']
 * a ['activo', 'baja']. Este script pasa a 'baja' todos los registros que
 * hayan quedado en 'pausado' (valor ya no válido para el enum actual).
 *
 * Idempotente: si no hay registros en 'pausado', no hace nada.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Escuelita from '../src/resources/escuelita/models/Escuelita.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const pausados = await Escuelita.find({ estado: 'pausado' }).lean();
console.log(`📋 Registros en estado "pausado": ${pausados.length}`);

if (pausados.length > 0) {
  const result = await Escuelita.updateMany(
    { estado: 'pausado' },
    { $set: { estado: 'baja' } },
  );
  console.log(`✅ Actualizados a "baja": ${result.modifiedCount}`);
} else {
  console.log('Nada que migrar.');
}

await mongoose.disconnect();
