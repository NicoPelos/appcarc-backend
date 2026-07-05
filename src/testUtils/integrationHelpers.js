import jwt from 'jsonwebtoken';
import User from '../resources/usuarios/models/User.js';
import Socio from '../resources/socios/models/Socio.js';
import Etiqueta from '../resources/etiquetas/models/Etiqueta.js';
import Precios from '../resources/cuotas/models/Precios.js';
import Suscripcion from '../resources/suscripciones/models/Suscripcion.js';
import Plan from '../resources/planes/models/Plan.js';

export const CLUB_ID = 'CARC';

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

export const createAdminUser = async (overrides = {}) => {
  const user = await User.create({
    email: overrides.email || `${unique('admin')}@carc.local`,
    password: 'hashed-not-used',
    roles: overrides.roles || ['superadmin'],
    clubId: overrides.clubId || CLUB_ID,
    socioId: overrides.socioId || undefined,
  });
  const token = jwt.sign(
    { id: user._id, email: user.email, roles: user.roles, clubId: user.clubId, socioId: user.socioId || null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return { user, token };
};

export const createSocio = async (overrides = {}) => Socio.create({
  apellido: overrides.apellido || 'Perez',
  nombre: overrides.nombre || 'Juan',
  dni: overrides.dni || unique('dni'),
  clubId: overrides.clubId || CLUB_ID,
  estado: overrides.estado || 'Activo',
  createdBy: 'test',
  updatedBy: 'test',
  ...overrides,
});

export const createEtiqueta = async (overrides = {}) => Etiqueta.create({
  clubId: overrides.clubId || CLUB_ID,
  nombre: overrides.nombre || 'Cuota Social',
  unidad: overrides.unidad || 'mes',
  uso_sistema: overrides.uso_sistema ?? 'cuota_social',
  createdBy: 'test',
  updatedBy: 'test',
  ...overrides,
});

export const createPrecio = async (overrides = {}) => Precios.create({
  clubId: overrides.clubId || CLUB_ID,
  etiquetaId: overrides.etiquetaId,
  nombre: overrides.nombre || 'Cuota Social',
  unidad: overrides.unidad || 'mes',
  monto: overrides.monto ?? 5000,
  vigenteDesde: overrides.vigenteDesde || new Date('2020-01-01'),
  vigenteHasta: overrides.vigenteHasta ?? null,
  createdBy: 'test',
  updatedBy: 'test',
  ...overrides,
});

export const createPlan = async (overrides = {}) => Plan.create({
  clubId: overrides.clubId || CLUB_ID,
  nombre: overrides.nombre || unique('plan'),
  tipo: overrides.tipo || 'social',
  modalidad: overrides.modalidad || 'mensual',
  etiquetaId: overrides.etiquetaId,
  createdBy: 'test',
  updatedBy: 'test',
  ...overrides,
});

export const createSuscripcion = async (overrides = {}) => Suscripcion.create({
  clubId: overrides.clubId || CLUB_ID,
  socioId: overrides.socioId,
  etiquetaId: overrides.etiquetaId,
  fechaDesde: overrides.fechaDesde || '2024-01',
  fechaHasta: overrides.fechaHasta ?? null,
  createdBy: 'test',
  updatedBy: 'test',
  ...overrides,
});
