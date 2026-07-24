import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import Plan from '../../planes/models/Plan.js';
import { logAudit } from '../../audit/services/audit.service.js';

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const currentPeriodo = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const previousPeriodo = () => {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Está "activa este período" si no tiene fechaHasta o si fechaHasta todavía no pasó.
const vigenteEsteMes = (suscripcion, periodo) => (
  !suscripcion.fechaHasta || suscripcion.fechaHasta >= periodo
);

// Asignar/quitar el plan de escuelita de un alumno (Escuelita.planId) tiene que
// mantener en sincro la Suscripcion que efectivamente genera el cobro — antes
// eran dos pasos manuales y desconectados (ver appcarc-backend#12: Fidel, Alma,
// Benicio y Malena terminaron con deuda duplicada o facturada bajo el plan
// equivocado por esto mismo).
export async function sincronizarSuscripcionEscuelita({ clubId, socioId, planId, req, session }) {
  const periodoActual = currentPeriodo();
  const periodoAnterior = previousPeriodo();
  const actor = req.user.email || req.user.id;

  let plan = null;
  if (planId) {
    plan = await Plan.findOne({ _id: planId, clubId, active: true, tipo: 'escuelita' }).session(session);
    if (!plan) {
      throw new BusinessError('El plan indicado no existe, está inactivo o no es de tipo escuelita', 400);
    }
  }

  const activas = await Suscripcion.find({ clubId, socioId, active: true })
    .populate('planId', 'tipo')
    .session(session);

  const escuelitaActivas = activas.filter(
    (s) => s.planId?.tipo === 'escuelita' && vigenteEsteMes(s, periodoActual),
  );

  const yaCorrecta = plan
    && escuelitaActivas.find((s) => String(s.etiquetaId) === String(plan.etiquetaId));

  for (const s of escuelitaActivas) {
    if (yaCorrecta && String(s._id) === String(yaCorrecta._id)) continue;

    const before = s.toObject();
    if (s.fechaDesde >= periodoActual) {
      // Se creó este mismo período y nunca llegó a estar vigente de verdad
      // (ej. se eligió el plan equivocado y se corrigió al toque) — desactivarla
      // en vez de cerrarla con una fecha anterior a su propio inicio.
      s.active = false;
    } else {
      s.fechaHasta = periodoAnterior;
    }
    s.updatedBy = actor;
    await s.save({ session });
    logAudit({ clubId, req, action: 'UPDATE', resource: 'Suscripcion', resourceId: s._id, before, after: s.toObject() });
  }

  if (!plan) return;

  if (yaCorrecta) {
    if (String(yaCorrecta.planId?._id ?? yaCorrecta.planId) !== String(plan._id)) {
      const before = yaCorrecta.toObject();
      yaCorrecta.planId = plan._id;
      yaCorrecta.updatedBy = actor;
      await yaCorrecta.save({ session });
      logAudit({ clubId, req, action: 'UPDATE', resource: 'Suscripcion', resourceId: yaCorrecta._id, before, after: yaCorrecta.toObject() });
    }
    return;
  }

  // Puede existir una Suscripcion inactiva (soft-delete) para el mismo
  // período/etiqueta — el índice único no libera el slot con active:false,
  // así que la reactivamos en vez de intentar crear una nueva y chocar.
  const existente = await Suscripcion.findOne({
    clubId, socioId, etiquetaId: plan.etiquetaId, fechaDesde: periodoActual,
  }).session(session);

  if (existente) {
    const before = existente.toObject();
    existente.active = true;
    existente.planId = plan._id;
    existente.fechaHasta = null;
    existente.updatedBy = actor;
    await existente.save({ session });
    logAudit({ clubId, req, action: 'UPDATE', resource: 'Suscripcion', resourceId: existente._id, before, after: existente.toObject() });
    return;
  }

  const nueva = new Suscripcion({
    clubId,
    socioId,
    planId: plan._id,
    etiquetaId: plan.etiquetaId,
    fechaDesde: periodoActual,
    createdBy: actor,
    updatedBy: actor,
  });
  await nueva.save({ session });
  logAudit({ clubId, req, action: 'CREATE', resource: 'Suscripcion', resourceId: nueva._id, before: null, after: nueva.toObject() });
}

export { BusinessError };
export default sincronizarSuscripcionEscuelita;
