import { anularVinculoFamiliar, BusinessError } from '../services/anularVinculoFamiliar.service.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/vinculos/{id}/anular:
 *   post:
 *     summary: Anular un vínculo familiar
 *     tags: [Vinculos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vínculo anulado
 *       404:
 *         description: No encontrado
 */
export const anularVinculoHandler = async (req, res) => {
  try {
    const vinculo = await anularVinculoFamiliar({ clubId: req.user?.clubId, user: req.user, id: req.params.id });
    logAudit({ clubId: req.user?.clubId, req, action: 'DELETE', resource: 'VinculoFamiliar', resourceId: vinculo._id, before: null, after: vinculo.toObject() });
    return res.status(200).json(vinculo);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error anulando vínculo familiar:', error);
    return res.status(500).json({ message: 'Error al anular el vínculo' });
  }
};

export default anularVinculoHandler;
