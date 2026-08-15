import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../services/audit.service.js';
import { REVERSERS } from '../services/reversers/index.js';
import { restoreFields } from '../services/reversers/shared.js';

/**
 * @openapi
 * /api/audit/{id}/revert:
 *   post:
 *     summary: Revertir un cambio registrado en el log de auditoría (solo admin)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cambio revertido correctamente
 *       404:
 *         description: Log no encontrado
 *       409:
 *         description: Este log ya fue revertido
 *       422:
 *         description: No se puede revertir (no hay snapshot before disponible)
 */
export const revertAuditLogHandler = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID de log inválido' });
  }

  const session = await mongoose.startSession();
  try {
    const log = await AuditLog.findOne({ _id: id, clubId: req.user.clubId });
    if (!log) return res.status(404).json({ message: 'Log de auditoría no encontrado' });

    if (log.revertedAt) {
      return res.status(409).json({ message: 'Este log ya fue revertido', revertedAt: log.revertedAt, revertedBy: log.revertedBy });
    }

    const actor = req.user.email || String(req.user.id);
    const reverser = REVERSERS[log.resource];

    if (reverser) {
      // Recursos con efectos en cascada (Cobro, Movimiento, Asistencia):
      // el reverser se encarga de restaurar el documento principal y todo
      // lo que su acción original haya cascadeado.
      await session.withTransaction(async () => {
        await reverser(log, { actor, session });
      });
    } else {
      const Model = mongoose.model(log.resource);

      if (log.action === 'CREATE') {
        // Revertir un CREATE → soft-delete el documento creado. Filtrar por
        // clubId (igual que la búsqueda del log más arriba) es una capa de
        // defensa extra: el resourceId ya viene de un log scopeado a este
        // club, pero si algún día no lo estuviera, esto evita tocar un
        // documento de otro club (appcarc-backend#91).
        const actualizado = await Model.findOneAndUpdate(
          { _id: log.resourceId, clubId: log.clubId },
          { $set: { active: false, updatedBy: actor } },
        );
        if (!actualizado) {
          console.error(`revertAuditLog: ${log.resource} ${log.resourceId} no encontrado en el club ${log.clubId} — no se revirtió nada`);
          return res.status(422).json({ message: 'No se encontró el documento a revertir en este club' });
        }
      } else if (log.action === 'UPDATE' || log.action === 'DELETE') {
        // Revertir UPDATE o DELETE → restaurar el snapshot before
        if (!log.before) {
          return res.status(422).json({ message: 'No hay snapshot anterior para revertir' });
        }

        const restoredData = restoreFields(log.before);
        restoredData.updatedBy = actor;

        const actualizado = await Model.findOneAndUpdate(
          { _id: log.resourceId, clubId: log.clubId },
          { $set: restoredData },
        );
        if (!actualizado) {
          console.error(`revertAuditLog: ${log.resource} ${log.resourceId} no encontrado en el club ${log.clubId} — no se revirtió nada`);
          return res.status(422).json({ message: 'No se encontró el documento a revertir en este club' });
        }
      }
    }

    log.revertedAt = new Date();
    log.revertedBy = actor;
    await log.save();

    logAudit({
      clubId: req.user.clubId,
      req,
      action: log.action === 'CREATE' ? 'DELETE' : 'UPDATE',
      resource: log.resource,
      resourceId: log.resourceId,
      before: log.after,
      after: log.before,
    });

    return res.status(200).json({ message: 'Cambio revertido correctamente', log });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.name === 'MissingSchemaError') {
      return res.status(422).json({ message: `No se encontró el modelo '${error.message}'` });
    }
    console.error('Error revirtiendo audit log:', error);
    return res.status(500).json({ message: 'Error al revertir cambio' });
  } finally {
    session.endSession();
  }
};

export default revertAuditLogHandler;
