import mongoose from 'mongoose';
import Asistencia from '../models/Asistencia.js';

const VALID_TIPOS = ['muro_libre', 'escuelita'];

export const getAsistenciasHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, tipo, socioId, from, to, categoria } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { clubId: req.user?.clubId, active: true };

    if (tipo) {
      if (!VALID_TIPOS.includes(tipo)) {
        return res.status(400).json({ message: 'El tipo debe ser muro_libre o escuelita' });
      }
      filter.tipo = tipo;
    }

    if (socioId) {
      if (!mongoose.isValidObjectId(socioId)) {
        return res.status(400).json({ message: 'El socioId no es válido' });
      }
      filter.socioId = new mongoose.Types.ObjectId(socioId);
    }

    if (from || to) {
      filter.fecha = {};
      if (from) filter.fecha.$gte = new Date(from);
      if (to) filter.fecha.$lte = new Date(to);
    }

    if (categoria) {
      filter.categoria = categoria;
    }

    const [total, asistencias] = await Promise.all([
      Asistencia.countDocuments(filter),
      Asistencia.find(filter)
        .sort({ fecha: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      asistencias,
    });
  } catch (error) {
    console.error('Error obteniendo asistencias:', error);
    res.status(500).json({ message: 'Error al obtener asistencias' });
  }
};
