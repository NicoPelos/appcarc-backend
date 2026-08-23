// Backfill único: movimientos ya vinculados a MP antes de que vincular
// pasara a actualizar paymentMethod automáticamente.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Movimiento from '../src/resources/movimientos/models/Movimiento.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const result = await Movimiento.updateMany(
  { mercadopagoVinculo: { $ne: null }, paymentMethod: { $ne: 'MercadoPago' } },
  { $set: { paymentMethod: 'MercadoPago' } },
);
console.log(`✅ Actualizados: ${result.modifiedCount}`);

await mongoose.disconnect();
