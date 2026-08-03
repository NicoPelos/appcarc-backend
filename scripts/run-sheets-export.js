import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Pre-register models needed for populate chains
import '../src/resources/planes/models/Plan.js';
import '../src/resources/socios/models/Socio.js';
import '../src/resources/asistencias/models/Asistencia.js';

import { exportToSheets } from '../src/services/sheetsExport.service.js';
import Club from '../src/resources/clubs/models/Club.js';

const clubSlug = process.env.DEFAULT_CLUB_ID || 'CARC';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const club = await Club.findOne({ slug: clubSlug });
if (!club) throw new Error(`Club "${clubSlug}" no encontrado`);

const result = await exportToSheets({
  clubId: club.slug,
  clubName: club.nombre,
  spreadsheetId: club.integraciones?.sheets?.spreadsheetId,
});
console.log('✅ Export completado');
console.log('   URL:', result.url);
console.log('   Stats:', JSON.stringify(result.stats, null, 2));

await mongoose.disconnect();
