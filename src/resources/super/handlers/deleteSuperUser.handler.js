import User from '../../usuarios/models/User.js';
import { anularVinculosFamiliares } from '../../vinculos/services/anularVinculosFamiliares.service.js';

export const deleteSuperUserHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(id, { $set: { active: false } }, { new: true })
      .select('-password');

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    await anularVinculosFamiliares({
      clubId: user.clubId,
      padreUserIds: [user._id],
      actor: req.user?.email || req.user?.id,
    });
    res.status(200).json({ message: 'Usuario desactivado', userId: user._id });
  } catch (error) {
    console.error('Error desactivando usuario:', error);
    res.status(500).json({ message: 'Error al desactivar usuario' });
  }
};
