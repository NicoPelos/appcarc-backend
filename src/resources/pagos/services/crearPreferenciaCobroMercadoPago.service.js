import { BusinessError } from './crearPreferenciaCobroMercadoPago.errors.js';
import { crearPreferenciaYGuardarIntent } from './guardarPreferenciaMercadoPago.js';

export { BusinessError };

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

  const procesados = items.map((item, index) => normalizeItemParaLink(item, index, socioId));
  const normalizedItems = procesados.map((p) => p.normalizado);
  const totalAmount = procesados.reduce((total, p) => total + p.montoItem, 0);

  return crearPreferenciaYGuardarIntent({
    clubId, requestedByUserId, requestedByEmail, primarySocioId: socioId, normalizedItems, totalAmount, description,
  });
};

export default crearPreferenciaCobroMercadoPago;
