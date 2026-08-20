import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Precios from '../../cuotas/models/Precios.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import { ADVERTENCIA } from '../../../constants/advertenciaCodes.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];
const VALID_TIPO_PASE = ['diario', 'mensual'];

const USO_SISTEMA_BY_TIPO = {
  diario: {
    socio: 'muro_libre_diario_socio',
    noSocio: 'muro_libre_diario_no_socio',
  },
  mensual: {
    socio: 'muro_libre_mensual_socio',
    noSocio: 'muro_libre_mensual_no_socio',
  },
};

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const buildPeriodo = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const findPrecioVigenteByUsoSistema = async ({ clubId, uso_sistema, date, session = null }) => {
  const etiqueta = await Etiqueta.findOne({ clubId, uso_sistema, active: true }).lean();
  if (!etiqueta) return null;

  const query = Precios.findOne({
    clubId,
    etiquetaId: etiqueta._id,
    active: true,
    vigenteDesde: { $lte: date },
    $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: date } }],
  }).sort({ vigenteDesde: -1 });

  return session ? query.session(session) : query;
};

export const registrarMuroLibre = async ({ clubId, user, body, scannedBy = null, checkinMethod = 'MANUAL', advertencias = [] }) => {
  if (!clubId) {
    throw new BusinessError('No se pudo determinar el club del usuario', 401);
  }

  const tipoPase = String(body?.tipoPase || '').trim().toLowerCase();
  if (!VALID_TIPO_PASE.includes(tipoPase)) {
    throw new BusinessError('El tipo de pase debe ser diario o mensual');
  }

  const fecha = body?.fecha ? new Date(body.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) {
    throw new BusinessError('La fecha de muro libre es inválida');
  }

  const session = await mongoose.startSession();
  try {
    let result = null;

    await session.withTransaction(async () => {
      let socio = null;
      const socioId = String(body?.socioId || '').trim();
      if (socioId) {
        socio = await Socio.findOne({ _id: socioId, clubId, active: true }).session(session);
        if (!socio) {
          throw new BusinessError('El socio no existe, está inactivo o pertenece a otro club', 404);
        }
      }

      const esSocio = Boolean(socio || body?.esSocio === true);
      const nombre = String(body?.nombre || socio?.nombre || '').trim();
      const apellido = String(body?.apellido || socio?.apellido || '').trim();
      const dni = String(body?.dni || socio?.dni || '').trim();

      if (!nombre) {
        throw new BusinessError('El nombre es obligatorio');
      }

      // Verificar asistencia duplicada en el mismo día (solo socios, bloqueo duro)
      if (socio) {
        const OFFSET_MS = -3 * 60 * 60 * 1000;
        const localFecha = new Date(fecha.getTime() + OFFSET_MS);
        const startLocal = new Date(localFecha); startLocal.setUTCHours(0, 0, 0, 0);
        const endLocal = new Date(localFecha); endLocal.setUTCHours(23, 59, 59, 999);
        const startUTC = new Date(startLocal.getTime() - OFFSET_MS);
        const endUTC = new Date(endLocal.getTime() - OFFSET_MS);

        const existente = await Asistencia.findOne({
          clubId,
          socioId: socio._id,
          tipo: 'muro_libre',
          active: true,
          fecha: { $gte: startUTC, $lte: endUTC },
        }).session(session).lean();

        if (existente) {
          throw new BusinessError(`${nombre} ${apellido} ya registró asistencia en muro libre hoy`, 409);
        }
      }

      // Un socio con pase mensual activo no puede anotarse como diario —
      // bloqueo duro, no solo una advertencia. Pasó varias veces que quedaba
      // mal clasificado y había que corregirlo a mano en la base porque
      // encima el endpoint de edición no permite cambiar el tipoPase (ver
      // updateMuroLibre.handler.js).
      if (socio && tipoPase === 'diario') {
        const etiquetaMensualCheck = await Etiqueta.findOne({
          clubId,
          uso_sistema: 'muro_libre_mensual_socio',
          active: true,
        }).lean();
        const suscripcionMensualActiva = etiquetaMensualCheck && await Suscripcion.findOne({
          clubId,
          socioId: socio._id,
          etiquetaId: etiquetaMensualCheck._id,
          active: true,
        }).session(session).lean();

        if (suscripcionMensualActiva) {
          throw new BusinessError(`${nombre} ${apellido} ya tiene un pase mensual activo — registrá el check-in como mensual, no diario`);
        }
      }

      // Cuota social vigente (advertencia, no bloquea — solo para socios)
      if (socio) {
        const periodoActual = buildPeriodo(fecha);
        const etiquetaSocial = await Etiqueta.findOne({ clubId, uso_sistema: 'cuota_social', active: true }).lean();
        const cuotaSocial = etiquetaSocial && await Cuota.findOne({
          clubId,
          socioId: socio._id,
          etiquetaId: etiquetaSocial._id,
          periodo: periodoActual,
          estado: 'pagada',
        }).session(session).lean();

        if (!cuotaSocial) {
          advertencias.push({
            codigo: ADVERTENCIA.CUOTA_SOCIAL_IMPAGA,
            mensaje: `Sin cuota social pagada para ${periodoActual}`,
          });
        }
      }

      // Pase mensual: requiere una Suscripcion real a la etiqueta muro_libre_mensual_socio.
      // Si el socio todavía no está suscripto, se lo suscribe en este mismo check-in.
      let estadoPagoOverride = null;
      let etiquetaMensual = null;
      let suscripcionMensual = null;
      let periodoMensual = null;
      let cuotaMensualVigente = null;

      if (tipoPase === 'mensual') {
        if (!socio) {
          throw new BusinessError('El pase mensual solo está disponible para socios');
        }

        periodoMensual = buildPeriodo(fecha);
        etiquetaMensual = await Etiqueta.findOne({
          clubId,
          uso_sistema: 'muro_libre_mensual_socio',
          active: true,
        }).lean();

        if (!etiquetaMensual) {
          throw new BusinessError('No hay una etiqueta de Muro Libre Mensual configurada para este club');
        }

        suscripcionMensual = await Suscripcion.findOne({
          clubId,
          socioId: socio._id,
          etiquetaId: etiquetaMensual._id,
          active: true,
        }).session(session);

        cuotaMensualVigente = await Cuota.findOne({
          socioId: socio._id,
          clubId,
          etiquetaId: etiquetaMensual._id,
          periodo: periodoMensual,
          estado: 'pagada',
        }).session(session);

        if (cuotaMensualVigente) {
          estadoPagoOverride = 'exento';
        } else if (String(body?.estadoPago || 'pendiente').trim().toLowerCase() !== 'pagado') {
          advertencias.push({
            codigo: ADVERTENCIA.PASE_MENSUAL_IMPAGO,
            mensaje: `Sin pase mensual pagado para ${periodoMensual}`,
          });
        }
      }

      const estadoPago = estadoPagoOverride ?? String(body?.estadoPago || 'pendiente').trim().toLowerCase();
      if (!['pagado', 'pendiente', 'exento'].includes(estadoPago)) {
        throw new BusinessError('El estado de pago debe ser pagado, pendiente o exento');
      }

      const paymentMethod = String(body?.paymentMethod || body?.formaPago || '').trim();
      if (estadoPago === 'pagado' && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        throw new BusinessError('La forma de pago debe ser Efectivo o Transferencia');
      }

      const uso_sistema = USO_SISTEMA_BY_TIPO[tipoPase][esSocio ? 'socio' : 'noSocio'];
      const precio = await findPrecioVigenteByUsoSistema({ clubId, uso_sistema, date: fecha, session });
      const precioSugeridoSnapshot = precio?.monto ?? null;
      const monto = body?.amount == null && body?.monto == null
        ? precioSugeridoSnapshot
        : Number(body.amount ?? body.monto);

      if (estadoPago === 'pagado' && (!Number.isFinite(monto) || monto <= 0)) {
        throw new BusinessError('El pago necesita un monto o un precio vigente configurado');
      }

      if (estadoPago !== 'pagado' && body?.amount != null && (!Number.isFinite(monto) || monto < 0)) {
        throw new BusinessError('El monto debe ser válido');
      }

      const actor = user?.email || user?.id;
      const registro = new Asistencia({
        clubId,
        tipo: 'muro_libre',
        socioId: socio?._id ?? null,
        scannedBy: body?.scannedBy || null,
        checkinMethod: body?.checkinMethod || 'MANUAL',
        nombre,
        apellido,
        dni,
        esSocio,
        tipoPase,
        estadoPago,
        monto: estadoPago === 'pagado' ? monto : 0,
        precioSugeridoSnapshot,
        uso_sistema,
        fecha,
        periodo: tipoPase === 'mensual' ? buildPeriodo(fecha) : '',
        formaPago: estadoPago === 'pagado' ? paymentMethod : 'Sin pago',
        advertencias,
        observaciones: String(body?.observaciones || '').trim(),
        enviarComprobanteWp: Boolean(body?.enviarComprobanteWp),
        createdBy: actor,
        updatedBy: actor,
      });
      await registro.save({ session });

      let movimiento = null;
      if (estadoPago === 'pagado') {
        movimiento = new Movimiento({
          clubId,
          userId: user.id,
          responsable: actor,
          socioId: socio?._id ?? null,
          socioNombre: `${nombre}${apellido ? ` ${apellido}` : ''}`,
          type: 'Ingreso',
          amount: monto,
          concept: tipoPase === 'mensual' ? 'Muro libre mensual' : 'Muro libre diario',
          paymentMethod,
          description: `${esSocio ? 'Socio' : 'No socio'} - ${tipoPase}`,
          date: fecha,
          sourceType: 'muro_libre',
          sourceId: registro._id,
          sourceModel: 'Asistencia',
          createdBy: actor,
          updatedBy: actor,
        });
        await movimiento.save({ session });

        registro.movimientoId = movimiento._id;
        registro.updatedBy = actor;
        await registro.save({ session });
      }

      // Alta de la suscripción y de la cuota real del pase mensual, para que
      // quede reflejado en /api/socios/:id/deuda y no se vuelva a pedir pago
      // si el socio entra otra vez en el mismo período.
      if (tipoPase === 'mensual' && !cuotaMensualVigente) {
        if (!suscripcionMensual) {
          suscripcionMensual = new Suscripcion({
            clubId,
            socioId: socio._id,
            etiquetaId: etiquetaMensual._id,
            fechaDesde: periodoMensual,
            active: true,
            createdBy: actor,
            updatedBy: actor,
          });
          await suscripcionMensual.save({ session });
        }

        if (estadoPago === 'pagado') {
          const cuotaMensual = new Cuota({
            clubId,
            socioId: socio._id,
            suscripcionId: suscripcionMensual._id,
            etiquetaId: etiquetaMensual._id,
            periodo: periodoMensual,
            estado: 'pagada',
            montoEsperadoSnapshot: precioSugeridoSnapshot ?? monto,
            montoPagadoSnapshot: monto,
            precioSugeridoSnapshot,
            paymentMethod,
            fechaPago: fecha,
            movimientoId: movimiento?._id ?? null,
            createdBy: actor,
            updatedBy: actor,
          });
          await cuotaMensual.save({ session });
        }
      }

      result = { registro, movimiento };
    });

    return { ...result, advertencias };
  } finally {
    session.endSession();
  }
};

export { BusinessError };
