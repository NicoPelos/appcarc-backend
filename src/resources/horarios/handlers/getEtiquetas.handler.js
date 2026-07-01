import HorarioEtiqueta from '../models/HorarioEtiqueta.js';

/**
 * @openapi
 * /api/horarios/etiquetas:
 *   get:
 *     summary: Listar etiquetas de horarios
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: tipo
 *         in: query
 *         description: Filtrar por tipo (nombre | tipo_tarea)
 *         schema: { type: string, enum: [nombre, tipo_tarea] }
 *     responses:
 *       200:
 *         description: Lista de etiquetas
 *       500:
 *         description: Error al obtener etiquetas
 */
export const getEtiquetasHandler = async (req, res) => {
  try {
    const { tipo } = req.query;
    const filter = { clubId: req.user.clubId };
    if (tipo) filter.tipo = tipo;

    const etiquetas = await HorarioEtiqueta.find(filter).sort({ valor: 1 });
    return res.status(200).json(etiquetas);
  } catch (error) {
    console.error('Error obteniendo etiquetas:', error);
    return res.status(500).json({ message: 'Error al obtener etiquetas' });
  }
};

export default getEtiquetasHandler;
