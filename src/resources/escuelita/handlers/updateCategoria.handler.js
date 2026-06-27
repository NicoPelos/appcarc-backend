import CategoriaEscuelita from '../models/CategoriaEscuelita.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';

/**
 * @openapi
 * /api/escuelita/categorias/{id}:
 *   put:
 *     summary: Actualizar categoría de escuelita (solo admin)
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               frecuenciaSemanal:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 6
 *               etiquetaId:
 *                 type: string
 *                 nullable: true
 *                 description: ID de la etiqueta de precio (null para desvincular)
 *     responses:
 *       200:
 *         description: Categoría actualizada
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Categoría o etiqueta no encontrada
 *       500:
 *         description: Error al actualizar categoría
 */
export const updateCategoriaHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, frecuenciaSemanal, etiquetaId } = req.body;

    const categoria = await CategoriaEscuelita.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' });

    if (nombre !== undefined) categoria.nombre = nombre;
    if (descripcion !== undefined) categoria.descripcion = descripcion;

    if (frecuenciaSemanal !== undefined) {
      const freq = Number(frecuenciaSemanal);
      if (!Number.isInteger(freq) || freq < 1 || freq > 6) {
        return res.status(400).json({ message: 'frecuenciaSemanal debe ser un entero entre 1 y 6' });
      }
      categoria.frecuenciaSemanal = freq;
    }

    if (etiquetaId !== undefined) {
      if (etiquetaId) {
        const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId: req.user.clubId, active: true });
        if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });
      }
      categoria.etiquetaId = etiquetaId || null;
    }

    categoria.updatedBy = req.user.email || req.user.id;
    await categoria.save();

    return res.status(200).json(categoria);
  } catch (error) {
    console.error('Error actualizando categoría:', error);
    return res.status(500).json({ message: 'Error al actualizar categoría' });
  }
};

export default updateCategoriaHandler;
