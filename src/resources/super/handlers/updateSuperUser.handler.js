import User from '../../usuarios/models/User.js';

export const updateSuperUserHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, roles, active } = req.body;

    const update = {};
    if (nombre !== undefined) update.nombre = nombre;
    if (roles !== undefined) update.roles = roles;
    if (active !== undefined) update.active = active;

    const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true })
      .select('-password -expoPushToken');

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.status(200).json(user);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};
