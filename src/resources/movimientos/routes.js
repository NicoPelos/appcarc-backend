import express from 'express';
import { createMovimientoHandler } from './handlers/createMovimiento.handler.js';
import { getMovimientosHandler } from './handlers/getMovimientos.handler.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = express.Router();

/**
 * @openapi
 * /api/movimientos:
 *   get:
 *     summary: Obtener lista de movimientos de caja
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de movimientos disponible
 */
router.get('/', protect, authorize('admin', 'secretary'), getMovimientosHandler);

/**
 * @openapi
 * /api/movimientos:
 *   post:
 *     summary: Registrar un ingreso o egreso de caja
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - amount
 *               - concept
 *               - responsable
 *               - paymentMethod
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [Ingreso, Egreso]
 *               amount:
 *                 type: number
 *               concept:
 *                 type: string
 *               responsable:
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
 *       201:
 *         description: Movimiento creado exitosamente
 */
router.post('/', protect, authorize('admin', 'secretary'), createMovimientoHandler);

export default router;
