import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Rol from '../src/resources/roles/models/Rol.js';
import { PERMISOS, TODOS_LOS_PERMISOS } from '../src/constants/permisos.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

// Obtener clubId de CARC desde la BD (primer usuario admin)
import User from '../src/resources/usuarios/models/User.js';
const adminUser = await User.findOne({ roles: 'admin' }).lean();
if (!adminUser) {
  console.error('❌ No se encontró ningún usuario admin. Especificá el clubId manualmente.');
  process.exit(1);
}
const clubId = adminUser.clubId;
console.log(`📋 Club: ${clubId}`);

const P = PERMISOS;

const ROLES_SEED = [
  {
    nombre: 'admin',
    permisos: TODOS_LOS_PERMISOS,
  },
  {
    nombre: 'autoridad',
    permisos: [
      P.SOCIOS_READ,
      P.COBROS_READ,
      P.MOVIMIENTOS_READ,
      P.ESCUELITA_READ,
      P.MURO_LIBRE_READ,
      P.HORARIOS_READ, P.HORARIOS_DEUDA,
      P.ETIQUETAS_READ,
      P.PRECIOS_READ,
      P.SUSCRIPCIONES_READ,
      P.EXPORT_SHEETS,
      P.AUDIT_READ,
      P.ASISTENCIAS_READ,
    ],
  },
  {
    nombre: 'secretaria',
    permisos: [
      P.SOCIOS_READ, P.SOCIOS_WRITE, P.SOCIOS_RESTORE,
      P.COBROS_READ, P.COBROS_WRITE, P.COBROS_DELETE,
      P.MOVIMIENTOS_READ, P.MOVIMIENTOS_WRITE, P.MOVIMIENTOS_DELETE,
      P.ESCUELITA_READ, P.ESCUELITA_WRITE, P.ESCUELITA_DELETE, P.ESCUELITA_CHECKIN,
      P.MURO_LIBRE_READ, P.MURO_LIBRE_WRITE, P.MURO_LIBRE_DELETE, P.MURO_LIBRE_CHECKIN,
      P.HORARIOS_READ, P.HORARIOS_WRITE, P.HORARIOS_DELETE, P.HORARIOS_DEUDA,
      P.ETIQUETAS_READ,
      P.PRECIOS_READ,
      P.SUSCRIPCIONES_READ, P.SUSCRIPCIONES_WRITE, P.SUSCRIPCIONES_CLOSE,
      P.ASISTENCIAS_READ, P.ASISTENCIAS_WRITE,
      P.NOVEDADES_WRITE,
      P.USUARIOS_WRITE,
      P.ROLES_READ,
    ],
  },
  {
    nombre: 'profesor',
    permisos: [
      P.ESCUELITA_READ, P.ESCUELITA_CHECKIN,
      P.HORARIOS_READ,
      P.ASISTENCIAS_READ, P.ASISTENCIAS_WRITE,
    ],
  },
  {
    nombre: 'palestrero',
    permisos: [
      P.MURO_LIBRE_READ, P.MURO_LIBRE_WRITE, P.MURO_LIBRE_DELETE, P.MURO_LIBRE_CHECKIN,
      P.HORARIOS_READ, P.HORARIOS_WRITE, P.HORARIOS_DELETE,
    ],
  },
  {
    nombre: 'limpieza',
    permisos: [
      P.HORARIOS_READ, P.HORARIOS_WRITE, P.HORARIOS_DELETE,
    ],
  },
  {
    nombre: 'arreglos',
    permisos: [
      P.HORARIOS_READ, P.HORARIOS_WRITE, P.HORARIOS_DELETE,
    ],
  },
  {
    nombre: 'colaborador',
    permisos: [
      P.SOCIOS_READ,
      P.ESCUELITA_READ, P.ESCUELITA_CHECKIN,
      P.MURO_LIBRE_READ, P.MURO_LIBRE_WRITE, P.MURO_LIBRE_CHECKIN,
      P.HORARIOS_READ,
      P.ASISTENCIAS_READ, P.ASISTENCIAS_WRITE,
    ],
  },
  {
    nombre: 'socio',
    permisos: [
      P.SOCIOS_READ,
      P.MURO_LIBRE_READ, P.MURO_LIBRE_CHECKIN,
    ],
  },
];

let creados = 0;
let actualizados = 0;

for (const rol of ROLES_SEED) {
  const result = await Rol.findOneAndUpdate(
    { clubId, nombre: rol.nombre },
    { $set: { permisos: rol.permisos, active: true } },
    { upsert: true, new: true },
  );
  if (result.createdAt?.getTime() === result.updatedAt?.getTime()) {
    creados++;
  } else {
    actualizados++;
  }
}

console.log(`✅ Roles creados: ${creados} | Actualizados: ${actualizados}`);
await mongoose.disconnect();
