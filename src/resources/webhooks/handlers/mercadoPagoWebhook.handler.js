import MercadoPagoConfig from '../../pagos/models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../../pagos/models/PagoOnlineIntent.js';
import { verifyMercadoPagoSignature } from '../services/verifyMercadoPagoSignature.service.js';
import { registrarCobro } from '../../cobros/services/registrarCobro.service.js';

const MP_API_BASE = 'https://api.mercadopago.com';

const estadoFromMpStatus = (status) => {
  if (status === 'approved') return 'aprobado';
  if (status === 'rejected' || status === 'cancelled') return 'rechazado';
  return 'pendiente';
};

// Convierte los items guardados en el intent (shape genérico: suscripcion,
// cargo puntual o muro libre) de vuelta al body que espera registrarCobro —
// mismo mecanismo interno que un cobro manual de secretaría, forma de pago
// 'MercadoPago'.
const itemsParaRegistrarCobro = (intent) => intent.items.map((item) => ({
  socioId: String(item.socioId),
  ...(item.suscripcionId ? { suscripcionId: String(item.suscripcionId) } : {}),
  ...(item.cargoPuntualId ? { cargoPuntualId: String(item.cargoPuntualId) } : {}),
  ...(item.muroLibrePendiente ? { muroLibrePendiente: true } : {}),
  ...(item.periodos?.length ? { periodos: item.periodos } : {}),
  ...(item.cantidad != null ? { cantidad: item.cantidad } : {}),
  amount: item.amount,
  ...(item.description ? { description: item.description } : {}),
}));

/**
 * @openapi
 * /api/webhooks/mercadopago/{clubId}:
 *   post:
 *     summary: Notificación de Mercado Pago para un club (pública, verificada por firma HMAC propia del club)
 *     description: >
 *       La URL incluye el clubId porque cada club usa su propia cuenta de Mercado Pago
 *       (sin OAuth Connect) — así se sabe de entrada qué credenciales/secreto usar
 *       para verificar, sin depender de datos no verificados del body.
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Procesado (o ignorado si no aplica)
 *       401:
 *         description: Firma inválida o club sin Mercado Pago configurado
 */
export const mercadoPagoWebhookHandler = async (req, res) => {
  try {
    const { clubId } = req.params;

    // IPN (el mecanismo viejo, en paralelo a Webhooks) manda topic/id como
    // query params y nunca firma con x-signature — se detecta por la
    // ausencia de ese header, no por una ruta/formato distinto.
    const isIpn = !req.headers['x-signature'];

    const type = req.body?.type || req.query?.type || req.query?.topic;
    if (type && type !== 'payment') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const dataId = req.body?.data?.id || req.query['data.id'] || req.query?.id;
    if (!dataId) return res.status(200).json({ ok: true, ignored: true });

    const config = await MercadoPagoConfig.findOne({ clubId, active: true });
    if (!config?.webhookSecret || !config?.accessToken) {
      console.error(`Webhook de Mercado Pago recibido para club ${clubId} sin configuración completa`);
      return res.status(401).json({ message: 'No verificado' });
    }

    // IPN no manda firma — la autenticidad se apoya en el paso siguiente
    // (volver a pedir el pago a la API de Mercado Pago con nuestro propio
    // accessToken): un tercero que mande un topic/id inventado nunca hace
    // avanzar el flujo, porque el pago real resultante no va a matchear
    // ningún PagoOnlineIntent pendiente. Para Webhooks (si manda firma) se
    // sigue exigiendo que verifique, igual que antes.
    if (!isIpn) {
      const signatureOk = verifyMercadoPagoSignature({
        xSignature: req.headers['x-signature'],
        xRequestId: req.headers['x-request-id'],
        dataId,
        webhookSecret: config.webhookSecret,
      });

      if (!signatureOk) {
        console.error(`Firma inválida en webhook de Mercado Pago para club ${clubId}`);
        return res.status(401).json({ message: 'Firma inválida' });
      }
    }

    // A partir de acá (firma validada, o notificación IPN sin firma posible)
    // se confía en cualquier dato recién después de volver a pedirlo a la
    // API de Mercado Pago con nuestras propias credenciales.
    const paymentResponse = await fetch(`${MP_API_BASE}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    if (!paymentResponse.ok) {
      console.error(`No se pudo obtener el pago ${dataId} de Mercado Pago (club ${clubId}):`, paymentResponse.status);
      return res.status(200).json({ ok: true, retry: true });
    }

    const payment = await paymentResponse.json();

    if (!payment.external_reference) {
      console.error(`Pago ${dataId} sin external_reference (club ${clubId})`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    const intent = await PagoOnlineIntent.findOne({ externalReference: payment.external_reference, clubId });
    if (!intent) {
      console.error(`No se encontró PagoOnlineIntent para external_reference ${payment.external_reference} (club ${clubId})`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    const estadoNuevo = estadoFromMpStatus(payment.status);

    if (estadoNuevo === 'aprobado' && Number(payment.transaction_amount) !== intent.totalAmount) {
      console.error(`Monto no coincide para el pago ${dataId} (intent ${intent._id}): esperado ${intent.totalAmount}, recibido ${payment.transaction_amount}`);
      await PagoOnlineIntent.findOneAndUpdate(
        { _id: intent._id, estado: 'pendiente' },
        { $set: { estado: 'rechazado', mpPaymentId: String(dataId), mpStatus: payment.status, mpStatusDetail: 'monto_no_coincide' } },
      );
      return res.status(200).json({ ok: true });
    }

    const updated = await PagoOnlineIntent.findOneAndUpdate(
      { _id: intent._id, estado: 'pendiente' },
      {
        $set: {
          estado: estadoNuevo,
          mpPaymentId: String(dataId),
          mpStatus: payment.status,
          mpStatusDetail: payment.status_detail || null,
        },
      },
      { new: true },
    );

    if (!updated) {
      // Ya se había procesado esta notificación antes (reintento de MP) — no-op.
      return res.status(200).json({ ok: true, duplicate: true });
    }

    if (updated.estado === 'aprobado') {
      try {
        const result = await registrarCobro({
          clubId: updated.clubId,
          user: { id: updated.requestedByUserId, email: updated.requestedByEmail },
          body: {
            paymentMethod: 'MercadoPago',
            description: `Pago online Mercado Pago (payment ${dataId})`,
            items: itemsParaRegistrarCobro(updated),
          },
        });
        updated.cobroId = result.cobro._id;
        await updated.save();
      } catch (err) {
        // No reintentar automáticamente: si esto falla es un conflicto de negocio real
        // (ej. la cuota ya se cobró por otro medio mientras el checkout estaba abierto),
        // no algo transitorio. Queda para revisión manual.
        console.error(`Error registrando cobro para intent ${updated._id} tras pago aprobado ${dataId}:`, err);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error procesando webhook de Mercado Pago:', error);
    return res.status(200).json({ ok: false });
  }
};

export default mercadoPagoWebhookHandler;
