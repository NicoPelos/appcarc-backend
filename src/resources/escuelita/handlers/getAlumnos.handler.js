import Escuelita from '../models/Escuelita.js';

/**
 * @openapi
 * /api/escuelita:
 *   get:
 *     summary: Obtener lista de alumnos de escuelita
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         required: false
 *         description: Cantidad de resultados por página
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [activo, pausado, baja, todos]
 *         required: false
 *         description: Estado del alumno en escuelita (activo, pausado, baja o todos)
 *     responses:
 *       200:
 *         description: Lista de alumnos de escuelita obtenida exitosamente
 *       500:
 *         description: Error al obtener alumnos de escuelita
 */

export const getAlumnosHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, estado = 'activo', socioId } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const filter = { clubId: req.user?.clubId, active: true };

    if (estado !== 'todos') {
      filter.estado = estado;
    }
    if (socioId) {
      filter.socioId = socioId;
    }

    const [total, alumnos] = await Promise.all([
      Escuelita.countDocuments(filter),
      Escuelita.find(filter)
        .populate('socioId', 'socioNumber nombre apellido dni correoElectronico telefono estado active')
        .populate('categoriaId', 'nombre codigo frecuenciaSemanal precioMensual codigoPrecio')
        .sort({ fechaInscripcion: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      alumnos,
    });
  } catch (error) {
    console.error('Error obteniendo alumnos de escuelita:', error);
    res.status(500).json({ message: 'Error al obtener alumnos de escuelita' });
  }
};

export default getAlumnosHandler;
