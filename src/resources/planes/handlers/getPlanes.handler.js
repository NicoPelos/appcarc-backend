import Plan from '../models/Plan.js';

/**
 * @openapi
 * /api/planes:
 *   get:
 *     summary: Listar planes del club
 *     tags: [Planes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: tipo
 *         in: query
 *         schema:
 *           type: string
 *           enum: [social, escuelita, muro_libre]
 *         description: Filtrar por tipo de plan
 *       - name: trash
 *         in: query
 *         schema:
 *           type: string
 *           enum: ['true']
 *         description: Mostrar planes eliminados
 *     responses:
 *       200:
 *         description: Lista de planes con etiquetaId populado
 *       500:
 *         description: Error al obtener planes
 */
export const getPlanesHandler = async (req, res) => {
  try {
    const { tipo, trash } = req.query;
    const showTrash = trash === 'true';

    const filter = { clubId: req.user.clubId, active: !showTrash };
    if (tipo) filter.tipo = tipo;

    const planes = await Plan.find(filter)
      .populate('etiquetaId', 'nombre unidad')
      .sort({ tipo: 1, nombre: 1 })
      .lean();

    return res.status(200).json(planes);
  } catch (error) {
    console.error('Error obteniendo planes:', error);
    return res.status(500).json({ message: 'Error al obtener planes' });
  }
};

export default getPlanesHandler;
