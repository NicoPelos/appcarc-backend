import Etiqueta from '../models/Etiqueta.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/etiquetas:
 *   post:
 *     summary: Crear etiqueta (solo admin)
 *     tags: [Etiquetas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, unidad]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Cuota Social
 *               unidad:
 *                 type: string
 *                 enum: [mes, hora, dia]
 *               uso_sistema:
 *                 type: string
 *                 example: cuota_social
 *     responses:
 *       201:
 *         description: Etiqueta creada
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error al crear etiqueta
 */
const VALID_UNIDADES = ['mes', 'hora', 'dia'];

export const createEtiquetaHandler = async (req, res) => {
  try {
    const { nombre, unidad, uso_sistema } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'nombre es requerido' });
    }
    if (!unidad || !VALID_UNIDADES.includes(unidad)) {
      return res.status(400).json({ message: `unidad debe ser: ${VALID_UNIDADES.join(', ')}` });
    }

    const etiqueta = new Etiqueta({
      clubId: req.user.clubId,
      nombre,
      unidad,
      uso_sistema: uso_sistema || null,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await etiqueta.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Etiqueta', resourceId: etiqueta._id, before: null, after: etiqueta.toObject() });
    return res.status(201).json(etiqueta);
  } catch (error) {
    console.error('Error creando etiqueta:', error);
    return res.status(500).json({ message: 'Error al crear etiqueta' });
  }
};

export default createEtiquetaHandler;
