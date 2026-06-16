import Asistencia from '../../asistencias/models/Asistencia.js';

/**
 * @openapi
 * /api/muro-libre:
 *   get:
 *     summary: Obtener muros libres
 *     tags: [MuroLibre]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         description: Número de página
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Límite de registros por página
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista de muros libres
 *       500:
 *         description: Error al obtener muros libres
 */

export const getMuroLibreHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const filter = { clubId: req.user?.clubId, tipo: 'muro_libre', active: true };

    const [total, registros] = await Promise.all([
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
      registros,
    });
  } catch (error) {
    console.error('Error obteniendo muro libre:', error);
    res.status(500).json({ message: 'Error al obtener muro libre' });
  }
};

export default getMuroLibreHandler;
