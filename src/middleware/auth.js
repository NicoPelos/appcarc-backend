import jwt from 'jsonwebtoken';
import tokenService from '../services/tokenBlacklistService.js';
import User from '../resources/usuarios/models/User.js';
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

    const user = await User.findById(decoded.id).select('passwordChangedAt active').lean();
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Usuario no encontrado o desactivado' });
    }
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({ message: 'Sesión expirada, la contraseña fue cambiada' });
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