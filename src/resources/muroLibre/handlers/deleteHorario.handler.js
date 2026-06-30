import Horarios from '../models/Horarios.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/horarios/{id}:
 *   delete:
 *     summary: Eliminar un horario (soft delete)
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Horario eliminado exitosamente
 *       404:
 *         description: Horario no encontrado
 *       500:
 *         description: Error al eliminar horario
 */
export const deleteHorarioHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const horario = await Horarios.findOne({ _id: id, active: true });
    if (!horario) return res.status(404).json({ message: 'Horario no encontrado' });
    const horarioAntes = horario.toObject();

    horario.active = false;
    horario.deletedAt = new Date();
    horario.deletedBy = req.user?.email ?? req.user?.id ?? 'Sistema';
    horario.updatedBy = req.user?.email ?? req.user?.id ?? 'Sistema';
    await horario.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'DELETE', resource: 'Horarios', resourceId: horario._id, before: horarioAntes, after: null });
    res.status(200).json({ message: 'Horario eliminado' });
  } catch (error) {
    console.error('Error eliminando horario:', error);
    res.status(500).json({ message: 'Error al eliminar horario' });
  }
};
