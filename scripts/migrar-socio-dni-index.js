/**
 * migrar-socio-dni-index.js
 *
 * El índice único de Socio.dni pasó de global a compuesto {clubId, dni}
 * (appcarc-backend#130), para que dos clubes distintos que comparten base
 * puedan tener cada uno un socio con el mismo DNI (la misma persona asociada
 * a dos clubes). Mongo no actualiza índices existentes solo porque cambió la
 * definición en el schema, así que hay que reconstruirlo a mano.
 *
 * Idempotente: syncIndexes() solo toca los índices que no coinciden con el
 * schema actual.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Socio from '../src/resources/socios/models/Socio.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const antes = await Socio.collection.indexes();
console.log('📋 Índices actuales:', antes.map((i) => i.name).join(', '));

const resultado = await Socio.syncIndexes();
console.log('🔧 syncIndexes:', resultado);

const despues = await Socio.collection.indexes();
console.log('📋 Índices finales:', despues.map((i) => i.name).join(', '));

await mongoose.disconnect();
console.log('✅ Listo');
