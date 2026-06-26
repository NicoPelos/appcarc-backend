import Precios from '../models/Precios.js';

/**
 * @openapi
 * /api/precios:
 *   get:
 *     summary: Listar precios del catálogo
 *     tags: [Precios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: categoria
 *         in: query
 *         schema: { type: string, enum: [cuota, hora, pase] }
 *       - name: codigo
 *         in: query
 *         schema: { type: string }
 *       - name: trash
 *         in: query
 *         description: Mostrar eliminados
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200:
 *         description: Lista de precios
 *       500:
 *         description: Error al obtener precios
 */
export const getPreciosHandler = async (req, res) => {
  try {
    const { categoria, codigo, trash } = req.query;
    const showTrash = trash === 'true';

    const filter = {
      clubId: req.user.clubId,
      active: !showTrash,
    };

    if (categoria) filter.categoria = categoria;
    if (codigo) filter.codigo = codigo;

    const precios = await Precios.find(filter).sort({ codigo: 1, vigenteDesde: -1 }).lean();

    return res.status(200).json(precios);
  } catch (error) {
    console.error('Error obteniendo precios:', error);
    return res.status(500).json({ message: 'Error al obtener precios' });
  }
};

export default getPreciosHandler;
