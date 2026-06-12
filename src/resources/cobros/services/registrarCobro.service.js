import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Precios from '../../cuotas/models/Precios.js';
import Cobro from '../models/Cobro.js';
import Movimiento from '../../movimientos/models/Movimiento.js';

const VALID_TIPOS = ['social', 'escuelita'];
const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];
const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PRECIO_CODIGO_BY_TIPO = {
  social: 'cuota_social',
  escuelita: 'cuota_escuelita',
};

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const normalizeTipo = (tipo) => String(tipo || '').trim().toLowerCase();

const addMonthsToPeriodo = (periodo, monthsToAdd) => {
  const [year, month] = periodo.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
};

const getPeriodosFromItem = (item, index) => {
  if (Array.isArray(item?.periodos) && item.periodos.length) {
    const periodos = item.periodos.map((periodo) => String(periodo || '').trim());
    const invalid = periodos.find((periodo) => !PERIODO_PATTERN.test(periodo));

    if (invalid) {
      throw new BusinessError(`El item ${index + 1} contiene un período inválido`);
    }

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

const findPrecioVigente = async ({ clubId, codigo, date }) => {
  return Precios.findOne({
    clubId,
    codigo,
    active: true,
    vigenteDesde: { $lte: date },
    $or: [
      { vigenteHasta: null },
      { vigenteHasta: { $gte: date } },
    ],
  }).sort({ vigenteDesde: -1 });
};

const normalizeItem = async ({ item, index, clubId, date, precioCache }) => {
  const socioId = String(item?.socioId || '').trim();
  const tipo = normalizeTipo(item?.tipo);
  const periodos = getPeriodosFromItem(item, index);
  const amount = item?.amount == null ? null : Number(item.amount);
  let precioSugeridoSnapshot = item?.precioSugeridoSnapshot == null
    ? null
    : Number(item.precioSugeridoSnapshot);

  if (!socioId) {
    throw new BusinessError(`El item ${index + 1} debe indicar socioId`);
  }

  if (!VALID_TIPOS.includes(tipo)) {
    throw new BusinessError(`El item ${index + 1} tiene un tipo de cuota inválido`);
  }

  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    throw new BusinessError(`El item ${index + 1} debe tener un importe mayor que cero`);
  }

  if (precioSugeridoSnapshot !== null && (!Number.isFinite(precioSugeridoSnapshot) || precioSugeridoSnapshot < 0)) {
    throw new BusinessError(`El item ${index + 1} tiene un precio sugerido inválido`);
  }

  const precioCodigo = PRECIO_CODIGO_BY_TIPO[tipo];

  if (precioSugeridoSnapshot === null) {
    if (!precioCache.has(precioCodigo)) {
      precioCache.set(precioCodigo, await findPrecioVigente({ clubId, codigo: precioCodigo, date }));
    }

    const precio = precioCache.get(precioCodigo);
    precioSugeridoSnapshot = precio?.monto ?? null;
  }

  const unitAmount = amount ?? precioSugeridoSnapshot;
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    throw new BusinessError(`El item ${index + 1} necesita un importe o un precio vigente configurado`);
  }

  const description = String(item?.description || '').trim();

  return periodos.map((periodo) => ({
    socioId,
    tipo,
    periodo,
    amount: unitAmount,
    precioSugeridoSnapshot,
    precioCodigo,
    description,
  }));
};

const buildItemKey = (item) => `${item.socioId}:${item.tipo}:${item.periodo}`;

const buildCobroConcept = (items) => {
  const tipos = new Set(items.map((item) => item.tipo));
  if (tipos.size === 1 && tipos.has('social')) return 'Cobro de cuotas sociales';
  if (tipos.size === 1 && tipos.has('escuelita')) return 'Cobro de cuotas de escuelita';
  return 'Cobro de cuotas';
};

export const registrarCobro = async ({ clubId, user, body }) => {
  if (!clubId) {
    throw new BusinessError('No se pudo determinar el club del usuario', 401);
  }

  const date = body?.date ? new Date(body.date) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new BusinessError('La fecha del cobro es inválida');
  }

  const precioCache = new Map();
  const items = Array.isArray(body?.items)
    ? (await Promise.all(body.items.map((item, index) => normalizeItem({
      item,
      index,
      clubId,
      date,
      precioCache,
    })))).flat()
    : [];

  if (!items.length) {
    throw new BusinessError('El cobro debe incluir al menos una cuota');
  }

  const duplicated = items.find((item, index) => (
    items.findIndex((candidate) => buildItemKey(candidate) === buildItemKey(item)) !== index
  ));

  if (duplicated) {
    throw new BusinessError(`El cobro incluye una cuota duplicada para socio ${duplicated.socioId}, ${duplicated.tipo}, ${duplicated.periodo}`);
  }

  const responsable = String(body?.responsable || user?.email || user?.id || '').trim();
  if (!responsable) {
    throw new BusinessError('El responsable del cobro es obligatorio');
  }

  const paymentMethod = String(body?.paymentMethod || '').trim();
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new BusinessError('La forma de pago debe ser Efectivo o Transferencia');
  }

  const description = String(body?.description || '').trim();

  const socioIds = [...new Set(items.map((item) => item.socioId))];
  const socios = await Socio.find({ _id: { $in: socioIds }, clubId, active: true });
  const sociosEncontrados = new Set(socios.map((socio) => String(socio._id)));
  const socioFaltante = socioIds.find((socioId) => !sociosEncontrados.has(socioId));

  if (socioFaltante) {
    throw new BusinessError(`El socio ${socioFaltante} no existe, está inactivo o pertenece a otro club`, 404);
  }

  const cuotaFilters = items.map((item) => ({
    clubId,
    socioId: item.socioId,
    tipo: item.tipo,
    periodo: item.periodo,
    active: true,
  }));

  const existingCuotas = await Cuota.find({ $or: cuotaFilters });
  const cuotaPagada = existingCuotas.find((cuota) => cuota.estado === 'pagada');

  if (cuotaPagada) {
    throw new BusinessError(`La cuota ${cuotaPagada.tipo} ${cuotaPagada.periodo} del socio ${cuotaPagada.socioId} ya está pagada`, 409);
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
  await cobro.save();

  const movimiento = new Movimiento({
    clubId,
    userId: user.id,
    responsable,
    type: 'Ingreso',
    amount: totalAmount,
    concept: buildCobroConcept(items),
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
  await movimiento.save();

  const cuotas = [];
  for (const item of items) {
    const existing = existingCuotas.find((cuota) => (
      String(cuota.socioId) === item.socioId
      && cuota.tipo === item.tipo
      && cuota.periodo === item.periodo
    ));

    const cuotaData = {
      clubId,
      socioId: item.socioId,
      tipo: item.tipo,
      periodo: item.periodo,
      estado: 'pagada',
      montoEsperadoSnapshot: item.precioSugeridoSnapshot ?? item.amount,
      montoPagadoSnapshot: item.amount,
      precioSugeridoSnapshot: item.precioSugeridoSnapshot,
      precioCodigo: item.precioCodigo,
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
      await existing.save();
      cuotas.push(existing);
    } else {
      const cuota = new Cuota({
        ...cuotaData,
        createdBy: actor,
      });
      await cuota.save();
      cuotas.push(cuota);
    }
  }

  cobro.movimientoId = movimiento._id;
  cobro.updatedBy = actor;
  await cobro.save();

  return { cobro, movimiento, cuotas };
};

export { BusinessError };
