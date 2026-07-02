import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

import User from '../src/resources/usuarios/models/User.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const email    = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌ Faltan SUPERADMIN_EMAIL o SUPERADMIN_PASSWORD en .env');
  process.exit(1);
}

const existe = await User.findOne({ email, clubId: 'SUPER' });
if (existe) {
  console.log(`ℹ️  Superadmin '${email}' ya existe — sin cambios`);
  await mongoose.disconnect();
  process.exit(0);
}

const salt = await bcrypt.genSalt(10);
const hashed = await bcrypt.hash(password, salt);

await User.create({
  email,
  password: hashed,
  nombre: 'Superadmin',
  roles: ['superadmin'],
  clubId: 'SUPER',
  active: true,
});

console.log(`✅ Superadmin creado: ${email}`);
await mongoose.disconnect();
