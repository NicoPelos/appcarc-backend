import Etiqueta from '../models/Etiqueta.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/etiquetas/{id}:
 *   put:
 *     summary: Actualizar etiqueta (solo admin)
 *     tags: [Etiquetas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               uso_sistema: { type: string }
 *     responses:
 *       200:
 *         description: Etiqueta actualizada
 *       404:
 *         description: Etiqueta no encontrada
 *       500:
 *         description: Error al actualizar etiqueta
 */
export const updateEtiquetaHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, uso_sistema } = req.body;

    const etiqueta = await Etiqueta.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });
    const etiquetaAntes = etiqueta.toObject();

    if (nombre !== undefined) etiqueta.nombre = nombre;
    if (uso_sistema !== undefined) etiqueta.uso_sistema = uso_sistema;

    etiqueta.updatedBy = req.user.email || req.user.id;
    await etiqueta.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Etiqueta', resourceId: etiqueta._id, before: etiquetaAntes, after: etiqueta.toObject() });
    return res.status(200).json(etiqueta);
  } catch (error) {
    console.error('Error actualizando etiqueta:', error);
    return res.status(500).json({ message: 'Error al actualizar etiqueta' });
  }
};

export default updateEtiquetaHandler;
