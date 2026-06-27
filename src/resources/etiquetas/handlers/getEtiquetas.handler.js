import Etiqueta from '../models/Etiqueta.js';

/**
 * @openapi
 * /api/etiquetas:
 *   get:
 *     summary: Listar etiquetas del club
 *     tags: [Etiquetas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: uso_sistema
 *         in: query
 *         description: Filtrar por identificador de sistema
 *         schema: { type: string }
 *       - name: trash
 *         in: query
 *         description: Mostrar eliminadas
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200:
 *         description: Lista de etiquetas
 *       500:
 *         description: Error al obtener etiquetas
 */
export const getEtiquetasHandler = async (req, res) => {
  try {
    const { uso_sistema, trash } = req.query;
    const showTrash = trash === 'true';

    const filter = {
      clubId: req.user.clubId,
      active: !showTrash,
    };

    if (uso_sistema) filter.uso_sistema = uso_sistema;

    const etiquetas = await Etiqueta.find(filter).sort({ nombre: 1 }).lean();

    return res.status(200).json(etiquetas);
  } catch (error) {
    console.error('Error obteniendo etiquetas:', error);
    return res.status(500).json({ message: 'Error al obtener etiquetas' });
  }
};

export default getEtiquetasHandler;
