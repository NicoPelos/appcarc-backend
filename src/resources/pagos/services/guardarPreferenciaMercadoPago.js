import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import MercadoPagoConfig from '../models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../models/PagoOnlineIntent.js';
import { BusinessError } from './crearPreferenciaCobroMercadoPago.errors.js';

const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || 'https://raspberrypi.tail703951.ts.net';
const MP_API_BASE = 'https://api.mercadopago.com';

// Cola común a los dos flujos que generan un link de pago (staff y el propio
// socio): ambos ya resolvieron sus items e importes por su cuenta (con
// distinta confianza en el monto) y solo necesitan crear la preferencia en
// Mercado Pago con un único ítem agregado y guardar el PagoOnlineIntent.
//
// `normalizedItems` puede traer más de un socio (un tutor pagando su propia
// cuota y la de un hijo en el mismo link) — `primarySocioId` es solo el dueño
// "principal" que se guarda en el intent (campo legacy, pensado para un solo
// socio) y el que se usa como fallback de título/payer si no hay más datos.
export const crearPreferenciaYGuardarIntent = async ({
  clubId, requestedByUserId, requestedByEmail, primarySocioId, normalizedItems, totalAmount, description, payerEmail,
}) => {
  if (totalAmount <= 0) throw new BusinessError('El monto a cobrar debe ser mayor a cero');

  const config = await MercadoPagoConfig.findOne({ clubId, active: true });
  if (!config) throw new BusinessError('Este club todavía no configuró Mercado Pago');

  const socioIds = [...new Set(normalizedItems.map((item) => String(item.socioId)))];
  const socios = await Socio.find({ _id: { $in: socioIds }, clubId, active: true }).lean();
  if (socios.length !== socioIds.length) throw new BusinessError('Socio no encontrado', 404);

  const primero = socios.find((s) => String(s._id) === String(primarySocioId)) ?? socios[0];
  const titulo = socios.length === 1
    ? `Cobro ${primero.nombre} ${primero.apellido}`
    : `Cobro ${primero.nombre} ${primero.apellido} y ${socios.length - 1} más`;

  const intentId = new mongoose.Types.ObjectId();
  const externalReference = intentId.toString();

  const email = payerEmail || primero.correoElectronico;

  const preferenceBody = {
    items: [{
      title: `${titulo}${description ? ` — ${description}` : ''}`,
      quantity: 1,
      unit_price: totalAmount,
      currency_id: 'ARS',
    }],
    external_reference: externalReference,
    notification_url: `${BACKEND_PUBLIC_URL}/api/webhooks/mercadopago/${clubId}`,
    back_urls: {
      success: BACKEND_PUBLIC_URL,
      failure: BACKEND_PUBLIC_URL,
      pending: BACKEND_PUBLIC_URL,
    },
    auto_return: 'approved',
    payer: email ? { email } : undefined,
  };

  const mpResponse = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  if (!mpResponse.ok) {
    const errBody = await mpResponse.text().catch(() => '');
    console.error('Error creando preferencia en Mercado Pago:', mpResponse.status, errBody);
    throw new BusinessError('No se pudo generar el link de pago con Mercado Pago', 502);
  }

  const mpData = await mpResponse.json();

  const intent = new PagoOnlineIntent({
    _id: intentId,
    clubId,
    socioId: primarySocioId,
    requestedByUserId,
    requestedByEmail,
    items: normalizedItems,
    totalAmount,
    preferenceId: mpData.id,
    externalReference,
  });
  await intent.save();

  return { initPoint: mpData.init_point, preferenceId: mpData.id, intentId: externalReference };
};

export default crearPreferenciaYGuardarIntent;
