import bcrypt from 'bcryptjs';
import User from '../../usuarios/models/User.js';
import Socio from '../../socios/models/Socio.js';
import VinculoFamiliar from '../models/VinculoFamiliar.js';
import { syncSocioUserFromSocio } from '../../usuarios/services/userSync.js';
import { obtenerRolIdsPorSlugs } from '../../roles/services/resolverRoles.service.js';

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

// Devuelve { user, passwordTemporal } — passwordTemporal solo viene seteado
// cuando se creó una cuenta nueva en este llamado, para que quien está
// vinculando pueda comunicársela al tutor (no hay ningún otro canal: no es
// socio, no tiene DNI conocido, y el sistema no manda emails de bienvenida).
const resolverPadre = async ({ clubId, padreUserId, padreSocioId, padreEmail, padreNombre, actor }) => {
  if (padreUserId) {
    const user = await User.findOne({ _id: padreUserId, clubId, active: true });
    if (!user) throw new BusinessError('El usuario tutor indicado no existe o pertenece a otro club', 404);
    return { user, passwordTemporal: null };
  }

  if (padreSocioId) {
    const socioPadre = await Socio.findOne({ _id: padreSocioId, clubId, active: true }).lean();
    if (!socioPadre) throw new BusinessError('El socio tutor indicado no existe o pertenece a otro club', 404);

    const existente = await User.findOne({ socioId: padreSocioId, clubId });
    if (existente) return { user: existente, passwordTemporal: null };

    const creado = await syncSocioUserFromSocio(socioPadre);
    if (!creado) {
      throw new BusinessError('Ese socio no tiene email y DNI cargados: no se le puede crear una cuenta propia', 400);
    }
    // syncSocioUserFromSocio usa el DNI como contraseña inicial — mismo dato
    // que ya se le pide a cualquier socio para su primer login.
    return { user: creado, passwordTemporal: socioPadre.dni };
  }

  const email = String(padreEmail || '').trim().toLowerCase();
  const nombre = String(padreNombre || '').trim();
  if (!email) throw new BusinessError('Indicá padreUserId, padreSocioId o padreEmail', 400);

  const existente = await User.findOne({ email, clubId });
  if (existente) return { user: existente, passwordTemporal: null };

  if (!nombre) throw new BusinessError('padreNombre es requerido para crear una cuenta de tutor nueva', 400);

  const passwordTemporal = Math.random().toString(36).slice(-10);
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(passwordTemporal, salt);
  const rolesSocio = await obtenerRolIdsPorSlugs({ clubId, slugs: ['socio'] });

  const nuevo = new User({
    email,
    password: hashedPassword,
    nombre,
    roles: rolesSocio,
    clubId,
    active: true,
    mustChangePassword: true,
    createdBy: actor,
    updatedBy: actor,
  });
  await nuevo.save();
  return { user: nuevo, passwordTemporal };
};

export const crearVinculoFamiliar = async ({ clubId, user: actorUser, hijoSocioId, body }) => {
  const actor = actorUser?.email || actorUser?.id;

  const hijo = await Socio.findOne({ _id: hijoSocioId, clubId, active: true }).lean();
  if (!hijo) throw new BusinessError('El socio hijo no existe o pertenece a otro club', 404);

  const { user: padre, passwordTemporal } = await resolverPadre({
    clubId,
    padreUserId: body?.padreUserId,
    padreSocioId: body?.padreSocioId,
    padreEmail: body?.padreEmail,
    padreNombre: body?.padreNombre,
    actor,
  });

  if (padre.socioId && String(padre.socioId) === String(hijoSocioId)) {
    throw new BusinessError('Un socio no puede ser su propio tutor', 400);
  }

  const existente = await VinculoFamiliar.findOne({ clubId, padreUserId: padre._id, hijoSocioId, active: true });
  if (existente) throw new BusinessError('Ese vínculo ya existe', 409);

  const vinculo = new VinculoFamiliar({
    clubId,
    padreUserId: padre._id,
    hijoSocioId,
    createdBy: actor,
    updatedBy: actor,
  });
  await vinculo.save();

  return { vinculo, padre, passwordTemporal };
};

export { BusinessError };
