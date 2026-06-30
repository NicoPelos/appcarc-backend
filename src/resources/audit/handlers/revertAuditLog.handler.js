import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../services/audit.service.js';

const OMIT_FIELDS = ['_id', '__v', 'createdAt', 'updatedAt'];

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

  try {
    const log = await AuditLog.findOne({ _id: id, clubId: req.user.clubId });
    if (!log) return res.status(404).json({ message: 'Log de auditoría no encontrado' });

    if (log.revertedAt) {
      return res.status(409).json({ message: 'Este log ya fue revertido', revertedAt: log.revertedAt, revertedBy: log.revertedBy });
    }

    const Model = mongoose.model(log.resource);
    const actor = req.user.email || String(req.user.id);

    if (log.action === 'CREATE') {
      // Revertir un CREATE → soft-delete el documento creado
      await Model.findByIdAndUpdate(log.resourceId, { $set: { active: false, updatedBy: actor } }, { upsert: false });
    } else if (log.action === 'UPDATE' || log.action === 'DELETE') {
      // Revertir UPDATE o DELETE → restaurar el snapshot before
      if (!log.before) {
        return res.status(422).json({ message: 'No hay snapshot anterior para revertir' });
      }

      const restoredData = Object.fromEntries(
        Object.entries(log.before).filter(([k]) => !OMIT_FIELDS.includes(k)),
      );
      restoredData.updatedBy = actor;

      await Model.findByIdAndUpdate(log.resourceId, { $set: restoredData }, { upsert: false });
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
    if (error.name === 'MissingSchemaError') {
      return res.status(422).json({ message: `No se encontró el modelo '${error.message}'` });
    }
    console.error('Error revirtiendo audit log:', error);
    return res.status(500).json({ message: 'Error al revertir cambio' });
  }
};

export default revertAuditLogHandler;
