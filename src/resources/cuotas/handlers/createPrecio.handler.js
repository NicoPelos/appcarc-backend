import mongoose from 'mongoose';
import Precios from '../models/Precios.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import { logAudit } from '../../audit/services/audit.service.js';
import { resolverVigenciaPrecio, BusinessError, RequiereConfirmacionError } from '../services/resolverVigenciaPrecio.service.js';

/**
 * @openapi
 * /api/precios:
 *   post:
 *     summary: Crear registro de precio histórico para una etiqueta (solo admin)
 *     tags: [Precios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [etiquetaId, nombre, unidad, monto]
 *             properties:
 *               etiquetaId:
 *                 type: string
 *                 description: ID de la etiqueta a la que pertenece este precio
 *               nombre:
 *                 type: string
 *               unidad:
 *                 type: string
 *                 enum: [mes, hora, dia, pase]
 *               monto:
 *                 type: number
 *               vigenteDesde:
 *                 type: string
 *                 format: date
 *               vigenteHasta:
 *                 type: string
 *                 format: date
 *               confirmarCierre:
 *                 type: boolean
 *                 description: Si ya existe un precio vigente de la misma etiqueta que no cierra antes de vigenteDesde, confirma que se cierre automáticamente el día anterior. Sin esto, esa situación devuelve 409 con requiereConfirmacion:true en vez de crear el precio.
 *     responses:
 *       201:
 *         description: Precio creado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Etiqueta no encontrada
 *       409:
 *         description: Fechas ambiguas o superpuestas con otro precio de la misma etiqueta (ver requiereConfirmacion)
 *       500:
 *         description: Error al crear precio
 */
const VALID_UNIDADES = ['mes', 'hora', 'dia', 'pase'];

export const createPrecioHandler = async (req, res) => {
  try {
    const { etiquetaId, nombre, unidad, monto, vigenteDesde, vigenteHasta, confirmarCierre } = req.body;

    if (!etiquetaId) {
      return res.status(400).json({ message: 'etiquetaId es requerido' });
    }
    if (!nombre) {
      return res.status(400).json({ message: 'nombre es requerido' });
    }
    if (!unidad || !VALID_UNIDADES.includes(unidad)) {
      return res.status(400).json({ message: `unidad debe ser: ${VALID_UNIDADES.join(', ')}` });
    }
    if (monto == null || isNaN(Number(monto)) || Number(monto) < 0) {
      return res.status(400).json({ message: 'monto debe ser un número mayor o igual a 0' });
    }

    const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId: req.user.clubId, active: true });
    if (!etiqueta) {
      return res.status(404).json({ message: 'Etiqueta no encontrada' });
    }

    const desde = vigenteDesde ? new Date(vigenteDesde) : new Date();
    const hasta = vigenteHasta ? new Date(vigenteHasta) : null;

    const session = await mongoose.startSession();
    let precio;
    try {
      await session.withTransaction(async () => {
        await resolverVigenciaPrecio({ clubId: req.user.clubId, etiquetaId, desde, hasta, confirmado: !!confirmarCierre, session });

        precio = new Precios({
          clubId: req.user.clubId,
          etiquetaId,
          nombre,
          unidad,
          monto: Number(monto),
          vigenteDesde: desde,
          vigenteHasta: hasta,
          createdBy: req.user.email || req.user.id,
          updatedBy: req.user.email || req.user.id,
        });
        await precio.save({ session });
      });
    } finally {
      session.endSession();
    }

    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Precios', resourceId: precio._id, before: null, after: precio.toObject() });
    return res.status(201).json(precio);
  } catch (error) {
    if (error instanceof RequiereConfirmacionError) {
      return res.status(error.status).json({ requiereConfirmacion: true, message: error.message, precios: error.precios });
    }
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error creando precio:', error);
    return res.status(500).json({ message: 'Error al crear precio' });
  }
};

export default createPrecioHandler;
