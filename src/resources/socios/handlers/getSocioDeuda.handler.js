import mongoose from 'mongoose';
import { calcularDeuda } from '../../cuotas/services/calcularDeuda.service.js';

/**
 * @openapi
 * /api/socios/{id}/deuda:
 *   get:
 *     summary: Calcular deuda de un socio basada en sus suscripciones activas
 *     tags: [Socios]
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
 *         description: Array de deudas por suscripción
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   suscripcionId: { type: string }
 *                   etiqueta:
 *                     type: object
 *                     properties:
 *                       nombre: { type: string }
 *                       unidad: { type: string }
 *                       uso_sistema: { type: string, nullable: true }
 *                   fechaDesde: { type: string }
 *                   fechaHasta: { type: string, nullable: true }
 *                   ultimoPeriodoPagado: { type: string, nullable: true }
 *                   periodoActual: { type: string }
 *                   mesesDeuda: { type: integer }
 *                   periodos: { type: array, items: { type: string } }
 *                   precioUnitario: { type: number, nullable: true }
 *                   totalDeuda: { type: number, nullable: true }
 *       403:
 *         description: Sin permiso para ver la deuda de este socio
 *       404:
 *         description: Socio no encontrado
 *       500:
 *         description: Error al calcular deuda
 */
export const getSocioDeudaHandler = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Socio no encontrado' });
  }

  if (req.user.role === 'socio' && req.user.socioId !== id) {
    return res.status(403).json({ message: 'No tenés permiso para ver la deuda de este socio' });
  }

  try {
    const deuda = await calcularDeuda({ socioId: id, clubId: req.user.clubId });
    return res.status(200).json(deuda);
  } catch (error) {
    console.error('Error calculando deuda:', error);
    return res.status(500).json({ message: 'Error al calcular deuda' });
  }
};

export default getSocioDeudaHandler;
