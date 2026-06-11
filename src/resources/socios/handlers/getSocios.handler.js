import Socio from '../models/Socio.js';

export const getSociosHandler = async (req, res) => {
  try {
    const filter = { clubId: req.user?.clubId };
    filter.active = req.query.trash === 'true' ? false : true;
    const socios = await Socio.find(filter);
    res.status(200).json(socios);
  } catch (error) {
    console.error('Error obteniendo socios (handler):', error);
    res.status(500).json({ message: 'Error al obtener socios' });
  }
};

export default getSociosHandler;
