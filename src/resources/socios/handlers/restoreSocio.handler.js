import Socio from '../models/Socio.js';

export const restoreSocioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socio = await Socio.findOneAndUpdate(
      { _id: id, clubId: req.user?.clubId, active: false },
      {
        active: true,
        deletedAt: undefined,
        deletedBy: undefined,
        updatedBy: req.user?.id,
      },
      { returnDocument: 'after' }
    );
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado o no está en papelera' });
    res.status(200).json(socio);
  } catch (error) {
    console.error('Error restaurando socio (handler):', error);
    res.status(500).json({ message: 'Error al restaurar socio' });
  }
};

export default restoreSocioHandler;
