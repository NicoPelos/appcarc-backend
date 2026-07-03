import User from '../models/User.js';

const ROLES_STAFF = ['profesor', 'palestrero', 'limpieza', 'arreglos', 'colaborador'];

/**
 * @openapi
 * /api/usuarios/staff:
 *   get:
 *     summary: Obtener lista de usuarios con roles de staff
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de staff agrupada por rol
 */
export const getStaffHandler = async (req, res) => {
  try {
    const users = await User.find({
      clubId: req.user.clubId,
      active: true,
      roles: { $in: ROLES_STAFF },
    })
      .select('nombre email roles socioId')
      .sort({ nombre: 1 })
      .lean();

    res.status(200).json(users);
  } catch (error) {
    console.error('Error obteniendo staff:', error);
    res.status(500).json({ message: 'Error al obtener staff' });
  }
};
