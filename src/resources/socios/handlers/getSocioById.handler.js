import Socio from '../models/Socio.js';

export const getSocioByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socio = await Socio.findOne({ _id: id, clubId: req.user?.clubId });
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });
    res.status(200).json(socio);
  } catch (error) {
    console.error('Error obteniendo socio (handler):', error);
    res.status(500).json({ message: 'Error al obtener socio' });
  }
};

export default getSocioByIdHandler;
