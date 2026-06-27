import Suscripcion from '../models/Suscripcion.js';

/**
 * @openapi
 * /api/suscripciones:
 *   get:
 *     summary: Listar suscripciones de un socio
 *     tags: [Suscripciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: socioId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         description: ID del socio
 *       - name: activa
 *         in: query
 *         schema: { type: string, enum: ['true'] }
 *         description: Filtrar solo suscripciones activas (fechaHasta null)
 *     responses:
 *       200:
 *         description: Lista de suscripciones
 *       400:
 *         description: socioId es requerido
 *       500:
 *         description: Error al obtener suscripciones
 */
export const getSuscripcionesHandler = async (req, res) => {
  try {
    const { socioId, activa } = req.query;

    if (!socioId) {
      return res.status(400).json({ message: 'socioId es requerido' });
    }

    const filter = {
      clubId: req.user.clubId,
      socioId,
      active: true,
    };

    if (activa === 'true') {
      filter.fechaHasta = null;
    }

    const suscripciones = await Suscripcion
      .find(filter)
      .populate('etiquetaId', 'nombre unidad')
      .sort({ fechaDesde: -1 })
      .lean();

    return res.status(200).json(suscripciones);
  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    return res.status(500).json({ message: 'Error al obtener suscripciones' });
  }
};

export default getSuscripcionesHandler;
