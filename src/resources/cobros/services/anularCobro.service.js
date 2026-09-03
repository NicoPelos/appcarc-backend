import Cuota from '../../cuotas/models/Cuota.js';
import CargoPuntual from '../../cargosPuntuales/models/CargoPuntual.js';
import Asistencia from '../../asistencias/models/Asistencia.js';

// Anula un Cobro y revierte TODO lo que registrarCobro.service.js pudo haber
// marcado como pagado con él: Cuota, CargoPuntual y Asistencia (muro libre) —
// las tres entidades que un mismo Cobro puede saldar según el tipo de item
// (ver registrarCobro.service.js:397-422). Compartido entre anularCobro.handler.js
// (POST /cobros/:id/anular) y deleteMovimiento.handler.js (borrar el
// movimiento asociado) — antes cada uno tenía su propia copia parcial de esta
// lógica y quedaron desincronizadas: deleteMovimiento nunca llegó a revertir
// CargoPuntual ni Asistencia, dejándolos pagados para siempre sin respaldo
// (appcarc-backend#137).
export const anularCobroConTrazabilidad = async ({ cobro, clubId, actor, motivo, session }) => {
  cobro.active = false;
  cobro.anuladoAt = new Date();
  cobro.anuladoPor = actor;
  cobro.motivoAnulacion = motivo || null;
  cobro.updatedBy = actor;
  await cobro.save({ session });

  await Cuota.updateMany(
    { cobroId: cobro._id, clubId },
    { estado: 'anulada', updatedBy: actor },
    { session },
  );

  await CargoPuntual.updateMany(
    { cobroId: cobro._id, clubId },
    {
      estado: 'pendiente',
      montoPagadoSnapshot: 0,
      paymentMethod: null,
      fechaPago: null,
      cobroId: null,
      movimientoId: null,
      updatedBy: actor,
    },
    { session },
  );

  await Asistencia.updateMany(
    { cobroId: cobro._id, clubId },
    {
      estadoPago: 'pendiente',
      monto: 0,
      formaPago: 'Sin pago',
      cobroId: null,
      movimientoId: null,
      updatedBy: actor,
    },
    { session },
  );
};

export default anularCobroConTrazabilidad;
