import Club from '../../clubs/models/Club.js';
import { invalidarClubActivo } from '../../../services/clubActivoCache.js';

export const suspendClubHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const club = await Club.findById(id);
    if (!club) return res.status(404).json({ message: 'Club no encontrado' });

    const suspending = club.active;
    club.active = !club.active;
    club.suspendidoAt = suspending ? new Date() : null;
    await club.save();
    // appcarc-backend#169: sin esto, el cache de 5 minutos de esClubActivo
    // dejaría a los usuarios del club entrando/operando con normalidad hasta
    // que expire, aunque el toggle ya se haya guardado.
    invalidarClubActivo(club.slug);

    res.status(200).json({ active: club.active, suspendidoAt: club.suspendidoAt });
  } catch (error) {
    console.error('Error suspendiendo club:', error);
    res.status(500).json({ message: 'Error al suspender/reactivar club' });
  }
};
