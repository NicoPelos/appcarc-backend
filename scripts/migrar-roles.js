import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../src/resources/usuarios/models/User.js';

const MAPEO = { admin: 'admin', secretary: 'secretaria', socio: 'socio' };

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const users = await User.find({}).select('+role').lean();
console.log(`📋 Usuarios encontrados: ${users.length}`);

let migrados = 0;
let saltados = 0;

for (const u of users) {
  if (u.roles && u.roles.length > 0) {
    saltados++;
    continue;
  }
  const nuevoRol = MAPEO[u.role] ?? 'socio';
  await User.updateOne({ _id: u._id }, { $set: { roles: [nuevoRol] } });
  migrados++;
}

console.log(`✅ Migrados: ${migrados} | Saltados (ya tenían roles): ${saltados}`);
await mongoose.disconnect();
