import bcrypt from 'bcryptjs';
import User from '../../usuarios/models/User.js';
import { obtenerRolIdsPorNombres } from '../../roles/services/resolverRoles.service.js';

export const createSuperUserHandler = async (req, res) => {
  try {
    const { email, nombre, clubId, roles = ['admin'], tempPassword } = req.body;

    if (!email || !clubId) {
      return res.status(400).json({ message: 'email y clubId son requeridos' });
    }

    const existe = await User.findOne({ email, clubId });
    if (existe) return res.status(409).json({ message: 'Ya existe un usuario con ese email en el club' });

    const rolesIds = await obtenerRolIdsPorNombres({ clubId, nombres: roles });
    if (!rolesIds.length) {
      return res.status(400).json({ message: `Ninguno de los roles indicados (${roles.join(', ')}) existe en ese club` });
    }

    const rawPassword = tempPassword || Math.random().toString(36).slice(-10);
    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash(rawPassword, salt);

    const user = await User.create({
      email, nombre, clubId, roles: rolesIds, password, mustChangePassword: true,
    });

    res.status(201).json({
      user: { id: user._id, email: user.email, nombre: user.nombre, roles, clubId: user.clubId },
      tempPassword: rawPassword,
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
};
