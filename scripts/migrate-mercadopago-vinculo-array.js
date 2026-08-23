// Migración única: mercadopagoVinculo (objeto) -> mercadopagoVinculos (array).
// Usa el driver nativo (no el modelo Mongoose) para poder leer/escribir el
// campo viejo, que ya no está declarado en el schema.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const col = mongoose.connection.collection('movimientos');
const docs = await col.find({ mercadopagoVinculo: { $ne: null } }).toArray();
console.log(`Encontrados ${docs.length} movimiento(s) con el campo viejo`);

for (const doc of docs) {
  await col.updateOne(
    { _id: doc._id },
    { $set: { mercadopagoVinculos: [doc.mercadopagoVinculo] }, $unset: { mercadopagoVinculo: '' } },
  );
  console.log(`  ✓ ${doc._id}`);
}

console.log('✅ Migración completa');
await mongoose.disconnect();
