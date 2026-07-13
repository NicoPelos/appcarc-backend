import mongoose from 'mongoose';
import { restoreFields } from './shared.js';

// Un Cobro siempre nace con un Movimiento e impacta Cuotas asociadas (ver
// registrarCobro.service.js). anularCobro.handler.js es la única forma de
// "borrarlo" (soft-delete con cascada). Por eso revertir su creación equivale
// a re-aplicar esa misma cascada de anulación, y revertir su anulación
// equivale a deshacerla.
export async function revertirCobro(log, { actor, session }) {
  const Cobro = mongoose.model('Cobro');
  const Movimiento = mongoose.model('Movimiento');
  const Cuota = mongoose.model('Cuota');

  if (log.action === 'CREATE') {
    const cobro = await Cobro.findOne({ _id: log.resourceId, clubId: log.clubId }).session(session);
    if (!cobro || !cobro.active) return;

    cobro.active = false;
    cobro.anuladoAt = new Date();
    cobro.anuladoPor = actor;
    cobro.motivoAnulacion = 'Anulado al revertir la creación del cobro';
    cobro.updatedBy = actor;
    await cobro.save({ session });

    if (cobro.movimientoId) {
      await Movimiento.findByIdAndUpdate(
        cobro.movimientoId,
        { active: false, updatedBy: actor },
        { session },
      );
    }

    await Cuota.updateMany(
      { cobroId: cobro._id, clubId: log.clubId },
      { estado: 'anulada', updatedBy: actor },
      { session },
    );
    return;
  }

  if (log.action === 'DELETE') {
    if (!log.before) {
      const error = new Error('No hay snapshot anterior para revertir');
      error.status = 422;
      throw error;
    }

    const restored = restoreFields(log.before);
    restored.updatedBy = actor;
    await Cobro.findByIdAndUpdate(log.resourceId, { $set: restored }, { session });

    if (log.before.movimientoId) {
      await Movimiento.findByIdAndUpdate(
        log.before.movimientoId,
        { active: true, updatedBy: actor },
        { session },
      );
    }

    await Cuota.updateMany(
      { cobroId: log.resourceId, clubId: log.clubId, estado: 'anulada' },
      { estado: 'pagada', updatedBy: actor },
      { session },
    );
  }
}

export default revertirCobro;
