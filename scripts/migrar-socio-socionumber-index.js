/**
 * migrar-socio-socionumber-index.js
 *
 * El índice único {clubId, socioNumber} de Socio pasó de sparse a
 * partialFilterExpression (appcarc-backend#141) — sparse en un índice
 * COMPUESTO solo excluye un documento si le faltan TODOS los campos
 * indexados, no alcanza con que falte socioNumber solo (clubId siempre está
 * presente), así que dos Socio del mismo club sin socioNumber colisionaban
 * igual con un E11000 críptico. Mongo no actualiza índices existentes solo
 * porque cambió la definición en el schema, así que hay que reconstruirlo.
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
