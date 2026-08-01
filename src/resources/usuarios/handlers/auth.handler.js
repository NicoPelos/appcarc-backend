import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Socio from '../../socios/models/Socio.js';
import VinculoFamiliar from '../../vinculos/models/VinculoFamiliar.js';
import bcrypt from 'bcryptjs';
import tokenService from '../../../services/tokenBlacklistService.js';
import { getPermisosUsuario } from '../../../services/permisosCache.js';
import {
  obtenerRolIdsPorNombres,
  obtenerRolIdsPorSlugs,
  obtenerSlugsPorRolIds,
} from '../../roles/services/resolverRoles.service.js';

/** Arma la respuesta final de auth (token + user + permisos + socio) para un
 * `User` ya autenticado, con el `socioId` del perfil activo (el propio o uno
 * vinculado — ver VinculoFamiliar). El token siempre tiene la misma forma que
 * hoy ({id, email, roles, clubId, socioId}), así el resto del backend (protect,
 * authorize, etc.) no necesita saber nada sobre perfiles vinculados. */
const buildAuthResponse = async (user, { socioId = user.socioId || null, rolesSlugs = null } = {}) => {
  const finalRolesSlugs = rolesSlugs ?? await obtenerSlugsPorRolIds(user.roles);
  const token = jwt.sign(
    { id: user._id, email: user.email, roles: finalRolesSlugs, clubId: user.clubId, socioId },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
  const socio = socioId ? await Socio.findById(socioId).lean() : null;
  const permisos = await getPermisosUsuario(user.clubId, finalRolesSlugs);

  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      nombre: socio?.nombre || user.nombre,
      roles: finalRolesSlugs,
      clubId: user.clubId,
      socioId: socioId || null,
      mustChangePassword: !!user.mustChangePassword,
    },
    permisos,
    socio: socio ? {
      id: socio._id,
      nombre: socio.nombre,
      apellido: socio.apellido,
      fotoPerfil: socio.fotoPerfil,
      redesSociales: socio.redesSociales,
    } : null,
  };
};

/** Perfiles a los que puede entrar un User: el propio (si es socio) más los
 * hijos vinculados (ver issue #28 — vinculación padre-hijo). */
const obtenerPerfilesDisponibles = async (user) => {
  const perfiles = [];

  if (user.socioId) {
    const socio = await Socio.findById(user.socioId).select('nombre apellido fotoPerfil').lean();
    if (socio) {
      perfiles.push({ socioId: String(socio._id), tipo: 'propio', nombre: socio.nombre, apellido: socio.apellido, fotoPerfil: socio.fotoPerfil });
    }
  }

  const vinculos = await VinculoFamiliar.find({ clubId: user.clubId, padreUserId: user._id, active: true })
    .populate('hijoSocioId', 'nombre apellido fotoPerfil')
    .lean();

  for (const v of vinculos) {
    if (!v.hijoSocioId) continue;
    perfiles.push({
      socioId: String(v.hijoSocioId._id),
      tipo: 'vinculado',
      nombre: v.hijoSocioId.nombre,
      apellido: v.hijoSocioId.apellido,
      fotoPerfil: v.hijoSocioId.fotoPerfil,
    });
  }

  return perfiles;
};

/** Punto único de salida para cualquier login ya autenticado (email/password
 * o Google): si hay más de un perfil accesible, pide elegir en vez de emitir
 * el token final directo — usado tanto por `login` como por
 * `buildGoogleLoginResponse`, que antes armaba su propio token a mano y por
 * eso nunca ofrecía el selector de perfiles a quienes entran con Google. */
const resolveLoginResponse = async (user) => {
  const perfiles = await obtenerPerfilesDisponibles(user);

  if (perfiles.length > 1) {
    const selectToken = jwt.sign(
      { id: user._id, clubId: user.clubId, type: 'profile-select' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    );
    return { requiresProfileSelection: true, selectToken, perfiles };
  }

  const unico = perfiles[0];
  return buildAuthResponse(user, unico
    ? { socioId: unico.socioId, rolesSlugs: unico.tipo === 'vinculado' ? ['socio'] : null }
    : { socioId: null });
};

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const buildGoogleLoginResponse = async (payload, clubId) => {
  const { email, picture, sub: googleId, email_verified } = payload;

  if (email_verified === false) {
    const error = new Error('Email de Google no verificado.');
    error.code = 'EMAIL_NOT_VERIFIED';
    throw error;
  }

  if (!clubId) {
    const error = new Error('clubId es requerido');
    error.code = 'MISSING_CLUB_ID';
    throw error;
  }

  let user = await User.findOne({ email, clubId });

  if (!user) {
    const socio = await Socio.findOne({ correoElectronico: email, clubId, active: true });

    if (!socio) {
      const error = new Error('Tu email no está registrado como socio en ningún club. Contacta al administrador.');
      error.code = 'NOT_SOCIO';
      throw error;
    }

    const randomPassword = Math.random().toString(36).slice(-12);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);
    const rolesSocio = await obtenerRolIdsPorSlugs({ clubId, slugs: ['socio'] });

    user = new User({
      email,
      password: hashedPassword,
      nombre: socio.nombre,
      roles: rolesSocio,
      clubId,
      socioId: socio._id.toString(),
      active: true,
      googleId,
    });

    await user.save();
  }

  if (!user.active) {
    const error = new Error('Usuario desactivado');
    error.code = 'USER_DISABLED';
    throw error;
  }

  if (!user.googleId) {
    user.googleId = googleId;
    await user.save();
  }

  const socio = user.socioId ? await Socio.findById(user.socioId) : null;

  // Guardar foto de Google en el socio si no tiene una propia
  if (socio && picture && !socio.fotoPerfil) {
    socio.fotoPerfil = picture;
    await socio.save();
  }

  return resolveLoginResponse(user);
};

const VALID_ROLES = ['admin', 'autoridad', 'secretaria', 'profesor', 'palestrero', 'limpieza', 'arreglos', 'colaborador', 'socio'];

export const register = async (req, res) => {
  const { email, password, dni, nombre, role, clubId } = req.body;

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `Rol inválido. Roles permitidos: ${VALID_ROLES.join(', ')}` });
  }

  try {
    const existingUser = await User.findOne({ email, clubId });
    if (existingUser) return res.status(400).json({ message: 'El usuario ya existe con este email.' });

    let mustChangePassword = false;
    let hashedPassword;
    if (!password && dni) {
      mustChangePassword = true;
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(dni, salt);
    } else {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const socio = await Socio.findOne({ correoElectronico: email, clubId, active: true });

    const rolesIds = await obtenerRolIdsPorNombres({ clubId, nombres: [role || 'secretaria'] });
    if (!rolesIds.length) {
      return res.status(400).json({ message: `El rol "${role || 'secretaria'}" no existe para este club.` });
    }

    const user = new User({
      email,
      password: hashedPassword,
      nombre: nombre || socio?.nombre,
      roles: rolesIds,
      clubId,
      socioId: socio?._id?.toString() || null,
      mustChangePassword,
    });
    await user.save();

    const rolesSlugs = await obtenerSlugsPorRolIds(user.roles);
    const token = jwt.sign(
      { id: user._id, email: user.email, roles: rolesSlugs, clubId: user.clubId, socioId: user.socioId || null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' },
    );
    const permisos = await getPermisosUsuario(user.clubId, rolesSlugs);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        roles: rolesSlugs,
        clubId: user.clubId,
        socioId: user.socioId || null,
        mustChangePassword: user.mustChangePassword,
      },
      permisos,
    });
  } catch (error) {
    console.error('Error en el registro de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al registrar usuario.' });
  }
};

export const googleLogin = async (req, res) => {
  const { idToken, clubId } = req.body;

  try {
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const response = await buildGoogleLoginResponse(payload, clubId);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error en Google Login:', error);
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'MISSING_CLUB_ID') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'NOT_SOCIO') {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === 'USER_DISABLED') {
      return res.status(403).json({ message: error.message });
    }
    return res.status(401).json({ message: 'Autenticación de Google fallida' });
  }
};

export const googleCallback = async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const clubId = state || req.query.clubId || process.env.DEFAULT_CLUB_ID;

  if (!code) {
    return res.status(400).json({ message: 'Code de Google es requerido.' });
  }

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      return res.status(400).json({ message: 'Google no devolvió id_token.' });
    }

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const response = await buildGoogleLoginResponse(payload, clubId);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error en Google OAuth callback:', error);
    return res.status(401).json({ message: 'Autenticación de Google fallida en callback' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Credenciales inválidas.' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Credenciales inválidas.' });
    if (!user.active) return res.status(403).json({ message: 'Usuario desactivado' });

    const response = await resolveLoginResponse(user);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error en el login de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al iniciar sesión.' });
  }
};

/** Valida que `socioId` sea un perfil accesible para `user` (el propio o un
 * hijo vinculado) y resuelve con qué roles debe entrar. `null` si no tiene
 * acceso a ese perfil. */
const resolverPerfilElegido = async (user, socioId) => {
  const esPropio = user.socioId && String(user.socioId) === String(socioId);
  if (esPropio) return { rolesSlugs: null };

  const vinculo = await VinculoFamiliar.findOne({ clubId: user.clubId, padreUserId: user._id, hijoSocioId: socioId, active: true });
  if (!vinculo) return null;
  return { rolesSlugs: ['socio'] };
};

export const selectProfile = async (req, res) => {
  const { selectToken, socioId } = req.body;
  if (!selectToken || !socioId) {
    return res.status(400).json({ message: 'selectToken y socioId son requeridos.' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(selectToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'selectToken inválido o expirado.' });
    }
    if (decoded.type !== 'profile-select') {
      return res.status(401).json({ message: 'selectToken inválido.' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.active) return res.status(401).json({ message: 'Usuario no encontrado o desactivado' });

    const perfil = await resolverPerfilElegido(user, socioId);
    if (!perfil) return res.status(403).json({ message: 'No tenés acceso a ese perfil.' });

    const response = await buildAuthResponse(user, { socioId, rolesSlugs: perfil.rolesSlugs });
    res.status(200).json(response);
  } catch (error) {
    console.error('Error seleccionando perfil:', error);
    res.status(500).json({ message: 'Error en el servidor al seleccionar perfil.' });
  }
};

/** Lista los perfiles disponibles del usuario logueado (el propio + hijos
 * vinculados), sin importar cuál esté activo en la sesión actual — para armar
 * un menú de "cambiar de perfil" en cualquier momento, no solo al loguearse. */
export const getProfiles = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user || !user.active) return res.status(401).json({ message: 'Usuario no encontrado o desactivado' });

    const perfiles = await obtenerPerfilesDisponibles(user);
    res.status(200).json({ perfiles });
  } catch (error) {
    console.error('Error obteniendo perfiles:', error);
    res.status(500).json({ message: 'Error al obtener perfiles' });
  }
};

/** Cambia el perfil activo de una sesión ya logueada, sin pedir contraseña de
 * nuevo — a diferencia de selectProfile (que usa un selectToken de corta
 * duración emitido en el login), acá se usa el token normal ya válido. */
export const switchProfile = async (req, res) => {
  const { socioId } = req.body;
  if (!socioId) return res.status(400).json({ message: 'socioId es requerido.' });

  try {
    const user = await User.findById(req.user?.id);
    if (!user || !user.active) return res.status(401).json({ message: 'Usuario no encontrado o desactivado' });

    const perfil = await resolverPerfilElegido(user, socioId);
    if (!perfil) return res.status(403).json({ message: 'No tenés acceso a ese perfil.' });

    const response = await buildAuthResponse(user, { socioId, rolesSlugs: perfil.rolesSlugs });
    res.status(200).json(response);
  } catch (error) {
    console.error('Error cambiando de perfil:', error);
    res.status(500).json({ message: 'Error en el servidor al cambiar de perfil.' });
  }
};

/**
 * @openapi
 * /api/auth/push-token:
 *   put:
 *     summary: Registrar token de notificaciones push de Expo
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expoPushToken]
 *             properties:
 *               expoPushToken:
 *                 type: string
 *                 description: Token de Expo Push Notifications (ExponentPushToken[...])
 *     responses:
 *       200:
 *         description: Token registrado correctamente
 *       400:
 *         description: Token inválido o faltante
 *       500:
 *         description: Error al registrar token
 */
export const registerPushToken = async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken || typeof expoPushToken !== 'string') {
    return res.status(400).json({ message: 'expoPushToken es requerido' });
  }

  try {
    await User.findByIdAndUpdate(req.user?.id, { expoPushToken });
    res.status(200).json({ message: 'Token registrado correctamente' });
  } catch (error) {
    console.error('Error registrando push token:', error);
    res.status(500).json({ message: 'Error al registrar push token' });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(400).json({ message: 'Falta token' });
    await tokenService.addToken(token);
    return res.status(200).json({ message: 'Desconectado correctamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({ message: 'Error en el servidor al desconectar.' });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'newPassword es requerido.' });
  }

  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    // Permitir cambio sin currentPassword si el usuario está marcado para cambiar (primer login)
    if (!currentPassword && !user.mustChangePassword) {
      return res.status(400).json({ message: 'currentPassword requerido.' });
    }

    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Contraseña actual inválida.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ message: 'Error en el servidor al cambiar contraseña.' });
  }
};

export default { register, login, selectProfile, getProfiles, switchProfile, googleLogin, logout, changePassword };
