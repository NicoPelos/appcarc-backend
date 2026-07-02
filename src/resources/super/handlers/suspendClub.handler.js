import Club from '../../clubs/models/Club.js';

export const suspendClubHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const club = await Club.findById(id);
    if (!club) return res.status(404).json({ message: 'Club no encontrado' });

    const suspending = club.active;
    club.active = !club.active;
    club.suspendidoAt = suspending ? new Date() : null;
    await club.save();

    res.status(200).json({ active: club.active, suspendidoAt: club.suspendidoAt });
  } catch (error) {
    console.error('Error suspendiendo club:', error);
    res.status(500).json({ message: 'Error al suspender/reactivar club' });
  }
};
