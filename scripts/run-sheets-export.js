import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Pre-register models needed for populate chains
import '../src/resources/escuelita/models/CategoriaEscuelita.js';
import '../src/resources/socios/models/Socio.js';
import '../src/resources/asistencias/models/Asistencia.js';

import { exportToSheets } from '../src/services/sheetsExport.service.js';

const clubId = process.env.DEFAULT_CLUB_ID || 'CARC';
const clubName = process.env.CLUB_NAME || 'CARC';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const result = await exportToSheets({ clubId, clubName });
console.log('✅ Export completado');
console.log('   URL:', result.url);
console.log('   Stats:', JSON.stringify(result.stats, null, 2));

await mongoose.disconnect();
