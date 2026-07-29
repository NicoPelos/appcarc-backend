// Migra User.roles de [String] (nombre del rol) a [ObjectId] (ref Rol) —
// ver appcarc-backend#24. Corre contra la colección cruda (bypass del modelo
// Mongoose de User) porque una vez que el schema declara roles como
// ObjectId, leer documentos viejos con strings a través del modelo tira
// errores de cast. Es idempotente: un rol que ya viene como ObjectId (una
// segunda corrida, o un usuario creado por código ya migrado) se deja igual.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Rol from '../src/resources/roles/models/Rol.js';
import { generarSlugUnico } from '../src/resources/roles/services/slug.service.js';
import { TODOS_LOS_PERMISOS } from '../src/constants/permisos.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

// 'superadmin' es un bypass hardcodeado sin Rol propio hasta ahora — si no
// existe, se crea acá para no perder el rol de ningún superadmin existente
// al migrar sus Users.
let rolSuperadmin = await Rol.findOne({ clubId: 'SUPER', nombre: 'superadmin' });
if (!rolSuperadmin) {
  const slug = await generarSlugUnico({ clubId: 'SUPER', nombre: 'superadmin' });
  rolSuperadmin = await Rol.create({ clubId: 'SUPER', nombre: 'superadmin', slug, permisos: TODOS_LOS_PERMISOS, active: true });
  console.log(`✅ Rol 'superadmin' creado (slug: ${slug})`);
}

const usersCollection = mongoose.connection.db.collection('users');
const users = await usersCollection.find({}).toArray();
console.log(`📋 ${users.length} usuarios encontrados`);

// nombre -> _id, cacheado por club para no repetir queries.
const rolIdPorClubYNombre = new Map();
const mapaDelClub = async (clubId) => {
  if (!rolIdPorClubYNombre.has(clubId)) {
    const roles = await Rol.find({ clubId }).select('nombre').lean();
    rolIdPorClubYNombre.set(clubId, new Map(roles.map((r) => [r.nombre, r._id])));
  }
  return rolIdPorClubYNombre.get(clubId);
};

let migrados = 0;
let yaMigrados = 0;
let sinCambios = 0;
const nombresSinMatch = new Set();

for (const user of users) {
  const roles = user.roles ?? [];
  if (roles.length === 0) { sinCambios++; continue; }

  const yaEsObjectId = roles.every((r) => mongoose.Types.ObjectId.isValid(r) && typeof r !== 'string');
  if (yaEsObjectId) { yaMigrados++; continue; }

  const mapa = await mapaDelClub(user.clubId);
  const nuevosRoles = [];
  for (const nombre of roles) {
    const id = mapa.get(nombre);
    if (id) {
      nuevosRoles.push(id);
    } else {
      nombresSinMatch.add(`${user.clubId}:${nombre}`);
    }
  }

  await usersCollection.updateOne({ _id: user._id }, { $set: { roles: nuevosRoles } });
  migrados++;
}

console.log(`✅ Migrados: ${migrados} | Ya migrados: ${yaMigrados} | Sin roles: ${sinCambios}`);
if (nombresSinMatch.size) {
  console.warn(`⚠️  Nombres de rol sin Rol correspondiente (se dropearon de esos usuarios):`);
  for (const n of nombresSinMatch) console.warn(`   - ${n}`);
}

await mongoose.disconnect();
