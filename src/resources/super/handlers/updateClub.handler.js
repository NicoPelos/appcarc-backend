import Club from '../../clubs/models/Club.js';

export const updateClubHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, logoUrl, contacto, plan, modulos, integraciones } = req.body;

    const club = await Club.findByIdAndUpdate(
      id,
      { $set: { nombre, logoUrl, contacto, plan, modulos, integraciones } },
      { new: true, runValidators: true },
    );

    if (!club) return res.status(404).json({ message: 'Club no encontrado' });
    res.status(200).json(club);
  } catch (error) {
    console.error('Error actualizando club:', error);
    res.status(500).json({ message: 'Error al actualizar club' });
  }
};
