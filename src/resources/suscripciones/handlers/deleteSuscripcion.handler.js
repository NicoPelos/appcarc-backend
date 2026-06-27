import Suscripcion from '../models/Suscripcion.js';

/**
 * @openapi
 * /api/suscripciones/{id}:
 *   delete:
 *     summary: Eliminar suscripción (soft delete, solo admin)
 *     tags: [Suscripciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Suscripción eliminada
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error al eliminar suscripción
 */
export const deleteSuscripcionHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const suscripcion = await Suscripcion.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!suscripcion) {
      return res.status(404).json({ message: 'Suscripción no encontrada' });
    }

    suscripcion.active = false;
    suscripcion.updatedBy = req.user.email || req.user.id;
    await suscripcion.save();

    return res.status(200).json({ message: 'Suscripción eliminada' });
  } catch (error) {
    console.error('Error eliminando suscripción:', error);
    return res.status(500).json({ message: 'Error al eliminar suscripción' });
  }
};

export default deleteSuscripcionHandler;
