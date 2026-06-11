import jwt from 'jsonwebtoken';
import tokenService from '../services/tokenBlacklistService.js';

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
    req.user = decoded; // Contiene id, role y clubId
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token no válido' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `El rol ${req.user.role} no tiene permiso para esta acción` 
      });
    }
    next();
  };
};