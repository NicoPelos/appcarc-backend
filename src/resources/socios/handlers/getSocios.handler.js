import Socio from '../models/Socio.js';

export const getSociosHandler = async (req, res) => {
  try {
    const filter = { clubId: req.user?.clubId };
    filter.active = req.query.trash === 'true' ? false : true;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const [total, socios] = await Promise.all([
      Socio.countDocuments(filter),
      Socio.find(filter).sort({ apellido: 1, nombre: 1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      socios,
    });
  } catch (error) {
    console.error('Error obteniendo socios (handler):', error);
    res.status(500).json({ message: 'Error al obtener socios' });
  }
};

export default getSociosHandler;
