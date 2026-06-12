import Escuelita from '../models/Escuelita.js';

export const getAlumnosHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, estado = 'activo' } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const filter = { clubId: req.user?.clubId, active: true };

    if (estado !== 'todos') {
      filter.estado = estado;
    }

    const [total, alumnos] = await Promise.all([
      Escuelita.countDocuments(filter),
      Escuelita.find(filter)
        .populate('socioId', 'socioNumber nombre apellido dni correoElectronico telefono estado active')
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
