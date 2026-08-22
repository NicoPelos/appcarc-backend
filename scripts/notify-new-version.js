// Avisa a todos los socios activos que hay una versión nueva de la app.
// Uso: node scripts/notify-new-version.js "<título>" "<cuerpo>"
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Rol from '../src/resources/roles/models/Rol.js';
import User from '../src/resources/usuarios/models/User.js';
import { notifyClub } from '../src/services/pushNotification.service.js';

const [title, body] = process.argv.slice(2);
if (!title || !body) {
  console.error('❌ Uso: node notify-new-version.js "<título>" "<cuerpo>"');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const rolExistente = await Rol.findOne({ nombre: { $in: ['admin', 'secretaria'] } }).lean();
const clubId = rolExistente?.clubId ?? (await User.findOne({ active: true }).lean())?.clubId;
if (!clubId) {
  console.error('❌ No se encontró ningún club.');
  process.exit(1);
}

const { sent } = await notifyClub(clubId, {
  title,
  body,
  data: { tipo: 'nueva_version', url: 'https://raspberrypi.tail703951.ts.net/download' },
});
console.log(`✅ Notificación enviada a ${sent} dispositivos`);
await mongoose.disconnect();
