import Precios from '../models/Precios.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';

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
 *     responses:
 *       201:
 *         description: Precio creado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Etiqueta no encontrada
 *       500:
 *         description: Error al crear precio
 */
const VALID_UNIDADES = ['mes', 'hora', 'dia', 'pase'];

export const createPrecioHandler = async (req, res) => {
  try {
    const { etiquetaId, nombre, unidad, monto, vigenteDesde, vigenteHasta } = req.body;

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

    const precio = new Precios({
      clubId: req.user.clubId,
      etiquetaId,
      nombre,
      unidad,
      monto: Number(monto),
      vigenteDesde: vigenteDesde ? new Date(vigenteDesde) : new Date(),
      vigenteHasta: vigenteHasta ? new Date(vigenteHasta) : null,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await precio.save();
    return res.status(201).json(precio);
  } catch (error) {
    console.error('Error creando precio:', error);
    return res.status(500).json({ message: 'Error al crear precio' });
  }
};

export default createPrecioHandler;
