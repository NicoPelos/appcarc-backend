import Precios from '../models/Precios.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/precios/{id}:
 *   put:
 *     summary: Actualizar precio (solo admin)
 *     tags: [Precios]
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
 *               monto: { type: number }
 *               vigenteDesde: { type: string, format: date }
 *               vigenteHasta: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Precio actualizado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Precio no encontrado
 *       500:
 *         description: Error al actualizar precio
 */
export const updatePrecioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, monto, vigenteDesde, vigenteHasta } = req.body;

    const precio = await Precios.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!precio) return res.status(404).json({ message: 'Precio no encontrado' });
    const precioAntes = precio.toObject();

    if (nombre !== undefined) precio.nombre = nombre;

    if (monto !== undefined) {
      if (isNaN(Number(monto)) || Number(monto) < 0) {
        return res.status(400).json({ message: 'monto debe ser un número mayor o igual a 0' });
      }
      precio.monto = Number(monto);
    }

    if (vigenteDesde !== undefined) {
      const d = new Date(vigenteDesde);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'vigenteDesde inválido' });
      precio.vigenteDesde = d;
    }

    if (vigenteHasta !== undefined) {
      precio.vigenteHasta = vigenteHasta ? new Date(vigenteHasta) : null;
    }

    precio.updatedBy = req.user.email || req.user.id;
    await precio.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Precios', resourceId: precio._id, before: precioAntes, after: precio.toObject() });
    return res.status(200).json(precio);
  } catch (error) {
    console.error('Error actualizando precio:', error);
    return res.status(500).json({ message: 'Error al actualizar precio' });
  }
};

export default updatePrecioHandler;
