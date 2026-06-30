import Movimiento from '../models/Movimiento.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/movimientos/{id}:
 *   delete:
 *     summary: Eliminar un movimiento de caja (soft delete)
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del movimiento
 *     responses:
 *       200:
 *         description: Movimiento eliminado exitosamente
 *       404:
 *         description: Movimiento no encontrado
 *       500:
 *         description: Error al eliminar movimiento
 */
export const deleteMovimientoHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });
    const movimientoAntes = movimiento.toObject();

    movimiento.active = false;
    movimiento.updatedBy = req.user?.email ?? req.user?.id ?? 'Sistema';
    await movimiento.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'DELETE', resource: 'Movimiento', resourceId: id, before: movimientoAntes, after: null });
    res.status(200).json({ message: 'Movimiento eliminado' });
  } catch (error) {
    console.error('Error eliminando movimiento:', error);
    res.status(500).json({ message: 'Error al eliminar movimiento' });
  }
};
