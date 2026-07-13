import mongoose from 'mongoose';
import AuditLog from '../../audit/models/AuditLog.js';
import { logAudit } from '../../audit/services/audit.service.js';
import { REVERSERS } from '../../audit/services/reversers/index.js';

const OMIT_FIELDS = ['_id', '__v', 'createdAt', 'updatedAt'];

// Igual que revertAuditLog.handler.js (recurso normal), salvo que no filtra
// por clubId del actor: el superadmin no pertenece a ningún club real, así
// que necesita poder revertir el log de cualquier club.
export const revertSuperAuditHandler = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID de log inválido' });
  }

  const session = await mongoose.startSession();
  try {
    const log = await AuditLog.findById(id);
    if (!log) return res.status(404).json({ message: 'Log de auditoría no encontrado' });

    if (log.revertedAt) {
      return res.status(409).json({ message: 'Este log ya fue revertido', revertedAt: log.revertedAt, revertedBy: log.revertedBy });
    }

    const actor = req.user.email || String(req.user.id);
    const reverser = REVERSERS[log.resource];

    if (reverser) {
      await session.withTransaction(async () => {
        await reverser(log, { actor, session });
      });
    } else {
      const Model = mongoose.model(log.resource);

      if (log.action === 'CREATE') {
        await Model.findByIdAndUpdate(log.resourceId, { $set: { active: false, updatedBy: actor } }, { upsert: false });
      } else if (log.action === 'UPDATE' || log.action === 'DELETE') {
        if (!log.before) {
          return res.status(422).json({ message: 'No hay snapshot anterior para revertir' });
        }

        const restoredData = Object.fromEntries(
          Object.entries(log.before).filter(([k]) => !OMIT_FIELDS.includes(k)),
        );
        restoredData.updatedBy = actor;

        await Model.findByIdAndUpdate(log.resourceId, { $set: restoredData }, { upsert: false });
      }
    }

    log.revertedAt = new Date();
    log.revertedBy = actor;
    await log.save();

    logAudit({
      clubId: log.clubId,
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
    console.error('Error revirtiendo audit log (super):', error);
    return res.status(500).json({ message: 'Error al revertir cambio' });
  } finally {
    session.endSession();
  }
};

export default revertSuperAuditHandler;
