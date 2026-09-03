import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import CargoPuntual from '../../cargosPuntuales/models/CargoPuntual.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Cobro from '../models/Cobro.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import { findPrecioVigente } from '../../cuotas/services/findPrecioVigente.service.js';

// 'MercadoPago' solo lo asigna el webhook al confirmar un pago online — nunca
// lo elige un humano a mano (RegistrarCobroScreen solo ofrece Efectivo/Transferencia).
const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'MercadoPago'];
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

const buildPeriodoFromFecha = (fecha) => {
  const d = new Date(fecha);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Tope defensivo: cinco años de cuotas mensuales por item. Sin esto, un
// `cantidad` (o `periodos`) desmedido hace que Array.from intente crear un
// array gigante dentro de la transacción de Mongo (DoS de bajo esfuerzo).
const MAX_PERIODOS_POR_ITEM = 60;

// Registrar Cobro permite adelantar meses futuros de una suscripción abierta
// (pagar por adelantado) — calcularDeuda no los expone como deuda, pero acá
// no hay ninguna razón de negocio para rechazarlos. Sí conviene un tope
// generoso para atajar errores de carga (ej. tipear "2030-01" por accidente),
// no para limitar el adelanto legítimo.
const MAX_MESES_ADELANTO = 24;

const getPeriodosFromItem = (item, index, hoyPeriodo) => {
  let periodos;

  if (Array.isArray(item?.periodos) && item.periodos.length) {
    if (item.periodos.length > MAX_PERIODOS_POR_ITEM) {
      throw new BusinessError(`El item ${index + 1} no puede tener más de ${MAX_PERIODOS_POR_ITEM} períodos`);
    }
    periodos = item.periodos.map((p) => String(p || '').trim());
    const invalid = periodos.find((p) => !PERIODO_PATTERN.test(p));
    if (invalid) throw new BusinessError(`El item ${index + 1} contiene un período inválido`);
  } else {
    const periodoInicial = String(item?.periodoDesde || item?.periodo || '').trim();
    if (!PERIODO_PATTERN.test(periodoInicial)) {
      throw new BusinessError(`El item ${index + 1} debe usar periodo con formato YYYY-MM`);
    }

    const cantidad = item?.cantidad == null ? 1 : Number(item.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_PERIODOS_POR_ITEM) {
      throw new BusinessError(`El item ${index + 1} debe tener una cantidad entera entre 1 y ${MAX_PERIODOS_POR_ITEM}`);
    }

    periodos = Array.from({ length: cantidad }, (_, offset) => addMonthsToPeriodo(periodoInicial, offset));
  }

  const tope = addMonthsToPeriodo(hoyPeriodo, MAX_MESES_ADELANTO);
  const muyLejos = periodos.find((p) => p > tope);
  if (muyLejos) {
    throw new BusinessError(`El item ${index + 1} tiene un período (${muyLejos}) demasiado lejano — máximo ${MAX_MESES_ADELANTO} meses de adelanto`);
  }

  return periodos;
};

const normalizeItem = async ({ item, index, clubId, date, precioCache, session = null }) => {
  const socioId = String(item?.socioId || '').trim();
  const suscripcionId = String(item?.suscripcionId || '').trim();
  const cargoPuntualId = String(item?.cargoPuntualId || '').trim();
  const muroLibrePendiente = Boolean(item?.muroLibrePendiente);
  const amount = item?.amount == null ? null : Number(item.amount);
  let precioSugeridoSnapshot = item?.precioSugeridoSnapshot == null
    ? null
    : Number(item.precioSugeridoSnapshot);

  if (!socioId) throw new BusinessError(`El item ${index + 1} debe indicar socioId`);
  if (!suscripcionId && !cargoPuntualId && !muroLibrePendiente) {
    throw new BusinessError(`El item ${index + 1} debe indicar suscripcionId, cargoPuntualId o muroLibrePendiente`);
  }

  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    throw new BusinessError(`El item ${index + 1} debe tener un importe mayor que cero`);
  }

  if (precioSugeridoSnapshot !== null && (!Number.isFinite(precioSugeridoSnapshot) || precioSugeridoSnapshot < 0)) {
    throw new BusinessError(`El item ${index + 1} tiene un precio sugerido inválido`);
  }

  if (cargoPuntualId) {
    const cargo = await CargoPuntual.findOne({ _id: cargoPuntualId, socioId, clubId, active: true }).lean();
    if (!cargo) {
      throw new BusinessError(`Cargo puntual ${cargoPuntualId} no encontrado para el socio ${socioId}`, 404);
    }
    if (cargo.estado !== 'pendiente') {
      throw new BusinessError(`El cargo puntual "${cargo.description}" del socio ${socioId} ya está ${cargo.estado}`, 409);
    }

    const unitAmount = amount ?? cargo.montoEsperadoSnapshot;
    if (!Number.isFinite(unitAmount) || unitAmount < 0) {
      throw new BusinessError(`El item ${index + 1} necesita un importe válido`);
    }

    return [{
      socioId,
      suscripcionId: null,
      cargoPuntualId,
      etiquetaId: String(cargo.etiquetaId),
      periodo: cargo.periodo,
      amount: unitAmount,
      precioSugeridoSnapshot: precioSugeridoSnapshot ?? cargo.precioSugeridoSnapshot,
      description: String(item?.description || '').trim() || cargo.description,
    }];
  }

  if (muroLibrePendiente) {
    const pendientes = await Asistencia.find({
      clubId,
      socioId,
      tipo: 'muro_libre',
      tipoPase: 'diario',
      active: true,
      estadoPago: 'pendiente',
    }).sort({ fecha: 1 }).session(session);

    if (!pendientes.length) {
      throw new BusinessError(`El socio ${socioId} no tiene visitas de Muro Libre pendientes`, 404);
    }

    // asistenciaIds: visitas puntuales elegidas a mano (ej. "quiero pagar
    // estas 2, no las 4 más viejas") — si no vienen, se mantiene el
    // comportamiento viejo de "las cantidad más viejas primero", para no
    // romper clientes que todavía mandan solo cantidad.
    let seleccionadas;
    if (Array.isArray(item?.asistenciaIds)) {
      const idsPedidos = item.asistenciaIds.map(String);
      const idsSet = new Set(idsPedidos);
      seleccionadas = pendientes.filter((a) => idsSet.has(String(a._id)));
      if (seleccionadas.length !== idsSet.size) {
        throw new BusinessError(`El item ${index + 1} incluye visitas de Muro Libre que ya no están pendientes`, 404);
      }
    } else {
      const cantidad = item?.cantidad == null ? pendientes.length : Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new BusinessError(`El item ${index + 1} debe tener una cantidad entera mayor que cero`);
      }
      seleccionadas = pendientes.slice(0, Math.min(cantidad, pendientes.length));
    }

    const usoSistema = seleccionadas[0].esSocio ? 'muro_libre_diario_socio' : 'muro_libre_diario_no_socio';
    const etiqueta = await Etiqueta.findOne({ clubId, uso_sistema: usoSistema, active: true }).session(session).lean();
    if (!etiqueta) {
      throw new BusinessError('No hay una etiqueta de Muro Libre Diario configurada para este club');
    }

    return seleccionadas.map((asistencia) => {
      const visitAmount = amount ?? asistencia.precioSugeridoSnapshot;
      if (!Number.isFinite(visitAmount) || visitAmount < 0) {
        throw new BusinessError(`El item ${index + 1} necesita un importe o un precio vigente configurado`);
      }

      return {
        socioId,
        suscripcionId: null,
        cargoPuntualId: null,
        asistenciaId: String(asistencia._id),
        etiquetaId: String(etiqueta._id),
        periodo: buildPeriodoFromFecha(asistencia.fecha),
        amount: visitAmount,
        precioSugeridoSnapshot: asistencia.precioSugeridoSnapshot,
        description: String(item?.description || '').trim() || 'Muro Libre - visita pendiente',
      };
    });
  }

  const periodos = getPeriodosFromItem(item, index, buildPeriodoFromFecha(date));

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

  // Cuando el front manda `amount`, es el TOTAL a repartir entre todos los
  // períodos de este item (ver RegistrarCobroScreen: "Monto total" ya viene
  // multiplicado por la cantidad de meses) — hay que dividirlo entre la
  // cantidad de períodos para obtener el importe por mes. Si no vino `amount`,
  // `unitAmount` ya es el precio vigente por mes y se aplica tal cual.
  const amountPorPeriodo = amount != null ? amount / periodos.length : unitAmount;

  return periodos.map((periodo) => ({
    socioId,
    suscripcionId,
    cargoPuntualId: null,
    etiquetaId,
    periodo,
    amount: amountPorPeriodo,
    precioSugeridoSnapshot,
    description,
  }));
};

const buildItemKey = (item) => {
  if (item.cargoPuntualId) return `cargo:${item.cargoPuntualId}`;
  if (item.asistenciaId) return `asistencia:${item.asistenciaId}`;
  return `${item.socioId}:${item.suscripcionId}:${item.periodo}`;
};

export const registrarCobro = async ({ clubId, user, body }) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);

  const date = body?.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new BusinessError('La fecha del cobro es inválida');
  // Compara por día calendario en horario argentino (UTC-3), no por timestamp exacto:
  // de lo contrario "hoy" se rechazaría como futuro mientras el mediodía AR aún no
  // ocurrió en UTC (el servidor corre en UTC).
  const diaAR = (d) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (diaAR(date) > diaAR(new Date())) throw new BusinessError('La fecha del cobro no puede ser futura');

  const session = await mongoose.startSession();
  try {
    let result = null;

    await session.withTransaction(async () => {
      const precioCache = new Map();
      // Secuencial, no Promise.all: normalizeItem hace queries con .session(session)
      // y Mongo no soporta más de una operación en vuelo por ClientSession a la vez.
      const items = [];
      if (Array.isArray(body?.items)) {
        for (let index = 0; index < body.items.length; index++) {
          const normalized = await normalizeItem({
            item: body.items[index], index, clubId, date, precioCache, session,
          });
          items.push(...normalized);
        }
      }

      if (!items.length) throw new BusinessError('El cobro debe incluir al menos un ítem');

      const duplicated = items.find((item, index) => (
        items.findIndex((c) => buildItemKey(c) === buildItemKey(item)) !== index
      ));
      if (duplicated) {
        throw new BusinessError(duplicated.cargoPuntualId
          ? `El cobro incluye el cargo puntual ${duplicated.cargoPuntualId} duplicado`
          : `El cobro incluye una cuota duplicada para socio ${duplicated.socioId}, suscripción ${duplicated.suscripcionId}, ${duplicated.periodo}`);
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

      const itemsSuscripcion = items.filter((item) => item.suscripcionId);
      const itemsCargoPuntual = items.filter((item) => item.cargoPuntualId);
      const itemsAsistencia = items.filter((item) => item.asistenciaId);

      const cuotaFilters = itemsSuscripcion.map((item) => ({
        clubId,
        socioId: item.socioId,
        suscripcionId: item.suscripcionId,
        periodo: item.periodo,
        active: true,
      }));

      const existingCuotas = cuotaFilters.length
        ? await Cuota.find({ $or: cuotaFilters }).session(session)
        : [];
      const cuotaPagada = existingCuotas.find((c) => c.estado === 'pagada');
      if (cuotaPagada) {
        throw new BusinessError(`La cuota ${cuotaPagada.periodo} de la suscripción ${cuotaPagada.suscripcionId} del socio ${cuotaPagada.socioId} ya está pagada`, 409);
      }

      const cargosPuntualesDb = itemsCargoPuntual.length
        ? await CargoPuntual.find({
          _id: { $in: itemsCargoPuntual.map((item) => item.cargoPuntualId) },
          clubId,
          active: true,
        }).session(session)
        : [];
      const cargoYaResuelto = cargosPuntualesDb.find((c) => c.estado !== 'pendiente');
      if (cargoYaResuelto) {
        throw new BusinessError(`El cargo puntual "${cargoYaResuelto.description}" ya está ${cargoYaResuelto.estado}`, 409);
      }

      const asistenciasDb = itemsAsistencia.length
        ? await Asistencia.find({
          _id: { $in: itemsAsistencia.map((item) => item.asistenciaId) },
          clubId,
          active: true,
        }).session(session)
        : [];
      const asistenciaYaResuelta = asistenciasDb.find((a) => a.estadoPago !== 'pendiente');
      if (asistenciaYaResuelta) {
        throw new BusinessError(`La visita de Muro Libre del ${asistenciaYaResuelta.fecha.toISOString().slice(0, 10)} del socio ${asistenciaYaResuelta.socioId} ya está ${asistenciaYaResuelta.estadoPago}`, 409);
      }

      const totalAmount = items.reduce((total, item) => total + item.amount, 0);
      const actor = user?.email || user?.id;

      const socioUnico = socioIds.length === 1
        ? socios.find((s) => String(s._id) === socioIds[0])
        : null;

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
        socioId: socioUnico?._id ?? null,
        socioNombre: socioUnico ? `${socioUnico.nombre}${socioUnico.apellido ? ` ${socioUnico.apellido}` : ''}` : '',
        type: 'Ingreso',
        amount: totalAmount,
        concept: 'Cobro de cuotas',
        paymentMethod,
        description: description || `Cobro con ${items.length} ítem${items.length === 1 ? '' : 's'}`,
        date,
        sourceType: 'cobro',
        sourceId: cobro._id,
        sourceModel: 'Cobro',
        createdBy: actor,
        updatedBy: actor,
      });
      await movimiento.save({ session });

      const cuotas = [];
      for (const item of itemsSuscripcion) {
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

      const cargosPuntuales = [];
      for (const item of itemsCargoPuntual) {
        const cargo = cargosPuntualesDb.find((c) => String(c._id) === item.cargoPuntualId);
        cargo.estado = 'pagada';
        cargo.montoPagadoSnapshot = item.amount;
        cargo.paymentMethod = paymentMethod;
        cargo.fechaPago = date;
        cargo.cobroId = cobro._id;
        cargo.movimientoId = movimiento._id;
        cargo.updatedBy = actor;
        await cargo.save({ session });
        cargosPuntuales.push(cargo);
      }

      const asistencias = [];
      for (const item of itemsAsistencia) {
        const asistencia = asistenciasDb.find((a) => String(a._id) === item.asistenciaId);
        asistencia.estadoPago = 'pagado';
        asistencia.monto = item.amount;
        asistencia.formaPago = paymentMethod;
        asistencia.cobroId = cobro._id;
        asistencia.movimientoId = movimiento._id;
        asistencia.updatedBy = actor;
        await asistencia.save({ session });
        asistencias.push(asistencia);
      }

      cobro.movimientoId = movimiento._id;
      cobro.updatedBy = actor;
      await cobro.save({ session });

      result = { cobro, movimiento, cuotas, cargosPuntuales, asistencias };
    });

    return result;
  } finally {
    session.endSession();
  }
};

export { BusinessError };
