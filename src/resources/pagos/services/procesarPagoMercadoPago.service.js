import PagoOnlineIntent from '../models/PagoOnlineIntent.js';
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
 * Pide un pago a la API de Mercado Pago con nuestras propias credenciales.
 * Usado tanto por el webhook (dataId sacado de la notificación) como por el
 * cron de reconciliación (dataId sacado de la búsqueda por external_reference).
 */
export const obtenerPagoMercadoPago = async ({ accessToken, dataId }) => {
  const response = await fetch(`${MP_API_BASE}/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, payment: await response.json() };
};

// Un link de Checkout Pro no es de un solo uso por naturaleza — si alguien lo
// vuelve a abrir después de pagar (WhatsApp reenviado, doble clic, etc.)
// Mercado Pago deja completar el checkout de nuevo. En cuanto un pago se
// confirma aprobado, se fuerza la expiración de la preferencia (rango de
// vigencia ya vencido) para que ese link deje de aceptar pagos nuevos.
const expirarPreferenciaMercadoPago = async ({ accessToken, preferenceId }) => {
  if (!preferenceId) return;
  try {
    const ahora = new Date();
    const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);
    const response = await fetch(`${MP_API_BASE}/checkout/preferences/${preferenceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        expires: true,
        expiration_date_from: haceUnaHora.toISOString(),
        expiration_date_to: ahora.toISOString(),
      }),
    });
    if (!response.ok) {
      console.error(`No se pudo expirar la preferencia ${preferenceId} de Mercado Pago:`, response.status);
    }
  } catch (err) {
    console.error(`Error expirando la preferencia ${preferenceId} de Mercado Pago:`, err.message);
  }
};

/**
 * A partir de un pago ya obtenido de la API de Mercado Pago (con nuestro
 * propio accessToken, por lo tanto ya confiable), lo matchea contra su
 * PagoOnlineIntent y, si corresponde, registra el cobro. Compartido entre el
 * webhook/IPN (tiempo real) y el cron de reconciliación (red de seguridad).
 */
export const procesarPagoMercadoPago = async ({ clubId, payment, accessToken }) => {
  if (!payment.external_reference) {
    return { resultado: 'ignorado', motivo: 'sin_external_reference' };
  }

  const intent = await PagoOnlineIntent.findOne({ externalReference: payment.external_reference, clubId });
  if (!intent) {
    return { resultado: 'ignorado', motivo: 'intent_no_encontrado' };
  }

  const estadoNuevo = estadoFromMpStatus(payment.status);

  // Se dispara ni bien Mercado Pago confirma el pago como aprobado, sin
  // importar si después el intent resulta duplicado o hay un conflicto de
  // negocio al registrar el cobro — la plata ya se movió, así que el link no
  // tiene que seguir aceptando pagos nuevos en ningún caso.
  if (estadoNuevo === 'aprobado') {
    await expirarPreferenciaMercadoPago({ accessToken, preferenceId: intent.preferenceId });
  }

  if (estadoNuevo === 'aprobado' && Number(payment.transaction_amount) !== intent.totalAmount) {
    await PagoOnlineIntent.findOneAndUpdate(
      { _id: intent._id, estado: 'pendiente' },
      { $set: { estado: 'rechazado', mpPaymentId: String(payment.id), mpStatus: payment.status, mpStatusDetail: 'monto_no_coincide' } },
    );
    return { resultado: 'rechazado', motivo: 'monto_no_coincide', intentId: intent._id };
  }

  const updated = await PagoOnlineIntent.findOneAndUpdate(
    { _id: intent._id, estado: 'pendiente' },
    {
      $set: {
        estado: estadoNuevo,
        mpPaymentId: String(payment.id),
        mpStatus: payment.status,
        mpStatusDetail: payment.status_detail || null,
      },
    },
    { new: true },
  );

  if (!updated) {
    // Ya se había procesado este pago antes (reintento, u otro canal que llegó primero) — no-op.
    return { resultado: 'duplicado', intentId: intent._id };
  }

  if (updated.estado === 'aprobado') {
    try {
      const result = await registrarCobro({
        clubId: updated.clubId,
        user: { id: updated.requestedByUserId, email: updated.requestedByEmail },
        body: {
          paymentMethod: 'MercadoPago',
          description: `Pago online Mercado Pago (payment ${payment.id})`,
          items: itemsParaRegistrarCobro(updated),
        },
      });
      updated.cobroId = result.cobro._id;
      await updated.save();
    } catch (err) {
      // No reintentar automáticamente: si esto falla es un conflicto de negocio real
      // (ej. la cuota ya se cobró por otro medio mientras el checkout estaba abierto),
      // no algo transitorio. Queda para revisión manual.
      console.error(`Error registrando cobro para intent ${updated._id} tras pago aprobado ${payment.id}:`, err);
      return { resultado: 'error_registrar_cobro', intentId: updated._id, error: err };
    }
  }

  return { resultado: updated.estado, intentId: updated._id };
};
