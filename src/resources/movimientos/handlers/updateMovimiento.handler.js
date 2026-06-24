import Movimiento from '../models/Movimiento.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

/**
 * @openapi
 * /api/movimientos/{id}:
 *   put:
 *     summary: Actualizar un movimiento de caja
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del movimiento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [Ingreso, Egreso]
 *               amount:
 *                 type: number
 *               concept:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [Efectivo, Transferencia]
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Movimiento actualizado exitosamente
 *       400:
 *         description: Error en los datos enviados
 *       404:
 *         description: Movimiento no encontrado
 *       500:
 *         description: Error al actualizar movimiento
 */
export const updateMovimientoHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, concept, paymentMethod, description, date } = req.body;

    const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });

    if (type !== undefined && !['Ingreso', 'Egreso'].includes(type)) {
      return res.status(400).json({ message: 'Tipo de movimiento inválido' });
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      return res.status(400).json({ message: 'El importe debe ser un número mayor que cero' });
    }

    if (concept !== undefined && (typeof concept !== 'string' || !concept.trim())) {
      return res.status(400).json({ message: 'El concepto no puede estar vacío' });
    }

    if (paymentMethod !== undefined && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'La forma de pago debe ser Efectivo o Transferencia' });
    }

    if (date !== undefined) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'La fecha del movimiento es inválida' });
      }
      movimiento.date = d;
    }

    if (type !== undefined) movimiento.type = type;
    if (amount !== undefined) movimiento.amount = amount;
    if (concept !== undefined) movimiento.concept = concept.trim();
    if (paymentMethod !== undefined) movimiento.paymentMethod = paymentMethod;
    if (description !== undefined) movimiento.description = description;
    movimiento.updatedBy = req.user?.email ?? req.user?.id ?? 'Sistema';

    await movimiento.save();
    res.status(200).json(movimiento);
  } catch (error) {
    console.error('Error actualizando movimiento:', error);
    res.status(500).json({ message: 'Error al actualizar movimiento' });
  }
};
