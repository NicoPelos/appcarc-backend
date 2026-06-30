import Rol from '../models/Rol.js';

export const getRolesHandler = async (req, res) => {
  try {
    const roles = await Rol.find({ clubId: req.user.clubId, active: true }).sort({ nombre: 1 }).lean();
    res.status(200).json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo roles' });
  }
};
