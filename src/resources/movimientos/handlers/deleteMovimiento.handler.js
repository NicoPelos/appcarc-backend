import mongoose from 'mongoose';
import Movimiento from '../models/Movimiento.js';
import Cobro from '../../cobros/models/Cobro.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
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
 *         description: >
 *           Movimiento eliminado exitosamente. Si el movimiento proviene de un cobro
 *           de cuotas o de un registro de muro libre, también se anula la cuota y/o
 *           el registro de origen para mantener la trazabilidad.
 *       404:
 *         description: Movimiento no encontrado
 *       500:
 *         description: Error al eliminar movimiento
 */
export const deleteMovimientoHandler = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();

  try {
    let movimientoAntes = null;

    await session.withTransaction(async () => {
      const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true }).session(session);
      if (!movimiento) {
        const error = new Error('Movimiento no encontrado');
        error.status = 404;
        throw error;
      }
      movimientoAntes = movimiento.toObject();

      const actor = req.user?.email ?? req.user?.id ?? 'Sistema';

      movimiento.active = false;
      movimiento.updatedBy = actor;
      await movimiento.save({ session });

      if (movimiento.sourceModel === 'Cobro' && movimiento.sourceId) {
        const cobro = await Cobro.findOne({ _id: movimiento.sourceId, clubId: req.user?.clubId, active: true }).session(session);
        if (cobro) {
          cobro.active = false;
          cobro.anuladoAt = new Date();
          cobro.anuladoPor = actor;
          cobro.motivoAnulacion = 'Anulado al eliminar el movimiento asociado';
          cobro.updatedBy = actor;
          await cobro.save({ session });

          await Cuota.updateMany(
            { cobroId: cobro._id, clubId: req.user?.clubId },
            { estado: 'anulada', updatedBy: actor },
            { session },
          );
        }
      } else if (movimiento.sourceModel === 'Asistencia' && movimiento.sourceId) {
        await Asistencia.findOneAndUpdate(
          { _id: movimiento.sourceId, clubId: req.user?.clubId, active: true },
          { active: false, updatedBy: actor },
          { session },
        );
      }
    });

    logAudit({ clubId: req.user?.clubId, req, action: 'DELETE', resource: 'Movimiento', resourceId: id, before: movimientoAntes, after: null });
    res.status(200).json({ message: 'Movimiento eliminado' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error eliminando movimiento:', error);
    res.status(500).json({ message: 'Error al eliminar movimiento' });
  } finally {
    session.endSession();
  }
};
