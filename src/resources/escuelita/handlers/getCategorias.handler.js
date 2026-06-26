import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

/**
 * @openapi
 * /api/escuelita/categorias:
 *   get:
 *     summary: Listar categorías de escuelita
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: trash
 *         in: query
 *         description: Mostrar eliminadas
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200:
 *         description: Lista de categorías
 *       500:
 *         description: Error al obtener categorías
 */
export const getCategoriasHandler = async (req, res) => {
  try {
    const { trash } = req.query;
    const categorias = await CategoriaEscuelita.find({
      clubId: req.user.clubId,
      active: trash === 'true' ? false : true,
    }).sort({ nombre: 1 }).lean();

    return res.status(200).json(categorias);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    return res.status(500).json({ message: 'Error al obtener categorías' });
  }
};

export default getCategoriasHandler;
