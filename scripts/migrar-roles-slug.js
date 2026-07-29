/**
 * migrar-roles-slug.js
 *
 * Rol ahora requiere `slug` (identidad estable, separada del nombre editable
 * — ver appcarc-backend#24). Este script le genera un slug a cada Rol
 * existente que todavía no lo tiene.
 *
 * Idempotente: si un Rol ya tiene slug, no lo toca.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Rol from '../src/resources/roles/models/Rol.js';
import { generarSlugUnico } from '../src/resources/roles/services/slug.service.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const sinSlug = await Rol.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
console.log(`📋 Roles sin slug: ${sinSlug.length}`);

let actualizados = 0;
for (const rol of sinSlug) {
  const slug = await generarSlugUnico({ clubId: rol.clubId, nombre: rol.nombre, excludeId: rol._id });
  rol.slug = slug;
  await rol.save();
  console.log(`  ✓ ${rol.clubId} / "${rol.nombre}" -> slug "${slug}"`);
  actualizados++;
}

console.log(`\n✅ Roles actualizados: ${actualizados}`);

await mongoose.disconnect();
