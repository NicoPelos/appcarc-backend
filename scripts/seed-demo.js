import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { resetDemoClub, DEMO_CREDENTIALS } from '../src/services/demoSeed.service.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const result = await resetDemoClub();

console.log(`\n✅ Club demo reseteado: ${result.socios} socios ficticios.`);
console.log('\nCredenciales:');
console.log(`  Socio: ${DEMO_CREDENTIALS.socio.email} / ${DEMO_CREDENTIALS.socio.password}`);
console.log(`  Admin: ${DEMO_CREDENTIALS.admin.email} / ${DEMO_CREDENTIALS.admin.password}`);

await mongoose.disconnect();
