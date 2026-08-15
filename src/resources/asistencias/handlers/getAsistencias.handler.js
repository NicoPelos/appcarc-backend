import mongoose from 'mongoose';
import Asistencia from '../models/Asistencia.js';

const VALID_TIPOS = ['muro_libre', 'escuelita'];

/**
 * @openapi
 * /api/asistencias:
 *   get:
 *     summary: Listar asistencias del club (muro libre y escuelita unificadas)
 *     tags: [Asistencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [muro_libre, escuelita] }
 *         description: Filtrar por tipo de asistencia
 *       - in: query
 *         name: socioId
 *         schema: { type: string }
 *         description: Filtrar por socio
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Fecha desde (inclusive)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: Fecha hasta (inclusive)
 *       - in: query
 *         name: categoria
 *         schema: { type: string }
 *         description: Filtrar por categoría (escuelita)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista paginada de asistencias
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error al obtener asistencias
 */
export const getAsistenciasHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, tipo, socioId, from, to, categoria } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { clubId: req.user?.clubId, active: true };
    const isSocioOnly = req.user?.roles?.length > 0 && req.user.roles.every(r => r === 'socio');
    if (isSocioOnly && req.user.socioId) filter.socioId = new mongoose.Types.ObjectId(req.user.socioId);

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
      // Un usuario solo-socio no puede pisar su propio filtro pidiendo el
      // socioId de otro (appcarc-backend#88) — solo se le permite si coincide
      // con el suyo (no-op), cualquier otro valor es 403.
      if (isSocioOnly) {
        if (String(socioId) !== String(req.user.socioId)) {
          return res.status(403).json({ message: 'No autorizado' });
        }
      } else {
        filter.socioId = new mongoose.Types.ObjectId(socioId);
      }
    }

    if (from || to) {
      filter.fecha = {};
      // Argentina no tiene horario de verano (siempre UTC-3) — si viene solo
      // fecha (sin hora), interpretarla como el día en huso horario argentino,
      // no UTC, para que coincida con el "hoy" real del usuario.
      if (from) filter.fecha.$gte = from.includes('T') ? new Date(from) : new Date(`${from}T00:00:00-03:00`);
      if (to) {
        filter.fecha.$lte = to.includes('T') ? new Date(to) : new Date(`${to}T23:59:59.999-03:00`);
      }
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
