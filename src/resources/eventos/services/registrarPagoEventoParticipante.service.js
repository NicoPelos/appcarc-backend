import mongoose from 'mongoose';
import Evento from '../models/Evento.js';
import EventoParticipante from '../models/EventoParticipante.js';
import Movimiento from '../../movimientos/models/Movimiento.js';

export class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

// Mismo criterio que registrarCobro.service.js: compara por día calendario
// argentino (UTC-3), no por timestamp exacto, para no rechazar "hoy" como
// futuro mientras el mediodía AR todavía no ocurrió en UTC.
const diaAR = (d) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Registra el pago (total o seña) de un participante de un Evento —
// equivalente de registrarCobro.service.js para CargoPuntual (appcarc-backend#168),
// pero sin pasar por Cobro: crea el Movimiento directo (socioId: null cuando
// el participante no es socio, que Movimiento ya soporta) porque
// Cobro.items[].socioId es obligatorio y no tiene sentido para alguien sin
// ficha de socio — ver el porqué completo en EventoParticipante.js.
//
// `esPagoParcial` es un flag EXPLÍCITO, nunca inferido comparando `monto`
// contra el esperado (appcarc-backend#168: cualquier monto arriba o abajo
// del esperado sigue siendo válido como ajuste de precio si no se manda el
// flag — separar ambas ideas fue un requisito no negociable de esa vez).
export const registrarPagoEventoParticipante = async ({
  clubId, user, eventoId, participanteId, monto, paymentMethod, esPagoParcial, date: dateInput,
}) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);
  if (!mongoose.Types.ObjectId.isValid(eventoId) || !mongoose.Types.ObjectId.isValid(participanteId)) {
    throw new BusinessError('ID inválido');
  }

  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) throw new BusinessError('El monto debe ser mayor que cero');
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new BusinessError(`paymentMethod debe ser: ${VALID_PAYMENT_METHODS.join(', ')}`);
  }

  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) throw new BusinessError('La fecha del pago es inválida');
  if (diaAR(date) > diaAR(new Date())) throw new BusinessError('La fecha del pago no puede ser futura');

  const responsable = String(user?.email || user?.id || '').trim();
  if (!responsable) throw new BusinessError('No se pudo determinar el responsable del pago');

  const session = await mongoose.startSession();
  try {
    let result = null;

    await session.withTransaction(async () => {
      const evento = await Evento.findOne({ _id: eventoId, clubId, active: true }).session(session);
      if (!evento) throw new BusinessError('Evento no encontrado', 404);
      if (evento.estado === 'cerrado') throw new BusinessError('El evento está cerrado, no se pueden registrar pagos', 409);

      const participante = await EventoParticipante.findOne({ _id: participanteId, eventoId, clubId, active: true }).session(session);
      if (!participante) throw new BusinessError('Participante no encontrado', 404);
      if (!['pendiente', 'parcial'].includes(participante.estado)) {
        throw new BusinessError(`El participante ya está ${participante.estado}`, 409);
      }

      const movimiento = new Movimiento({
        clubId,
        userId: user.id,
        responsable,
        socioId: participante.socioId,
        socioNombre: `${participante.nombre}${participante.apellido ? ` ${participante.apellido}` : ''}`.trim(),
        type: 'Ingreso',
        amount: montoNum,
        concept: `Evento: ${evento.nombre}`,
        categoria: evento.categoria,
        paymentMethod,
        sourceType: 'evento_participante',
        sourceId: participante._id,
        sourceModel: 'EventoParticipante',
        // appcarc-backend#180: seteado directo (no solo derivable vía
        // sourceId -> EventoParticipante -> eventoId) para que el resumen
        // económico del evento (#181) sea un solo Movimiento.find({eventoId}).
        eventoId: evento._id,
        date,
        createdBy: responsable,
        updatedBy: responsable,
      });
      await movimiento.save({ session });

      participante.pagos.push({ monto: montoNum, fecha: date, paymentMethod, movimientoId: movimiento._id });
      participante.montoPagadoSnapshot = (participante.montoPagadoSnapshot || 0) + montoNum;
      const quedaSaldo = Boolean(esPagoParcial) && participante.montoPagadoSnapshot < participante.montoEsperadoSnapshot;
      participante.estado = quedaSaldo ? 'parcial' : 'pagada';
      participante.updatedBy = responsable;
      await participante.save({ session });

      result = { participante, movimiento };
    });

    return result;
  } finally {
    session.endSession();
  }
};

export default registrarPagoEventoParticipante;
