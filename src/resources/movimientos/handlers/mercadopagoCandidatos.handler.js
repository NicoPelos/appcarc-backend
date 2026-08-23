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
    if (movimiento.type !== 'Ingreso' || movimiento.paymentMethod !== 'Transferencia') {
      return res.status(400).json({ message: 'Solo se puede vincular un Ingreso por Transferencia' });
    }

    const config = await MercadoPagoConfig.findOne({ clubId: req.user?.clubId, active: true });
    if (!config) return res.status(400).json({ message: 'El club no tiene Mercado Pago configurado' });

    const candidatos = await buscarPagosMercadoPago({ accessToken: config.accessToken, fecha: movimiento.date });

    // No ofrecer un pago que ya está vinculado a otro movimiento activo —
    // un mismo pago de MP no puede corresponder a dos movimientos distintos.
    const paymentIds = candidatos.map((c) => c.paymentId);
    const yaVinculados = new Set(
      await Movimiento.distinct('mercadopagoVinculo.paymentId', {
        clubId: req.user?.clubId,
        active: true,
        _id: { $ne: movimiento._id },
        'mercadopagoVinculo.paymentId': { $in: paymentIds },
      }),
    );
    const disponibles = candidatos.filter((c) => !yaVinculados.has(c.paymentId));
    disponibles.sort((a, b) => Math.abs(a.monto - movimiento.amount) - Math.abs(b.monto - movimiento.amount));

    res.json(disponibles);
  } catch (error) {
    console.error('Error buscando candidatos de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al buscar pagos de Mercado Pago' });
  }
};

export default mercadopagoCandidatosHandler;
