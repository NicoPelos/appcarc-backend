// Backfill único: Movimientos creados por pagos hechos vía el link de Mercado
// Pago que genera el sistema, ANTES del fix que autovincula el pago real de
// MP al Movimiento en el momento del webhook (ver procesarPagoMercadoPago
// .service.js). Recorre los PagoOnlineIntent ya aprobados con cobro
// registrado, y para cada uno completa el vínculo en su Movimiento si
// todavía no lo tiene — reconsultando el pago a la API de MP (mismo camino
// que usa la vinculación manual) para tener payerEmail/monto/fecha reales,
// ya que el intent solo guarda el id del pago.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import PagoOnlineIntent from '../src/resources/pagos/models/PagoOnlineIntent.js';
import MercadoPagoConfig from '../src/resources/pagos/models/MercadoPagoConfig.js';
import Movimiento from '../src/resources/movimientos/models/Movimiento.js';
import { obtenerPagoMercadoPago } from '../src/resources/pagos/services/procesarPagoMercadoPago.service.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const intents = await PagoOnlineIntent.find({
  estado: 'aprobado',
  cobroId: { $ne: null },
  mpPaymentId: { $ne: null },
});
console.log(`Intents aprobados con cobro: ${intents.length}`);

const configByClub = new Map();
let vinculados = 0;
let yaTenian = 0;
let sinMovimiento = 0;
let errores = 0;

for (const intent of intents) {
  const movimiento = await Movimiento.findOne({
    sourceType: 'cobro',
    sourceId: intent.cobroId,
    clubId: intent.clubId,
  });
  if (!movimiento) {
    sinMovimiento++;
    console.warn(`⚠️  Sin Movimiento para intent ${intent._id} (cobroId ${intent.cobroId})`);
    continue;
  }
  if (movimiento.mercadopagoVinculos.some((v) => v.paymentId === intent.mpPaymentId)) {
    yaTenian++;
    continue;
  }

  if (!configByClub.has(intent.clubId)) {
    configByClub.set(intent.clubId, await MercadoPagoConfig.findOne({ clubId: intent.clubId, active: true }));
  }
  const config = configByClub.get(intent.clubId);
  if (!config) {
    errores++;
    console.error(`❌ Sin config de Mercado Pago para el club ${intent.clubId} (intent ${intent._id})`);
    continue;
  }

  const { ok, payment } = await obtenerPagoMercadoPago({ accessToken: config.accessToken, dataId: intent.mpPaymentId });
  if (!ok) {
    errores++;
    console.error(`❌ No se pudo obtener el pago ${intent.mpPaymentId} de Mercado Pago (intent ${intent._id})`);
    continue;
  }

  movimiento.mercadopagoVinculos.push({
    paymentId: String(payment.id),
    payerEmail: payment.payer?.email ?? '',
    monto: payment.transaction_amount,
    fecha: payment.date_approved,
    vinculadoPor: 'Sistema (backfill)',
  });
  await movimiento.save();
  vinculados++;
  console.log(`✅ Vinculado movimiento ${movimiento._id} ↔ pago MP ${payment.id}`);
}

console.log(`\nResumen: vinculados=${vinculados} ya_tenian=${yaTenian} sin_movimiento=${sinMovimiento} errores=${errores}`);

await mongoose.disconnect();
