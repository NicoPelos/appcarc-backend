import Precios from '../models/Precios.js';

export const getPreciosHandler = async (req, res) => {
  try {
    const { categoria, codigo, trash } = req.query;
    const showTrash = trash === 'true';

    const filter = {
      clubId: req.user.clubId,
      active: !showTrash,
    };

    if (categoria) filter.categoria = categoria;
    if (codigo) filter.codigo = codigo;

    const precios = await Precios.find(filter).sort({ codigo: 1, vigenteDesde: -1 }).lean();

    return res.status(200).json(precios);
  } catch (error) {
    console.error('Error obteniendo precios:', error);
    return res.status(500).json({ message: 'Error al obtener precios' });
  }
};

export default getPreciosHandler;
