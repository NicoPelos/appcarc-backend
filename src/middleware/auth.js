import jwt from 'jsonwebtoken';
import tokenService from '../services/tokenBlacklistService.js';
import User from '../resources/usuarios/models/User.js';

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

export const authorize = (...roles) => {
  return (req, res, next) => {
    const userRoles = req.user.roles ?? [];
    if (!userRoles.some(r => roles.includes(r))) {
      return res.status(403).json({
        message: 'No tenés permiso para esta acción',
      });
    }
    next();
  };
};