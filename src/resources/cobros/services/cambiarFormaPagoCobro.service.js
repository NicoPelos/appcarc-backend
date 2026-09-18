import mongoose from 'mongoose';
import Cobro from '../models/Cobro.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import { anularCobroConTrazabilidad } from './anularCobro.service.js';
import { registrarCobro, BusinessError } from './registrarCobro.service.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

// Único camino para corregir la forma de pago de un Cobro ya registrado — el
// Movimiento no se puede editar directo (updateMovimiento.handler.js lo
// bloquea a propósito, desincronizaría de la Cuota real que ya quedó con el
// medio de pago viejo). Automatiza lo que hasta ahora había que hacer a mano
// en dos pasos (anular el cobro + volver a cargarlo desde Registrar Cobro),
// reusando anularCobroConTrazabilidad y registrarCobro tal cual — nada de
// lógica de negocio nueva.
//
// Restringido a cobros de solo cuotas (ningún item con cargoPuntualId ni
// asistenciaId): esos otros tipos de item tienen estado propio en su propio
// modelo (esPagoParcial, pagos[] con cobroId/movimientoId) que Cobro.items no
// guarda completo — replayarlos acá podría perder si el pago original era
// "a cuenta" en vez de saldar el total (appcarc-backend#168). Para esos casos
// seguir usando anular + Registrar Cobro por separado.
export const cambiarFormaPagoCobro = async ({ clubId, user, cobroId, paymentMethod }) => {
  if (!clubId) throw new BusinessError('No se pudo determinar el club del usuario', 401);
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new BusinessError('La forma de pago debe ser Efectivo o Transferencia');
  }

  const cobroPrevio = await Cobro.findOne({ _id: cobroId, clubId, active: true }).lean();
  if (!cobroPrevio) throw new BusinessError('Cobro no encontrado', 404);

  if (cobroPrevio.paymentMethod === paymentMethod) {
    throw new BusinessError(`El cobro ya está registrado como ${paymentMethod}`);
  }

  const itemNoSoportado = cobroPrevio.items.find((item) => item.cargoPuntualId || item.asistenciaId);
  if (itemNoSoportado) {
    throw new BusinessError('Este cobro incluye un cargo puntual o una visita de Muro Libre — cambiar la forma de pago automáticamente solo está soportado para cobros de cuotas. Anulalo y volvé a cargarlo desde Registrar Cobro.');
  }

  if (cobroPrevio.movimientoId) {
    const movimiento = await Movimiento.findOne({ _id: cobroPrevio.movimientoId, clubId }).lean();
    if (movimiento?.mercadopagoVinculos?.length > 0) {
      throw new BusinessError('Este movimiento tiene pagos de Mercado Pago vinculados — desvinculalos primero.');
    }
  }

  const actor = user?.email || user?.id;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const cobro = await Cobro.findOne({ _id: cobroId, clubId, active: true }).session(session);
      if (!cobro) throw new BusinessError('Cobro no encontrado', 404);

      if (cobro.movimientoId) {
        await Movimiento.findByIdAndUpdate(
          cobro.movimientoId,
          { active: false, updatedBy: actor },
          { session },
        );
      }

      await anularCobroConTrazabilidad({
        cobro,
        clubId,
        actor,
        motivo: `Corrección de forma de pago (${cobroPrevio.paymentMethod} → ${paymentMethod})`,
        session,
      });
    });
  } finally {
    session.endSession();
  }

  // Un item por período (mismo shape que ya arma Cobro.items) con `periodos`
  // de un solo elemento y su `amount` exacto — evita que registrarCobro
  // recalcule contra el precio vigente actual (puede haber cambiado desde el
  // cobro original) o redistribuya el monto entre períodos.
  const items = cobroPrevio.items.map((item) => ({
    socioId: String(item.socioId),
    suscripcionId: String(item.suscripcionId),
    periodos: [item.periodo],
    amount: item.amount,
    ...(item.precioSugeridoSnapshot != null ? { precioSugeridoSnapshot: item.precioSugeridoSnapshot } : {}),
    ...(item.description ? { description: item.description } : {}),
  }));

  return registrarCobro({
    clubId,
    user,
    body: {
      paymentMethod,
      date: cobroPrevio.date,
      description: cobroPrevio.description || undefined,
      items,
    },
  });
};

export { BusinessError };
export default cambiarFormaPagoCobro;
