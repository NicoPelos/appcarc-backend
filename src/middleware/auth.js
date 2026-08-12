import jwt from 'jsonwebtoken';
import tokenService from '../services/tokenBlacklistService.js';
import User from '../resources/usuarios/models/User.js';
import VinculoFamiliar from '../resources/vinculos/models/VinculoFamiliar.js';
import { tienePermiso } from '../services/permisosCache.js';

export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No autorizado, falta token' });
  }

  if (await tokenService.hasToken(token)) {
    return res.status(401).json({ message: 'Token inválido (desconectado)' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('passwordChangedAt active socioId').lean();
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Usuario no encontrado o desactivado' });
    }
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({ message: 'Sesión expirada, la contraseña fue cambiada' });
    }

    // El JWT es stateless y dura 8h: si el socioId activo no es el propio del
    // User, está actuando "como" un perfil vinculado (switchProfile, ver
    // buildAuthResponse en auth.handler.js) y hay que revalidar en cada
    // request que ese VinculoFamiliar siga vigente — si no, anular un vínculo
    // no corta el acceso ya emitido hasta que expire el token (appcarc-backend#71).
    if (decoded.socioId && decoded.socioId !== String(user.socioId ?? '')) {
      const vinculoVigente = await VinculoFamiliar.exists({
        clubId: decoded.clubId,
        padreUserId: decoded.id,
        hijoSocioId: decoded.socioId,
        active: true,
      });
      if (!vinculoVigente) {
        return res.status(401).json({ message: 'El vínculo con este perfil ya no está vigente' });
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token no válido' });
  }
};

// protectSuper — solo accesible para usuarios con rol superadmin
export const protectSuper = [
  protect,
  (req, res, next) => {
    if (!req.user?.roles?.includes('superadmin')) {
      return res.status(403).json({ message: 'Acceso restringido al superadmin' });
    }
    next();
  },
];

// authorize('socios:write') — verifica permiso contra los roles del usuario en BD
export const authorize = (permiso) => {
  return async (req, res, next) => {
    try {
      const userRoles = req.user.roles ?? [];
      const clubId = req.user.clubId;

      // superadmin pasa siempre
      if (userRoles.includes('superadmin')) return next();

      const ok = await tienePermiso(clubId, userRoles, permiso);
      if (!ok) {
        return res.status(403).json({ message: 'No tenés permiso para esta acción' });
      }
      next();
    } catch (error) {
      console.error('[authorize] Error verificando permisos:', error.message);
      return res.status(500).json({ message: 'Error verificando permisos' });
    }
  };
};

// authorizeSelfSocioOr('socios:write') — deja pasar si el actor es un socio operando
// sobre su propio registro (req.params.id === req.user.socioId), o si tiene el permiso
// indicado (staff/admin). Para acciones de "mi propio perfil" que usan una ruta con :id
// en vez de /me, donde el chequeo genérico de authorize() bloquearía al socio por completo.
export const authorizeSelfSocioOr = (permiso) => {
  return async (req, res, next) => {
    if (req.user?.socioId && req.user.socioId === req.params.id) return next();
    return authorize(permiso)(req, res, next);
  };
};

// authorizeSelfSocioQueryOr('escuelita:read') — igual que authorizeSelfSocioOr,
// pero para rutas de listado donde el id del socio viene por query (?socioId=)
// en vez de por :id. Solo deja pasar sin el permiso cuando el query trae
// exactamente el propio socioId — así un socio puede consultar su propio
// estado sin heredar el permiso de listar a todos los socios.
export const authorizeSelfSocioQueryOr = (permiso) => {
  return async (req, res, next) => {
    if (req.user?.socioId && req.query?.socioId && req.user.socioId === req.query.socioId) return next();
    return authorize(permiso)(req, res, next);
  };
};