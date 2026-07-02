import User from '../../usuarios/models/User.js';

export const getUsersHandler = async (req, res) => {
  try {
    const { clubId, rol, active, page = 1, limit = 50 } = req.query;
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 50));

    const filter = {};
    if (clubId) filter.clubId = clubId;
    if (rol) filter.roles = rol;
    if (active !== undefined) filter.active = active === 'true';

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-password -expoPushToken')
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    res.status(200).json({ page: pageNumber, limit: pageSize, total, users });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};
