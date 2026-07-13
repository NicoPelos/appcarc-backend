import mongoose from 'mongoose';
import { restoreFields } from './shared.js';

// El resource 'Asistencia' en el audit log solo se usa para muro libre (ver
// createMuroLibre/updateMuroLibre/deleteMuroLibre.handler.js) — el check-in de
// escuelita no loguea auditoría. Cuando el pase queda "pagado" se crea/edita
// en paralelo un Movimiento (registro.movimientoId), así que revertir estos
// cambios también tiene que sincronizar ese movimiento.
export async function revertirMuroLibre(log, { actor, session }) {
  const Asistencia = mongoose.model('Asistencia');
  const Movimiento = mongoose.model('Movimiento');

  if (log.action === 'CREATE') {
    await Asistencia.findByIdAndUpdate(
      log.resourceId,
      { $set: { active: false, updatedBy: actor } },
      { session },
    );

    if (log.after?.movimientoId) {
      await Movimiento.findByIdAndUpdate(
        log.after.movimientoId,
        { active: false, updatedBy: actor },
        { session },
      );
    }
    return;
  }

  if (log.action === 'UPDATE' || log.action === 'DELETE') {
    if (!log.before) {
      const error = new Error('No hay snapshot anterior para revertir');
      error.status = 422;
      throw error;
    }

    const restored = restoreFields(log.before);
    restored.updatedBy = actor;
    await Asistencia.findByIdAndUpdate(log.resourceId, { $set: restored }, { session });

    const movimientoId = log.before.movimientoId;
    if (!movimientoId) return;

    if (log.action === 'DELETE') {
      await Movimiento.findByIdAndUpdate(
        movimientoId,
        { active: true, updatedBy: actor },
        { session },
      );
      return;
    }

    // UPDATE: updateMuroLibre.handler.js mantiene monto/formaPago del
    // registro siempre igual a amount/paymentMethod del movimiento vinculado,
    // así que el snapshot "before" de la Asistencia alcanza para saber a qué
    // valor volver el movimiento.
    const camposMovimiento = {};
    if (log.before.monto !== undefined) camposMovimiento.amount = log.before.monto;
    if (log.before.formaPago !== undefined) camposMovimiento.paymentMethod = log.before.formaPago;
    if (Object.keys(camposMovimiento).length) {
      camposMovimiento.updatedBy = actor;
      await Movimiento.findByIdAndUpdate(movimientoId, { $set: camposMovimiento }, { session });
    }
  }
}

export default revertirMuroLibre;
