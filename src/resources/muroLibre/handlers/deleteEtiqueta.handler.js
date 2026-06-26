import HorarioEtiqueta from '../models/HorarioEtiqueta.js';

/**
 * @openapi
 * /api/horarios/etiquetas/{id}:
 *   delete:
 *     summary: Eliminar etiqueta de horario
 *     tags: [Horarios]
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
    const etiqueta = await HorarioEtiqueta.findOneAndDelete({ _id: id, clubId: req.user.clubId });
    if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });
    return res.status(200).json({ message: 'Etiqueta eliminada' });
  } catch (error) {
    console.error('Error eliminando etiqueta:', error);
    return res.status(500).json({ message: 'Error al eliminar etiqueta' });
  }
};

export default deleteEtiquetaHandler;
