import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Precios from '../../cuotas/models/Precios.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
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

      // Cuota social vigente (advertencia, no bloquea — solo para socios)
      if (socio) {
        const periodoActual = buildPeriodo(fecha);
        const cuotaSocial = await Cuota.findOne({
          clubId,
          socioId: socio._id,
          tipo: 'social',
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

      // Pase mensual: solo socios con Cuota de etiqueta muro_libre_mensual_socio pagada para el período
      let estadoPagoOverride = null;
      if (tipoPase === 'mensual') {
        if (!socio) {
          throw new BusinessError('El pase mensual solo está disponible para socios');
        }
        const periodoActual = buildPeriodo(fecha);
        const etiquetaMensual = await Etiqueta.findOne({
          clubId,
          uso_sistema: 'muro_libre_mensual_socio',
          active: true,
        }).lean();

        const cuotaVigente = etiquetaMensual
          ? await Cuota.findOne({
              socioId: socio._id,
              clubId,
              etiquetaId: etiquetaMensual._id,
              periodo: periodoActual,
              estado: 'pagada',
            }).session(session)
          : null;

        if (!cuotaVigente) {
          advertencias.push({
            codigo: ADVERTENCIA.PASE_MENSUAL_IMPAGO,
            mensaje: `Sin pase mensual pagado para ${periodoActual}`,
          });
        } else {
          estadoPagoOverride = 'exento';
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
          responsable: `${nombre}${apellido ? ` ${apellido}` : ''}`,
          type: 'Ingreso',
          amount: monto,
          concept: tipoPase === 'mensual' ? 'Muro libre mensual' : 'Muro libre diario',
          paymentMethod,
          formId: String(registro._id),
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

      result = { registro, movimiento };
    });

    return { ...result, advertencias };
  } finally {
    session.endSession();
  }
};

export { BusinessError };
