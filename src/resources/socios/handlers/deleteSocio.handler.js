import Socio from '../models/Socio.js';
import { syncSocioToSheet } from '../services/socioSheetSync.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/socios/{id}:
 *   delete:
 *     summary: Eliminar socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID del socio
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Socio eliminado con éxito
 *       404:
 *         description: Socio no encontrado
 *       500:
 *         description: Error al eliminar socio
 */

export const deleteSocioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socioAntes = await Socio.findOne({ _id: id, clubId: req.user?.clubId }).lean();
    if (!socioAntes) return res.status(404).json({ message: 'Socio no encontrado' });

    const socio = await Socio.findOneAndUpdate(
      { _id: id, clubId: req.user?.clubId },
      { active: false, deletedAt: new Date(), deletedBy: req.user?.id, updatedBy: req.user?.id },
      { returnDocument: 'after' }
    );

    await syncSocioToSheet(socio, { appendIfMissing: false, deleted: true });

    logAudit({ clubId: req.user?.clubId, req, action: 'DELETE', resource: 'Socio', resourceId: id, before: socioAntes, after: null });

    res.status(200).json({ message: 'Socio desactivado con éxito' });
  } catch (error) {
    console.error('Error eliminando socio (handler):', error);
    res.status(500).json({ message: 'Error al eliminar socio' });
  }
};

export default deleteSocioHandler;
