import Movimiento from '../models/Movimiento.js';
import { logAudit } from '../../audit/services/audit.service.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

/**
 * @openapi
 * /api/movimientos:
 *   post:
 *     summary: Crear un nuevo movimiento
 *     tags: [Movimientos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MovimientoCreateRequest'
 *     responses:
 *       201:
 *         description: Movimiento creado exitosamente
 *       400:
 *         description: Error en los datos enviados para crear el movimiento
 *       500:
 *         description: Error al crear movimiento
 *
 * components:
 *   schemas:
 *     MovimientoCreateRequest:
 *       type: object
 *       required:
 *         - type
 *         - amount
 *         - concept
 *         - responsable
 *         - paymentMethod
 *       properties:
 *         type:
 *           type: string
 *           enum: [Ingreso, Egreso]
 *           description: Tipo de movimiento (Ingreso o Egreso)
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Importe del movimiento
 *         concept:
 *           type: string
 *           description: Concepto del movimiento
 *         responsable:
 *           type: string
 *           description: Responsable del movimiento
 *         paymentMethod:
 *           type: string
 *           enum: [Efectivo, Transferencia]
 *           description: Forma de pago del movimiento
 *         description:
 *           type: string
 *           description: Descripción adicional del movimiento (opcional)
 *         date:
 *           type: string
 *           format: date-time
 *           description: Fecha del movimiento (opcional)
 */ 

export const createMovimientoHandler = async (req, res) => {
  try {
    const {
      type,
      amount,
      concept,
      responsable,
      paymentMethod,
      description,
      date,
    } = req.body;

    if (!type || !['Ingreso', 'Egreso'].includes(type)) {
      return res.status(400).json({ message: 'Tipo de movimiento inválido' });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'El importe debe ser un número mayor que cero' });
    }

    if (!concept || typeof concept !== 'string') {
      return res.status(400).json({ message: 'El concepto es obligatorio' });
    }

    if (!responsable || typeof responsable !== 'string') {
      return res.status(400).json({ message: 'El responsable es obligatorio' });
    }

    if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'La forma de pago debe ser Efectivo o Transferencia' });
    }

    const movementDate = date ? new Date(date) : new Date();
    if (Number.isNaN(movementDate.getTime())) {
      return res.status(400).json({ message: 'La fecha del movimiento es inválida' });
    }

    const movimiento = new Movimiento({
      clubId: req.user.clubId,
      userId: req.user.id,
      responsable,
      type,
      amount,
      concept,
      paymentMethod,
      description: description || '',
      date: movementDate,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await movimiento.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Movimiento', resourceId: movimiento._id, before: null, after: movimiento.toObject() });
    res.status(201).json(movimiento);
  } catch (error) {
    console.error('Error creando movimiento:', error);
    res.status(500).json({ message: 'Error al crear movimiento' });
  }
};
