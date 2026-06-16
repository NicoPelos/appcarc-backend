import mongoose from 'mongoose';
import Socio from '../../socios/models/Socio.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Precios from '../../cuotas/models/Precios.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import Asistencia from '../../asistencias/models/Asistencia.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];
const VALID_TIPO_PASE = ['diario', 'mensual'];

const PRECIO_CODIGO_BY_TIPO = {
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

const findPrecioVigente = ({ clubId, codigo, date, session = null }) => {
  const query = Precios.findOne({
    clubId,
    codigo,
    active: true,
    vigenteDesde: { $lte: date },
    $or: [
      { vigenteHasta: null },
      { vigenteHasta: { $gte: date } },
    ],
  }).sort({ vigenteDesde: -1 });

  return session ? query.session(session) : query;
};

export const registrarMuroLibre = async ({ clubId, user, body, scannedBy = null, checkinMethod = 'MANUAL' }) => {
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

      // Pase mensual: solo socios con Cuota muro_libre pagada para el período
      let estadoPagoOverride = null;
      if (tipoPase === 'mensual') {
        if (!socio) {
          throw new BusinessError('El pase mensual solo está disponible para socios');
        }
        const periodoActual = buildPeriodo(fecha);
        const cuotaVigente = await Cuota.findOne({
          socioId: socio._id,
          clubId,
          tipo: 'muro_libre',
          periodo: periodoActual,
          estado: 'pagada',
        }).session(session);

        if (!cuotaVigente) {
          throw new BusinessError(
            `El socio no tiene pase mensual pagado para ${periodoActual}. Comprá el pase a través del cobro de cuotas.`,
            402,
          );
        }
        estadoPagoOverride = 'exento';
      }

      const estadoPago = estadoPagoOverride ?? String(body?.estadoPago || 'pendiente').trim().toLowerCase();
      if (!['pagado', 'pendiente', 'exento'].includes(estadoPago)) {
        throw new BusinessError('El estado de pago debe ser pagado, pendiente o exento');
      }

      const paymentMethod = String(body?.paymentMethod || body?.formaPago || '').trim();
      if (estadoPago === 'pagado' && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        throw new BusinessError('La forma de pago debe ser Efectivo o Transferencia');
      }

      const precioCodigo = PRECIO_CODIGO_BY_TIPO[tipoPase][esSocio ? 'socio' : 'noSocio'];
      const precio = await findPrecioVigente({ clubId, codigo: precioCodigo, date: fecha, session });
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
        precioCodigo,
        fecha,
        periodo: tipoPase === 'mensual' ? buildPeriodo(fecha) : '',
        formaPago: estadoPago === 'pagado' ? paymentMethod : 'Sin pago',
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

    return result;
  } finally {
    session.endSession();
  }
};

export { BusinessError };
