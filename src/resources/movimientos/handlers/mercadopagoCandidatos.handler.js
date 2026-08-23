import Movimiento from '../models/Movimiento.js';
import MercadoPagoConfig from '../../pagos/models/MercadoPagoConfig.js';
import { buscarPagosMercadoPago } from '../../pagos/services/buscarPagosMercadoPago.service.js';

/**
 * @openapi
 * /api/movimientos/{id}/mercadopago-candidatos:
 *   get:
 *     summary: Buscar pagos de Mercado Pago cercanos a un movimiento (Ingreso + Transferencia) para vincular manualmente
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pagos candidatos, ordenados por cercanía de monto
 *       400:
 *         description: El movimiento no es Ingreso + Transferencia, o el club no tiene Mercado Pago configurado
 *       404:
 *         description: Movimiento no encontrado
 */
export const mercadopagoCandidatosHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const movimiento = await Movimiento.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });
    if (movimiento.type !== 'Ingreso' || movimiento.paymentMethod === 'Efectivo') {
      return res.status(400).json({ message: 'Solo se puede vincular un Ingreso por Transferencia o Mercado Pago' });
    }

    const config = await MercadoPagoConfig.findOne({ clubId: req.user?.clubId, active: true });
    if (!config) return res.status(400).json({ message: 'El club no tiene Mercado Pago configurado' });

    const candidatos = await buscarPagosMercadoPago({ accessToken: config.accessToken, fecha: movimiento.date });

    // Un mismo pago de MP puede legítimamente cubrir más de un movimiento
    // (ej. alguien que transfiere junto lo de dos personas, registrado como
    // 2 cobros separados acá) — no se oculta ni se bloquea, pero se avisa
    // dónde más está vinculado para no vincularlo dos veces por error.
    const paymentIds = candidatos.map((c) => c.paymentId);
    const otrosMovimientos = await Movimiento.find({
      clubId: req.user?.clubId,
      active: true,
      _id: { $ne: movimiento._id },
      'mercadopagoVinculos.paymentId': { $in: paymentIds },
    }).select('concept socioNombre mercadopagoVinculos.paymentId').lean();

    const vinculadoEnPorPaymentId = new Map();
    for (const otro of otrosMovimientos) {
      for (const v of otro.mercadopagoVinculos) {
        if (!paymentIds.includes(v.paymentId)) continue;
        const lista = vinculadoEnPorPaymentId.get(v.paymentId) ?? [];
        lista.push(otro.socioNombre || otro.concept);
        vinculadoEnPorPaymentId.set(v.paymentId, lista);
      }
    }

    const propioIds = new Set((movimiento.mercadopagoVinculos ?? []).map((v) => v.paymentId));
    const disponibles = candidatos
      .filter((c) => !propioIds.has(c.paymentId))
      .map((c) => ({ ...c, vinculadoEnOtros: vinculadoEnPorPaymentId.get(c.paymentId) ?? [] }));
    disponibles.sort((a, b) => Math.abs(a.monto - movimiento.amount) - Math.abs(b.monto - movimiento.amount));

    res.json(disponibles);
  } catch (error) {
    console.error('Error buscando candidatos de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al buscar pagos de Mercado Pago' });
  }
};

export default mercadopagoCandidatosHandler;
