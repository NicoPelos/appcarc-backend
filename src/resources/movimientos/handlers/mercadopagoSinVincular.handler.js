import Movimiento from '../models/Movimiento.js';
import MercadoPagoConfig from '../../pagos/models/MercadoPagoConfig.js';
import MercadopagoDescartado from '../../pagos/models/MercadopagoDescartado.js';
import { buscarPagosMercadoPago } from '../../pagos/services/buscarPagosMercadoPago.service.js';

const DIAS_DEFAULT = 30;

/**
 * @openapi
 * /api/movimientos/mercadopago-sin-vincular:
 *   get:
 *     summary: Pagos de Mercado Pago en un rango de fechas que no están vinculados a ningún movimiento ni descartados
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Lista de pagos sin vincular, ordenados por fecha descendente
 *       400:
 *         description: El club no tiene Mercado Pago configurado
 */
export const mercadopagoSinVincularHandler = async (req, res) => {
  try {
    const config = await MercadoPagoConfig.findOne({ clubId: req.user?.clubId, active: true });
    if (!config) return res.status(400).json({ message: 'El club no tiene Mercado Pago configurado' });

    const hasta = req.query.hasta ? new Date(`${req.query.hasta}T23:59:59.999Z`) : new Date();
    const desde = req.query.desde
      ? new Date(`${req.query.desde}T00:00:00.000Z`)
      : new Date(hasta.getTime() - DIAS_DEFAULT * 24 * 60 * 60 * 1000);

    const pagos = await buscarPagosMercadoPago({ accessToken: config.accessToken, desde, hasta });
    const paymentIds = pagos.map((p) => p.paymentId);

    const [vinculados, descartados] = await Promise.all([
      Movimiento.distinct('mercadopagoVinculos.paymentId', {
        clubId: req.user?.clubId,
        active: true,
        'mercadopagoVinculos.paymentId': { $in: paymentIds },
      }),
      MercadopagoDescartado.find({ clubId: req.user?.clubId, paymentId: { $in: paymentIds } }).lean(),
    ]);
    const vinculadosSet = new Set(vinculados);
    const descartadosSet = new Set(descartados.map((d) => d.paymentId));

    const sinVincular = pagos
      .filter((p) => !vinculadosSet.has(p.paymentId) && !descartadosSet.has(p.paymentId))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(sinVincular);
  } catch (error) {
    console.error('Error buscando pagos de Mercado Pago sin vincular:', error);
    res.status(500).json({ message: 'Error al buscar pagos sin vincular' });
  }
};

/**
 * @openapi
 * /api/movimientos/mercadopago-sin-vincular/{paymentId}/descartar:
 *   post:
 *     summary: Marcar un pago de Mercado Pago como revisado (no corresponde vincularlo a ningún movimiento)
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo: { type: string }
 *     responses:
 *       200:
 *         description: Marcado como descartado
 */
export const descartarMercadopagoHandler = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { motivo = '' } = req.body ?? {};
    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';

    const descartado = await MercadopagoDescartado.findOneAndUpdate(
      { clubId: req.user?.clubId, paymentId },
      { motivo: motivo.trim(), descartadoPor: actor },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json(descartado);
  } catch (error) {
    console.error('Error descartando pago de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al descartar el pago' });
  }
};

/**
 * @openapi
 * /api/movimientos/mercadopago-sin-vincular/descartar-bulk:
 *   post:
 *     summary: Marcar varios pagos de Mercado Pago como revisados de una vez
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentIds]
 *             properties:
 *               paymentIds: { type: array, items: { type: string } }
 *               motivo: { type: string }
 *     responses:
 *       200:
 *         description: Cantidad de pagos descartados
 *       400:
 *         description: Falta paymentIds
 */
export const descartarMercadopagoBulkHandler = async (req, res) => {
  try {
    const { paymentIds, motivo = '' } = req.body ?? {};
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return res.status(400).json({ message: 'Falta paymentIds' });
    }
    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';

    const result = await MercadopagoDescartado.bulkWrite(
      paymentIds.map((paymentId) => ({
        updateOne: {
          filter: { clubId: req.user?.clubId, paymentId },
          update: { $set: { motivo: motivo.trim(), descartadoPor: actor } },
          upsert: true,
        },
      })),
    );
    res.json({ descartados: paymentIds.length, ...result });
  } catch (error) {
    console.error('Error descartando pagos de Mercado Pago en lote:', error);
    res.status(500).json({ message: 'Error al descartar los pagos' });
  }
};

/**
 * @openapi
 * /api/movimientos/mercadopago-descartados:
 *   get:
 *     summary: Listar los pagos de Mercado Pago marcados como descartados
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de descartados, más reciente primero
 */
export const getMercadopagoDescartadosHandler = async (req, res) => {
  try {
    const descartados = await MercadopagoDescartado
      .find({ clubId: req.user?.clubId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(descartados);
  } catch (error) {
    console.error('Error listando pagos descartados de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al listar los descartados' });
  }
};

/**
 * @openapi
 * /api/movimientos/mercadopago-descartados/{paymentId}:
 *   delete:
 *     summary: Deshacer el descarte de un pago (vuelve a aparecer en "sin vincular")
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Descarte deshecho
 *       404:
 *         description: No estaba descartado
 */
export const restaurarMercadopagoDescartadoHandler = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const eliminado = await MercadopagoDescartado.findOneAndDelete({ clubId: req.user?.clubId, paymentId });
    if (!eliminado) return res.status(404).json({ message: 'Ese pago no estaba descartado' });
    res.json({ message: 'Descarte deshecho' });
  } catch (error) {
    console.error('Error restaurando pago descartado de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al restaurar el descarte' });
  }
};
