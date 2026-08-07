import cron from 'node-cron';
import MercadoPagoConfig from '../resources/pagos/models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../resources/pagos/models/PagoOnlineIntent.js';
import { procesarPagoMercadoPago } from '../resources/pagos/services/procesarPagoMercadoPago.service.js';
import { notifyJobFailure } from '../services/pushNotification.service.js';

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

const reconciliarClub = async (config) => {
  const desde = new Date(Date.now() - DIAS_MAXIMOS_A_REVISAR * 24 * 60 * 60 * 1000);
  const pendientes = await PagoOnlineIntent.find({
    clubId: config.clubId,
    estado: 'pendiente',
    createdAt: { $gte: desde },
  });

  let procesados = 0;
  for (const intent of pendientes) {
    const payment = await buscarPagoPorExternalReference({
      accessToken: config.accessToken,
      externalReference: intent.externalReference,
    });
    if (!payment) continue;

    const { resultado } = await procesarPagoMercadoPago({ clubId: config.clubId, payment });
    if (resultado === 'aprobado' || resultado === 'rechazado') procesados++;
  }

  return procesados;
};

export const reconciliarPagosMercadoPago = async () => {
  console.log('💳 Reconciliación Mercado Pago: revisando intents pendientes...');
  const configs = await MercadoPagoConfig.find({ active: true });

  let total = 0;
  for (const config of configs) {
    try {
      total += await reconciliarClub(config);
    } catch (err) {
      console.error(`❌ Reconciliación Mercado Pago [${config.clubId}]: error revisando:`, err.message);
      await notifyJobFailure(config.clubId, 'Reconciliación Mercado Pago', err.message);
    }
  }

  console.log(`💳 Reconciliación Mercado Pago: ${total} pagos resueltos por polling`);
};

export const startReconciliarPagosMercadoPagoJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await reconciliarPagosMercadoPago();
    } catch (err) {
      console.error('❌ Error en reconciliación de Mercado Pago:', err.message);
    }
  });

  console.log('💳 Reconciliación de pagos Mercado Pago job iniciado (cada 30 min)');
};
