import Suscripcion from '../models/Suscripcion.js';
import Socio from '../../socios/models/Socio.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Plan from '../../planes/models/Plan.js';
import { logAudit } from '../../audit/services/audit.service.js';

const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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
 *               exento:
 *                 type: boolean
 *                 description: Si es true, esta suscripción no genera deuda (ej. Socio Honorario). Se fuerza a true automáticamente si el Plan tiene noGeneraDeuda.
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
  try {
    const { socioId, planId, etiquetaId: etiquetaIdBody, fechaDesde, fechaHasta, exento } = req.body;

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

    const suscripcion = new Suscripcion({
      clubId: req.user.clubId,
      socioId,
      planId: planDoc?._id ?? null,
      etiquetaId,
      fechaDesde,
      fechaHasta: fechaHasta ?? null,
      exento: exento === true || planDoc?.noGeneraDeuda === true,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await suscripcion.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Suscripcion', resourceId: suscripcion._id, before: null, after: suscripcion.toObject() });
    return res.status(201).json(suscripcion);
  } catch (error) {
    console.error('Error creando suscripción:', error);
    return res.status(500).json({ message: 'Error al crear suscripción' });
  }
};

export default createSuscripcionHandler;
