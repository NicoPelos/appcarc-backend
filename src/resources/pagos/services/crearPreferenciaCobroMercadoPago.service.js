import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import MercadoPagoConfig from '../models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../models/PagoOnlineIntent.js';

const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || 'https://raspberrypi.tail703951.ts.net';
const MP_API_BASE = 'https://api.mercadopago.com';

export class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

// A diferencia del cobro manual (que puede resolver el precio vigente en el
// servidor si no viene "amount"), acá se exige un monto concreto por item:
// Mercado Pago necesita saber el total a cobrar ANTES de que exista un cobro
// real, y los items ya vienen con el monto que secretaría ajustó/confirmó en
// Registrar Cobro — no tiene sentido resolver un precio distinto acá.
const normalizeItemParaLink = (item, index, socioId) => {
  const itemSocioId = String(item?.socioId || '').trim();
  if (itemSocioId !== String(socioId)) {
    throw new BusinessError(`El item ${index + 1} no corresponde al socio indicado`);
  }

  const suscripcionId = item?.suscripcionId ? String(item.suscripcionId).trim() : null;
  const cargoPuntualId = item?.cargoPuntualId ? String(item.cargoPuntualId).trim() : null;
  const muroLibrePendiente = Boolean(item?.muroLibrePendiente);

  if (!suscripcionId && !cargoPuntualId && !muroLibrePendiente) {
    throw new BusinessError(`El item ${index + 1} debe indicar suscripcionId, cargoPuntualId o muroLibrePendiente`);
  }

  const amount = Number(item?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BusinessError(`El item ${index + 1} necesita un monto asignado para generar el link de pago`);
  }

  const periodos = Array.isArray(item?.periodos) && item.periodos.length ? item.periodos.map(String) : undefined;
  const cantidad = item?.cantidad == null ? undefined : Number(item.cantidad);

  // "amount" es el importe unitario (por período o por visita), igual que en
  // /api/cobros — el total que este item aporta a la preferencia de Mercado
  // Pago depende de cuántos períodos/visitas cubre, no es directamente "amount".
  const unidades = periodos?.length || cantidad || 1;
  const montoItem = amount * unidades;

  return {
    normalizado: {
      socioId: itemSocioId,
      suscripcionId,
      cargoPuntualId,
      muroLibrePendiente,
      periodos,
      cantidad,
      amount,
      description: String(item?.description || '').trim(),
    },
    montoItem,
  };
};

export const crearPreferenciaCobroMercadoPago = async ({
  clubId, requestedByUserId, requestedByEmail, socioId, items, description,
}) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);
  if (!socioId) throw new BusinessError('socioId es requerido');
  if (!Array.isArray(items) || !items.length) throw new BusinessError('Elegí al menos un ítem para generar el link de pago');

  const config = await MercadoPagoConfig.findOne({ clubId, active: true });
  if (!config) throw new BusinessError('Este club todavía no configuró Mercado Pago');

  const procesados = items.map((item, index) => normalizeItemParaLink(item, index, socioId));
  const normalizedItems = procesados.map((p) => p.normalizado);
  const totalAmount = procesados.reduce((total, p) => total + p.montoItem, 0);
  if (totalAmount <= 0) throw new BusinessError('El monto a cobrar debe ser mayor a cero');

  const socio = await Socio.findOne({ _id: socioId, clubId, active: true }).lean();
  if (!socio) throw new BusinessError('Socio no encontrado', 404);

  const intentId = new mongoose.Types.ObjectId();
  const externalReference = intentId.toString();

  const preferenceBody = {
    items: [{
      title: `Cobro ${socio.nombre} ${socio.apellido}${description ? ` — ${description}` : ''}`,
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
    payer: socio.correoElectronico ? { email: socio.correoElectronico } : undefined,
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
    socioId,
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

export default crearPreferenciaCobroMercadoPago;
