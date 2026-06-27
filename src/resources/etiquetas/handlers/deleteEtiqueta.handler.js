import Etiqueta from '../models/Etiqueta.js';

/**
 * @openapi
 * /api/etiquetas/{id}:
 *   delete:
 *     summary: Eliminar etiqueta (soft delete, solo admin)
 *     tags: [Etiquetas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Etiqueta eliminada
 *       404:
 *         description: Etiqueta no encontrada
 *       500:
 *         description: Error al eliminar etiqueta
 */
export const deleteEtiquetaHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const etiqueta = await Etiqueta.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });

    etiqueta.active = false;
    etiqueta.deletedAt = new Date();
    etiqueta.deletedBy = req.user.email || req.user.id;
    etiqueta.updatedBy = req.user.email || req.user.id;
    await etiqueta.save();

    return res.status(200).json({ message: 'Etiqueta eliminada' });
  } catch (error) {
    console.error('Error eliminando etiqueta:', error);
    return res.status(500).json({ message: 'Error al eliminar etiqueta' });
  }
};

export default deleteEtiquetaHandler;
