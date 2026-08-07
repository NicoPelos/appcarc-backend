import PagoOnlineIntent from '../models/PagoOnlineIntent.js';
import { procesarPagoMercadoPago } from './procesarPagoMercadoPago.service.js';

const MP_API_BASE = 'https://api.mercadopago.com';

// Red de seguridad para cuando ni el Webhook ni el IPN de Mercado Pago
// llegan (ver saga de Hookdeck/502 intermitentes): un intent pendiente no
// tiene mpPaymentId propio, así que se busca por external_reference, que sí
// generamos nosotros al crear la preferencia.
const DIAS_MAXIMOS_A_REVISAR = 7;

const buscarPagoPorExternalReference = async ({ accessToken, externalReference }) => {
  const url = `${MP_API_BASE}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = await response.json();
  const results = data?.results || [];
  if (!results.length) return null;
  return results.find((p) => p.status === 'approved') || results[0];
};

/**
 * Revisa los PagoOnlineIntent pendientes de un club contra la API de
 * búsqueda de pagos de Mercado Pago. Usado tanto por el cron cada 30 min
 * como por el botón manual de "revisar ahora" en la app.
 */
export const reconciliarPagosMercadoPagoClub = async ({ clubId, accessToken }) => {
  const desde = new Date(Date.now() - DIAS_MAXIMOS_A_REVISAR * 24 * 60 * 60 * 1000);
  const pendientes = await PagoOnlineIntent.find({
    clubId,
    estado: 'pendiente',
    createdAt: { $gte: desde },
  });

  let resueltos = 0;
  for (const intent of pendientes) {
    const payment = await buscarPagoPorExternalReference({
      accessToken,
      externalReference: intent.externalReference,
    });
    if (!payment) continue;

    const { resultado } = await procesarPagoMercadoPago({ clubId, payment });
    if (resultado === 'aprobado' || resultado === 'rechazado') resueltos++;
  }

  return { revisados: pendientes.length, resueltos };
};
