/**
 * migrar-plan-nombre-index.js
 *
 * El índice único {clubId, nombre} de Plan pasó a tener
 * partialFilterExpression: { active: true } (appcarc-backend#125), para que
 * un plan con soft-delete no bloquee reusar su nombre — mismo criterio que
 * ya usa Rol.js. Mongo no actualiza índices existentes solo porque cambió la
 * definición en el schema, así que hay que reconstruirlo a mano.
 *
 * Idempotente: syncIndexes() solo toca los índices que no coinciden con el
 * schema actual.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Plan from '../src/resources/planes/models/Plan.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const antes = await Plan.collection.indexes();
console.log('📋 Índices actuales:', antes.map((i) => i.name).join(', '));

const resultado = await Plan.syncIndexes();
console.log('🔧 syncIndexes:', resultado);

const despues = await Plan.collection.indexes();
console.log('📋 Índices finales:', despues.map((i) => i.name).join(', '));

await mongoose.disconnect();
console.log('✅ Listo');
