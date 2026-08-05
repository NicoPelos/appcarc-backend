import { BusinessError, crearPreferenciaCobroMercadoPago } from '../services/crearPreferenciaCobroMercadoPago.service.js';

/**
 * @openapi
 * /api/pagos/mercadopago/preferencia-cobro:
 *   post:
 *     summary: Generar un link de pago de Mercado Pago para un cobro armado por secretaría (admin o secretaria)
 *     description: >
 *       Toma los mismos items que /api/cobros (cuotas, cargos puntuales, muro libre) con
 *       los montos ya confirmados en Registrar Cobro, y genera una preferencia de pago
 *       para compartir por WhatsApp. El cobro real recién se registra cuando el webhook
 *       de Mercado Pago confirma el pago aprobado.
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [socioId, items]
 *             properties:
 *               socioId:
 *                 type: string
 *               description:
 *                 type: string
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [socioId, amount]
 *                   properties:
 *                     socioId: { type: string }
 *                     suscripcionId: { type: string }
 *                     cargoPuntualId: { type: string }
 *                     muroLibrePendiente: { type: boolean }
 *                     periodos:
 *                       type: array
 *                       items: { type: string }
 *                     cantidad: { type: integer }
 *                     amount:
 *                       type: number
 *                       description: Requerido — Mercado Pago necesita un monto concreto antes de que exista el cobro.
 *                     description: { type: string }
 *     responses:
 *       201:
 *         description: Preferencia creada
 *       400:
 *         description: Datos inválidos o club sin Mercado Pago configurado
 *       404:
 *         description: Socio no encontrado
 *       502:
 *         description: Error comunicándose con Mercado Pago
 */
export const crearPreferenciaCobroMercadoPagoHandler = async (req, res) => {
  try {
    const result = await crearPreferenciaCobroMercadoPago({
      clubId: req.user?.clubId,
      requestedByUserId: req.user?.id,
      requestedByEmail: req.user?.email,
      socioId: req.body?.socioId,
      items: req.body?.items,
      description: req.body?.description,
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error generando link de pago de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al generar el link de pago' });
  }
};

export default crearPreferenciaCobroMercadoPagoHandler;
