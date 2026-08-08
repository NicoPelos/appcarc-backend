import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { obtenerRolIdsPorSlugs, obtenerSlugsPorRolIds } from '../../roles/services/resolverRoles.service.js';

export const syncSocioUserFromSocio = async (socio) => {
  if (!socio?.correoElectronico || !socio?.dni) return null;

  const email = socio.correoElectronico.toLowerCase().trim();
  const nombre = `${socio.apellido || ''} ${socio.nombre || ''}`.trim();
  const password = socio.dni.toString().trim();

  if (!email || !password) return null;

  let user = null;
  if (socio._id) {
    user = await User.findOne({ socioId: socio._id.toString() });
  }
  if (!user) {
    user = await User.findOne({ email });
  }

  if (user) {
    // Dos Socios del mismo club pueden compartir el email de contacto (típico:
    // padre e hijo, el hijo no tiene email propio). Si el User que matcheó por
    // email ya es la cuenta de OTRO socio (su socioId ya está seteado y es
    // distinto), no hay que fusionar identidades: pisar nombre/rol/password acá
    // le robaría la cuenta a ese otro socio en silencio. Este socio se queda
    // sin User propio hasta que tenga un email distinto.
    if (user.socioId && socio._id && user.socioId !== socio._id.toString()) {
      console.error(`No se sincronizó User para socio ${socio._id}: el email ${email} ya pertenece a la cuenta del socio ${user.socioId}`);
      return null;
    }

    user.nombre = nombre || user.nombre;
    user.clubId = socio.clubId || user.clubId;
    user.email = email;
    user.socioId = user.socioId || socio._id?.toString();
    const protectedRoles = ['admin', 'secretaria', 'socio'];
    const slugsActuales = await obtenerSlugsPorRolIds(user.roles);
    if (!slugsActuales.some(r => protectedRoles.includes(r))) {
      user.roles = await obtenerRolIdsPorSlugs({ clubId: user.clubId, slugs: ['socio'] });
      user.active = true;
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }
    await user.save();
    return user;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const rolesSocio = await obtenerRolIdsPorSlugs({ clubId: socio.clubId, slugs: ['socio'] });

  user = new User({
    email,
    password: hashedPassword,
    nombre,
    roles: rolesSocio,
    clubId: socio.clubId,
    socioId: socio._id?.toString(),
    active: true,
    mustChangePassword: true,
  });

  await user.save();
  return user;
};
