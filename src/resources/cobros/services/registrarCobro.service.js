import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Precios from '../../cuotas/models/Precios.js';
import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import Cobro from '../models/Cobro.js';
import Movimiento from '../../movimientos/models/Movimiento.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];
const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const addMonthsToPeriodo = (periodo, monthsToAdd) => {
  const [year, month] = periodo.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getPeriodosFromItem = (item, index) => {
  if (Array.isArray(item?.periodos) && item.periodos.length) {
    const periodos = item.periodos.map((p) => String(p || '').trim());
    const invalid = periodos.find((p) => !PERIODO_PATTERN.test(p));
    if (invalid) throw new BusinessError(`El item ${index + 1} contiene un período inválido`);
    return periodos;
  }

  const periodoInicial = String(item?.periodoDesde || item?.periodo || '').trim();
  if (!PERIODO_PATTERN.test(periodoInicial)) {
    throw new BusinessError(`El item ${index + 1} debe usar periodo con formato YYYY-MM`);
  }

  const cantidad = item?.cantidad == null ? 1 : Number(item.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new BusinessError(`El item ${index + 1} debe tener una cantidad entera mayor que cero`);
  }

  return Array.from({ length: cantidad }, (_, offset) => addMonthsToPeriodo(periodoInicial, offset));
};

const findPrecioVigente = async ({ clubId, etiquetaId, date, session = null }) => {
  const query = Precios.findOne({
    clubId,
    etiquetaId,
    active: true,
    vigenteDesde: { $lte: date },
    $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: date } }],
  }).sort({ vigenteDesde: -1 });

  return session ? query.session(session) : query;
};

const normalizeItem = async ({ item, index, clubId, date, precioCache, session = null }) => {
  const socioId = String(item?.socioId || '').trim();
  const suscripcionId = String(item?.suscripcionId || '').trim();
  const periodos = getPeriodosFromItem(item, index);
  const amount = item?.amount == null ? null : Number(item.amount);
  let precioSugeridoSnapshot = item?.precioSugeridoSnapshot == null
    ? null
    : Number(item.precioSugeridoSnapshot);

  if (!socioId) throw new BusinessError(`El item ${index + 1} debe indicar socioId`);
  if (!suscripcionId) throw new BusinessError(`El item ${index + 1} debe indicar suscripcionId`);

  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    throw new BusinessError(`El item ${index + 1} debe tener un importe mayor que cero`);
  }

  if (precioSugeridoSnapshot !== null && (!Number.isFinite(precioSugeridoSnapshot) || precioSugeridoSnapshot < 0)) {
    throw new BusinessError(`El item ${index + 1} tiene un precio sugerido inválido`);
  }

  // Buscar suscripcion para obtener etiquetaId
  const suscripcion = await Suscripcion.findOne({
    _id: suscripcionId,
    socioId,
    clubId,
    active: true,
  }).lean();

  if (!suscripcion) {
    throw new BusinessError(`Suscripción ${suscripcionId} no encontrada para el socio ${socioId}`, 404);
  }

  const etiquetaId = String(suscripcion.etiquetaId);

  if (precioSugeridoSnapshot === null && amount === null) {
    if (!precioCache.has(etiquetaId)) {
      precioCache.set(etiquetaId, await findPrecioVigente({ clubId, etiquetaId, date, session }));
    }
    const precio = precioCache.get(etiquetaId);
    precioSugeridoSnapshot = precio?.monto ?? null;
  }

  const unitAmount = amount ?? precioSugeridoSnapshot;
  if (!Number.isFinite(unitAmount) || unitAmount < 0) {
    throw new BusinessError(`El item ${index + 1} necesita un importe o un precio vigente configurado`);
  }

  const description = String(item?.description || '').trim();

  return periodos.map((periodo) => ({
    socioId,
    suscripcionId,
    etiquetaId,
    periodo,
    amount: unitAmount,
    precioSugeridoSnapshot,
    description,
  }));
};

const buildItemKey = (item) => `${item.socioId}:${item.suscripcionId}:${item.periodo}`;

export const registrarCobro = async ({ clubId, user, body }) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);

  const date = body?.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new BusinessError('La fecha del cobro es inválida');

  const session = await mongoose.startSession();
  try {
    let result = null;

    await session.withTransaction(async () => {
      const precioCache = new Map();
      const items = Array.isArray(body?.items)
        ? (await Promise.all(body.items.map((item, index) => normalizeItem({
          item, index, clubId, date, precioCache, session,
        })))).flat()
        : [];

      if (!items.length) throw new BusinessError('El cobro debe incluir al menos una cuota');

      const duplicated = items.find((item, index) => (
        items.findIndex((c) => buildItemKey(c) === buildItemKey(item)) !== index
      ));
      if (duplicated) {
        throw new BusinessError(`El cobro incluye una cuota duplicada para socio ${duplicated.socioId}, suscripción ${duplicated.suscripcionId}, ${duplicated.periodo}`);
      }

      const responsable = String(user?.email || user?.id || '').trim();
      if (!responsable) throw new BusinessError('No se pudo determinar el responsable del cobro');

      const paymentMethod = String(body?.paymentMethod || '').trim();
      if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        throw new BusinessError('La forma de pago debe ser Efectivo o Transferencia');
      }

      const description = String(body?.description || '').trim();

      const socioIds = [...new Set(items.map((item) => item.socioId))];
      const socios = await Socio.find({ _id: { $in: socioIds }, clubId, active: true }).session(session);
      const sociosEncontrados = new Set(socios.map((s) => String(s._id)));
      const socioFaltante = socioIds.find((id) => !sociosEncontrados.has(id));
      if (socioFaltante) {
        throw new BusinessError(`El socio ${socioFaltante} no existe, está inactivo o pertenece a otro club`, 404);
      }

      const cuotaFilters = items.map((item) => ({
        clubId,
        socioId: item.socioId,
        suscripcionId: item.suscripcionId,
        periodo: item.periodo,
        active: true,
      }));

      const existingCuotas = await Cuota.find({ $or: cuotaFilters }).session(session);
      const cuotaPagada = existingCuotas.find((c) => c.estado === 'pagada');
      if (cuotaPagada) {
        throw new BusinessError(`La cuota ${cuotaPagada.periodo} de la suscripción ${cuotaPagada.suscripcionId} del socio ${cuotaPagada.socioId} ya está pagada`, 409);
      }

      const totalAmount = items.reduce((total, item) => total + item.amount, 0);
      const actor = user?.email || user?.id;

      const cobro = new Cobro({
        clubId,
        responsable,
        paymentMethod,
        totalAmount,
        description,
        date,
        items,
        createdBy: actor,
        updatedBy: actor,
      });
      await cobro.save({ session });

      const movimiento = new Movimiento({
        clubId,
        userId: user.id,
        responsable,
        type: 'Ingreso',
        amount: totalAmount,
        concept: 'Cobro de cuotas',
        paymentMethod,
        formId: String(cobro._id),
        description: description || `Cobro con ${items.length} cuota${items.length === 1 ? '' : 's'}`,
        date,
        sourceType: 'cobro',
        sourceId: cobro._id,
        sourceModel: 'Cobro',
        createdBy: actor,
        updatedBy: actor,
      });
      await movimiento.save({ session });

      const cuotas = [];
      for (const item of items) {
        const existing = existingCuotas.find((c) => (
          String(c.socioId) === item.socioId
          && String(c.suscripcionId) === item.suscripcionId
          && c.periodo === item.periodo
        ));

        const cuotaData = {
          clubId,
          socioId: item.socioId,
          suscripcionId: item.suscripcionId,
          etiquetaId: item.etiquetaId,
          periodo: item.periodo,
          estado: 'pagada',
          montoEsperadoSnapshot: item.precioSugeridoSnapshot ?? item.amount,
          montoPagadoSnapshot: item.amount,
          precioSugeridoSnapshot: item.precioSugeridoSnapshot,
          cobroId: cobro._id,
          movimientoId: movimiento._id,
          fechaPago: date,
          paymentMethod,
          description: item.description,
          updatedBy: actor,
          active: true,
        };

        if (existing) {
          Object.assign(existing, cuotaData);
          await existing.save({ session });
          cuotas.push(existing);
        } else {
          const cuota = new Cuota({ ...cuotaData, createdBy: actor });
          await cuota.save({ session });
          cuotas.push(cuota);
        }
      }

      cobro.movimientoId = movimiento._id;
      cobro.updatedBy = actor;
      await cobro.save({ session });

      result = { cobro, movimiento, cuotas };
    });

    return result;
  } finally {
    session.endSession();
  }
};

export { BusinessError };
