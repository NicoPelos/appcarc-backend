import Socio from '../models/Socio.js';
import { syncSocioToSheet } from '../services/socioSheetSync.js';

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
    const socio = await Socio.findOneAndUpdate(
      { _id: id, clubId: req.user?.clubId },
      {
        active: false,
        deletedAt: new Date(),
        deletedBy: req.user?.id,
        updatedBy: req.user?.id,
      },
      { returnDocument: 'after' }
    );
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });

    await syncSocioToSheet(socio, { appendIfMissing: false, deleted: true });

    res.status(200).json({ message: 'Socio desactivado con éxito' });
  } catch (error) {
    console.error('Error eliminando socio (handler):', error);
    res.status(500).json({ message: 'Error al eliminar socio' });
  }
};

export default deleteSocioHandler;
