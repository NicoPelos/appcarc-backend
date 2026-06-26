import HorarioEtiqueta from '../models/HorarioEtiqueta.js';

/**
 * @openapi
 * /api/horarios/etiquetas:
 *   post:
 *     summary: Crear etiqueta de horario
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, valor]
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [nombre, tipo_tarea]
 *               valor:
 *                 type: string
 *     responses:
 *       201:
 *         description: Etiqueta creada
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Etiqueta duplicada
 *       500:
 *         description: Error al crear etiqueta
 */
export const createEtiquetaHandler = async (req, res) => {
  try {
    const { tipo, valor } = req.body;
    if (!tipo || !['nombre', 'tipo_tarea'].includes(tipo)) {
      return res.status(400).json({ message: 'tipo debe ser "nombre" o "tipo_tarea"' });
    }
    if (!valor || !valor.trim()) {
      return res.status(400).json({ message: 'valor es requerido' });
    }

    const etiqueta = new HorarioEtiqueta({
      clubId: req.user.clubId,
      tipo,
      valor: valor.trim(),
      createdBy: req.user.email || req.user.id,
    });

    await etiqueta.save();
    return res.status(201).json(etiqueta);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Esa etiqueta ya existe' });
    }
    console.error('Error creando etiqueta:', error);
    return res.status(500).json({ message: 'Error al crear etiqueta' });
  }
};

export default createEtiquetaHandler;
