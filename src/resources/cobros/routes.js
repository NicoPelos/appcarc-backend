import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { createCobroHandler } from './handlers/createCobro.handler.js';
import { getCobrosHandler } from './handlers/getCobros.handler.js';

const router = express.Router();

/**
 * @openapi
 * /api/cobros:
 *   get:
 *     summary: Obtener cobros registrados
 *     tags: [Cobros]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cobros disponible
 */
router.get('/', protect, authorize('admin', 'secretary', 'viewer'), getCobrosHandler);

/**
 * @openapi
 * /api/cobros:
 *   post:
 *     summary: Registrar un cobro de cuotas y su movimiento de caja
 *     tags: [Cobros]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *               - items
 *             properties:
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
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - socioId
 *                     - tipo
 *                   properties:
 *                     socioId:
 *                       type: string
 *                     tipo:
 *                       type: string
 *                       enum: [social, escuelita]
 *                     periodo:
 *                       type: string
 *                       example: "2026-06"
 *                     periodoDesde:
 *                       type: string
 *                       example: "2026-06"
 *                     periodos:
 *                       type: array
 *                       items:
 *                         type: string
 *                     cantidad:
 *                       type: integer
 *                       example: 2
 *                     amount:
 *                       description: Importe unitario confirmado. Si no se envía, se usa el precio vigente.
 *                       type: number
 *                     precioSugeridoSnapshot:
 *                       type: number
 *                     description:
 *                       type: string
 *     responses:
 *       201:
 *         description: Cobro, cuotas y movimiento creados exitosamente
 */
router.post('/', protect, authorize('admin', 'secretary'), createCobroHandler);

export default router;
