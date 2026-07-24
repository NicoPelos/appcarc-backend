import mongoose from 'mongoose';
import Suscripcion from '../models/Suscripcion.js';
import Socio from '../../socios/models/Socio.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Plan from '../../planes/models/Plan.js';
import { logAudit } from '../../audit/services/audit.service.js';

const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const periodoAnterior = (periodo) => {
  const [year, month] = periodo.split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Un socio solo puede tener una suscripción activa por vez para el mismo
// tipo de plan (social / escuelita / muro_libre) — o, si se asigna sin plan
// (etiquetaId suelto), para la misma etiqueta. Antes de crear la nueva, cierra
// cualquier otra que siga vigente para que no queden dos activas en simultáneo
// (pasó con Kurti, Viola y otros socios al reasignar un plan sin cerrar el anterior).
const cerrarSuscripcionesPrevias = async ({ clubId, socioId, tipo, etiquetaId, fechaDesde, req, session }) => {
  const activas = await Suscripcion.find({ clubId, socioId, active: true, fechaHasta: null })
    .populate('planId', 'tipo')
    .session(session);

  const aCerrar = activas.filter((s) => (
    tipo ? s.planId?.tipo === tipo : String(s.etiquetaId) === String(etiquetaId)
  ));

  for (const s of aCerrar) {
    const before = s.toObject();
    s.fechaHasta = periodoAnterior(fechaDesde);
    s.updatedBy = req.user.email || req.user.id;
    await s.save({ session });
    logAudit({ clubId, req, action: 'UPDATE', resource: 'Suscripcion', resourceId: s._id, before, after: s.toObject() });
  }
};

/**
 * @openapi
 * /api/suscripciones:
 *   post:
 *     summary: Crear suscripción (admin o secretaria)
 *     tags: [Suscripciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [socioId, fechaDesde]
 *             properties:
 *               socioId:
 *                 type: string
 *               planId:
 *                 type: string
 *                 description: ID del Plan. Si se provee, etiquetaId se resuelve automáticamente del plan.
 *               etiquetaId:
 *                 type: string
 *                 description: ID de la Etiqueta. Requerido si no se provee planId.
 *               fechaDesde:
 *                 type: string
 *                 example: "2026-01"
 *                 description: Período de inicio en formato YYYY-MM
 *               fechaHasta:
 *                 type: string
 *                 example: "2026-12"
 *                 description: Período de fin en formato YYYY-MM (opcional)
 *     responses:
 *       201:
 *         description: Suscripción creada
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Socio o etiqueta no encontrada
 *       500:
 *         description: Error al crear suscripción
 */
export const createSuscripcionHandler = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { socioId, planId, etiquetaId: etiquetaIdBody, fechaDesde, fechaHasta } = req.body;

    if (!socioId) {
      return res.status(400).json({ message: 'socioId es requerido' });
    }
    if (!planId && !etiquetaIdBody) {
      return res.status(400).json({ message: 'planId o etiquetaId es requerido' });
    }
    if (!fechaDesde) {
      return res.status(400).json({ message: 'fechaDesde es requerido' });
    }
    if (!PERIODO_PATTERN.test(fechaDesde)) {
      return res.status(400).json({ message: 'fechaDesde debe tener formato YYYY-MM' });
    }
    if (fechaHasta !== undefined && fechaHasta !== null && !PERIODO_PATTERN.test(fechaHasta)) {
      return res.status(400).json({ message: 'fechaHasta debe tener formato YYYY-MM' });
    }

    const socio = await Socio.findOne({ _id: socioId, clubId: req.user.clubId });
    if (!socio) {
      return res.status(404).json({ message: 'Socio no encontrado' });
    }

    let etiquetaId = etiquetaIdBody;
    let planDoc = null;

    if (planId) {
      planDoc = await Plan.findOne({ _id: planId, clubId: req.user.clubId, active: true });
      if (!planDoc) return res.status(404).json({ message: 'Plan no encontrado' });
      etiquetaId = planDoc.etiquetaId;
    } else {
      const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId: req.user.clubId, active: true });
      if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });
    }

    let suscripcion;
    await session.withTransaction(async () => {
      await cerrarSuscripcionesPrevias({
        clubId: req.user.clubId,
        socioId,
        tipo: planDoc?.tipo ?? null,
        etiquetaId,
        fechaDesde,
        req,
        session,
      });

      // Puede existir una Suscripcion inactiva (soft-delete) para el mismo
      // período/etiqueta — el índice único no libera el slot con active:false,
      // así que la reactivamos en vez de intentar crear una nueva y chocar.
      const existente = await Suscripcion.findOne({ clubId: req.user.clubId, socioId, etiquetaId, fechaDesde }).session(session);

      if (existente) {
        const before = existente.toObject();
        existente.active = true;
        existente.planId = planDoc?._id ?? null;
        existente.fechaHasta = fechaHasta ?? null;
        existente.exento = Boolean(planDoc?.noGeneraDeuda);
        existente.updatedBy = req.user.email || req.user.id;
        await existente.save({ session });
        logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Suscripcion', resourceId: existente._id, before, after: existente.toObject() });
        suscripcion = existente;
        return;
      }

      suscripcion = new Suscripcion({
        clubId: req.user.clubId,
        socioId,
        planId: planDoc?._id ?? null,
        etiquetaId,
        fechaDesde,
        fechaHasta: fechaHasta ?? null,
        exento: Boolean(planDoc?.noGeneraDeuda),
        createdBy: req.user.email || req.user.id,
        updatedBy: req.user.email || req.user.id,
      });

      await suscripcion.save({ session });
      logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Suscripcion', resourceId: suscripcion._id, before: null, after: suscripcion.toObject() });
    });

    return res.status(201).json(suscripcion);
  } catch (error) {
    console.error('Error creando suscripción:', error);
    return res.status(500).json({ message: 'Error al crear suscripción' });
  } finally {
    session.endSession();
  }
};

export default createSuscripcionHandler;
