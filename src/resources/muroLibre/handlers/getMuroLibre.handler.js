import Asistencia from '../../asistencias/models/Asistencia.js';

export const getMuroLibreHandler = async (req, res) => {
  try {
    const { page = 1, limit = 100, from, to } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const filter = { clubId: req.user?.clubId, tipo: 'muro_libre', active: true };

    if (from || to) {
      filter.fecha = {};
      if (from) filter.fecha.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to)   filter.fecha.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [total, registros] = await Promise.all([
      Asistencia.countDocuments(filter),
      Asistencia.find(filter)
        .sort({ fecha: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      registros,
    });
  } catch (error) {
    console.error('Error obteniendo muro libre:', error);
    res.status(500).json({ message: 'Error al obtener muro libre' });
  }
};

export default getMuroLibreHandler;
