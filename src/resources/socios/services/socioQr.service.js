import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Socio from '../models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import MuroLibre from '../../muroLibre/models/MuroLibre.js';

const QR_TYPE = 'socio_qr';

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const ensureJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new BusinessError('JWT_SECRET no está definido en el backend', 500);
  }
};

export const generateSocioQrToken = ({ clubId, socioId }) => {
  ensureJwtSecret();
  return jwt.sign({ clubId, socioId, type: QR_TYPE }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
};

export const decodeSocioQrToken = (token) => {
  ensureJwtSecret();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || payload.type !== QR_TYPE) {
      throw new BusinessError('Token QR inválido', 400);
    }

    return payload;
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError('Token QR no válido', 400);
  }
};

export const findActiveSocioById = async (id, clubId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Socio.findOne({ _id: id, clubId, active: true });
};

export const findActiveSocioByDni = async (dni, clubId) => {
  const normalizedDni = String(dni || '').trim();
  if (!normalizedDni) return null;
  return Socio.findOne({ dni: normalizedDni, clubId, active: true });
};

export const resolveSocioFromQrToken = async (token, clubId) => {
  const payload = decodeSocioQrToken(token);

  if (payload.clubId !== clubId) {
    throw new BusinessError('El QR no pertenece a este club', 403);
  }

  const socio = await findActiveSocioById(payload.socioId, clubId);
  if (!socio) {
    throw new BusinessError('Socio no encontrado o inactivo', 404);
  }

  return socio;
};

export const getSocioDebtSummary = async (socioId, clubId) => {
  const [summary] = await Cuota.aggregate([
    {
      $match: {
        clubId,
        socioId: new mongoose.Types.ObjectId(socioId),
        active: true,
        estado: 'pendiente',
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalAmount: { $sum: '$montoEsperadoSnapshot' },
      },
    },
  ]);

  return {
    pendingCount: summary?.count ?? 0,
    pendingAmount: summary?.totalAmount ?? 0,
  };
};

export const getLastMuroLibre = async (socioId, clubId) => {
  if (!mongoose.isValidObjectId(socioId)) return null;
  return MuroLibre.findOne({ clubId, socioId, active: true }).sort({ fecha: -1 });
};

export const buildSocioVerificationPayload = async (socio) => {
  const debtSummary = await getSocioDebtSummary(socio._id, socio.clubId);
  const lastMuroLibre = await getLastMuroLibre(socio._id, socio.clubId);

  return {
    socio,
    debtSummary,
    lastMuroLibre,
  };
};

export { BusinessError };