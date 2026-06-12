import Cobro from '../models/Cobro.js';

export const getCobrosHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const filter = { clubId: req.user?.clubId, active: true };

    const [total, cobros] = await Promise.all([
      Cobro.countDocuments(filter),
      Cobro.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      cobros,
    });
  } catch (error) {
    console.error('Error obteniendo cobros:', error);
    res.status(500).json({ message: 'Error al obtener cobros' });
  }
};

export default getCobrosHandler;
