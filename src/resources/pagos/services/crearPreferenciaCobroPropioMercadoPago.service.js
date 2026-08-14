import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import Cuota from '../../cuotas/models/Cuota.js';
import CargoPuntual from '../../cargosPuntuales/models/CargoPuntual.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import { findPrecioVigente } from '../../cuotas/services/findPrecioVigente.service.js';
import { getSocioIdsAccesibles } from '../../vinculos/services/getSocioIdsAccesibles.service.js';
import { BusinessError } from './crearPreferenciaCobroMercadoPago.errors.js';
import { crearPreferenciaYGuardarIntent } from './guardarPreferenciaMercadoPago.js';

const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// A diferencia de RegistrarCobroScreen (staff), acá el usuario elige QUÉ pagar
// pero nunca CUÁNTO: el monto de cada item se resuelve siempre en el servidor
// (precio vigente / snapshot ya guardado), ignorando cualquier "amount" que
// pudiera venir en el body. Esto evita que alguien manipule el pedido para
// generar un link de pago por menos de lo que realmente debe.
//
// El "socioId" de cada item SÍ viene del cliente (puede ser el propio del
// usuario o uno de sus hijos vinculados), pero se valida contra los perfiles
// realmente accesibles antes de resolver nada — nunca contra lo que el
// cliente diga que es "suyo".
const normalizeItemPropio = async ({ item, index, clubId, socioId, date }) => {
  const suscripcionId = item?.suscripcionId ? String(item.suscripcionId).trim() : null;
  const cargoPuntualId = item?.cargoPuntualId ? String(item.cargoPuntualId).trim() : null;
  const muroLibrePendiente = Boolean(item?.muroLibrePendiente);

  const tipos = [suscripcionId, cargoPuntualId, muroLibrePendiente || null].filter(Boolean);
  if (tipos.length !== 1) {
    throw new BusinessError(`El item ${index + 1} debe indicar exactamente uno de suscripcionId, cargoPuntualId o muroLibrePendiente`);
  }

  if (cargoPuntualId) {
    const cargo = await CargoPuntual.findOne({ _id: cargoPuntualId, socioId, clubId, active: true }).lean();
    if (!cargo) throw new BusinessError('Cargo puntual no encontrado', 404);
    if (cargo.estado !== 'pendiente') {
      throw new BusinessError(`El cargo "${cargo.description}" ya está ${cargo.estado}`, 409);
    }

    const amount = cargo.montoEsperadoSnapshot;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BusinessError('El cargo puntual no tiene un monto válido configurado');
    }

    return {
      normalizado: {
        socioId, suscripcionId: null, cargoPuntualId, muroLibrePendiente: false, amount, description: cargo.description,
      },
      montoItem: amount,
      key: `cargo:${cargoPuntualId}`,
    };
  }

  if (muroLibrePendiente) {
    const pendientes = await Asistencia.find({
      clubId, socioId, tipo: 'muro_libre', tipoPase: 'diario', active: true, estadoPago: 'pendiente',
    }).lean();

    if (!pendientes.length) throw new BusinessError('No tenés visitas de Muro Libre pendientes de pago', 404);

    const total = pendientes.reduce((sum, a) => sum + (a.precioSugeridoSnapshot || 0), 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw new BusinessError('Las visitas pendientes no tienen un precio configurado');
    }

    return {
      normalizado: {
        socioId,
        suscripcionId: null,
        cargoPuntualId: null,
        muroLibrePendiente: true,
        cantidad: pendientes.length,
        amount: total / pendientes.length,
        description: 'Muro Libre — visitas pendientes',
      },
      montoItem: total,
      key: `murolibre:${socioId}`,
    };
  }

  const periodos = Array.isArray(item?.periodos) ? item.periodos.map((p) => String(p || '').trim()) : [];
  if (!periodos.length) throw new BusinessError(`El item ${index + 1} debe indicar al menos un período`);
  const periodoInvalido = periodos.find((p) => !PERIODO_PATTERN.test(p));
  if (periodoInvalido) throw new BusinessError(`El item ${index + 1} contiene un período inválido`);

  const suscripcion = await Suscripcion.findOne({
    _id: suscripcionId, socioId, clubId, active: true,
  }).lean();
  if (!suscripcion) throw new BusinessError('Suscripción no encontrada', 404);

  const yaPagado = await Cuota.findOne({
    clubId, socioId, suscripcionId, periodo: { $in: periodos }, estado: 'pagada', active: true,
  }).lean();
  if (yaPagado) throw new BusinessError(`El período ${yaPagado.periodo} ya está pagado`, 409);

  const etiquetaId = String(suscripcion.etiquetaId);
  const [precio, etiqueta] = await Promise.all([
    findPrecioVigente({ clubId, etiquetaId, date }),
    Etiqueta.findById(etiquetaId).lean(),
  ]);

  if (!precio || !Number.isFinite(precio.monto) || precio.monto <= 0) {
    throw new BusinessError('No hay un precio vigente configurado para esta cuota');
  }

  return {
    normalizado: {
      socioId,
      suscripcionId,
      cargoPuntualId: null,
      muroLibrePendiente: false,
      periodos,
      amount: precio.monto,
      description: etiqueta?.nombre || '',
    },
    montoItem: precio.monto * periodos.length,
    key: `suscripcion:${socioId}:${suscripcionId}`,
  };
};

export const crearPreferenciaCobroPropioMercadoPago = async ({
  clubId, requestedByUserId, requestedByEmail, items,
}) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);
  if (!requestedByUserId) throw new BusinessError('No se pudo determinar el usuario', 401);
  if (!Array.isArray(items) || !items.length) throw new BusinessError('Elegí al menos un ítem para generar el link de pago');

  const { ownSocioId, accessibleIds } = await getSocioIdsAccesibles({ clubId, userId: requestedByUserId });
  if (!accessibleIds.size) throw new BusinessError('No se pudo determinar el socio', 401);

  const date = new Date();
  const procesados = [];
  for (let index = 0; index < items.length; index += 1) {
    const socioId = String(items[index]?.socioId || '').trim();
    if (!accessibleIds.has(socioId)) {
      throw new BusinessError(`El item ${index + 1} no corresponde a un perfil accesible`, 403);
    }

    procesados.push(await normalizeItemPropio({
      item: items[index], index, clubId, socioId, date,
    }));
  }

  const claveRepetida = procesados.find((p, index) => procesados.findIndex((q) => q.key === p.key) !== index);
  if (claveRepetida) throw new BusinessError('El pedido incluye un ítem duplicado');

  const normalizedItems = procesados.map((p) => p.normalizado);
  const totalAmount = procesados.reduce((total, p) => total + p.montoItem, 0);

  return crearPreferenciaYGuardarIntent({
    clubId,
    requestedByUserId,
    requestedByEmail,
    primarySocioId: ownSocioId ?? normalizedItems[0].socioId,
    normalizedItems,
    totalAmount,
    description: '',
    payerEmail: requestedByEmail,
  });
};

export { BusinessError };
export default crearPreferenciaCobroPropioMercadoPago;
