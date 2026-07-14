import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { notifyClub } from '../src/services/pushNotification.service.js';

dotenv.config();

const CLUB_ID = process.env.DEFAULT_CLUB_ID || 'CARC';

const NOTIFICATION = {
  title: 'Hay una versión nueva de la app',
  body: 'Entrá a nuestra bio de Instagram: si tenés Android, tocá "Descargar la app (Android)". Si tenés iPhone, tocá "Usar la app (iPhone)".',
  data: { tipo: 'app-update', url: 'https://raspberrypi.tail703951.ts.net/link' },
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB');

  const result = await notifyClub(CLUB_ID, NOTIFICATION);
  console.log(`Notificaciones enviadas: ${result.sent}`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Error enviando notificación de actualización:', err);
  process.exit(1);
});
