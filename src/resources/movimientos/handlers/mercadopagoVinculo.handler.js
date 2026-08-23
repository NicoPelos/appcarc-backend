import Movimiento from '../models/Movimiento.js';
import MercadoPagoConfig from '../../pagos/models/MercadoPagoConfig.js';
import { obtenerPagoMercadoPago } from '../../pagos/services/procesarPagoMercadoPago.service.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/movimientos/{id}/mercadopago-vinculo:
 *   post:
 *     summary: Vincular manualmente un Movimiento (Ingreso + Transferencia) con un pago real de Mercado Pago
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId: { type: string }
 *     responses:
 *       200:
 *         description: Vínculo guardado
 *       400:
 *         description: El movimiento no es Ingreso + Transferencia, o el pago no existe/no está aprobado
 *       404:
 *         description: Movimiento no encontrado
 */
export const vincularMercadopagoHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ message: 'Falta paymentId' });

    const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });
    if (movimiento.type !== 'Ingreso' || movimiento.paymentMethod !== 'Transferencia') {
      return res.status(400).json({ message: 'Solo se puede vincular un Ingreso por Transferencia' });
    }

    const config = await MercadoPagoConfig.findOne({ clubId: req.user?.clubId, active: true });
    if (!config) return res.status(400).json({ message: 'El club no tiene Mercado Pago configurado' });

    const { ok, payment } = await obtenerPagoMercadoPago({ accessToken: config.accessToken, dataId: paymentId });
    if (!ok || payment.status !== 'approved') {
      return res.status(400).json({ message: 'Ese pago no existe o no está aprobado en Mercado Pago' });
    }

    const yaVinculado = await Movimiento.findOne({
      clubId: req.user?.clubId,
      active: true,
      _id: { $ne: movimiento._id },
      'mercadopagoVinculo.paymentId': String(payment.id),
    }).lean();
    if (yaVinculado) {
      return res.status(409).json({ message: 'Ese pago de Mercado Pago ya está vinculado a otro movimiento' });
    }

    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';
    const before = movimiento.mercadopagoVinculo;
    movimiento.mercadopagoVinculo = {
      paymentId: String(payment.id),
      payerEmail: payment.payer?.email ?? '',
      monto: payment.transaction_amount,
      fecha: payment.date_approved,
      vinculadoPor: actor,
    };
    // El medio de pago pasa a reflejar la realidad — llegó por Mercado Pago,
    // no una transferencia bancaria genérica. Se revierte en desvincular.
    movimiento.paymentMethod = 'MercadoPago';
    movimiento.updatedBy = actor;
    await movimiento.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Movimiento', resourceId: movimiento._id, before, after: movimiento.mercadopagoVinculo });
    res.json(movimiento);
  } catch (error) {
    console.error('Error vinculando pago de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al vincular el pago' });
  }
};

/**
 * @openapi
 * /api/movimientos/{id}/mercadopago-vinculo:
 *   delete:
 *     summary: Quitar el vínculo con Mercado Pago de un movimiento
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vínculo quitado
 *       404:
 *         description: Movimiento no encontrado
 */
export const desvincularMercadopagoHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });

    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';
    const before = movimiento.mercadopagoVinculo;
    movimiento.mercadopagoVinculo = null;
    if (movimiento.paymentMethod === 'MercadoPago') movimiento.paymentMethod = 'Transferencia';
    movimiento.updatedBy = actor;
    await movimiento.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Movimiento', resourceId: movimiento._id, before, after: null });
    res.json(movimiento);
  } catch (error) {
    console.error('Error quitando vínculo de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al quitar el vínculo' });
  }
};
