import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

export const getCategoriasHandler = async (req, res) => {
  try {
    const { trash } = req.query;
    const categorias = await CategoriaEscuelita.find({
      clubId: req.user.clubId,
      active: trash === 'true' ? false : true,
    }).sort({ nombre: 1 }).lean();

    return res.status(200).json(categorias);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    return res.status(500).json({ message: 'Error al obtener categorías' });
  }
};

export default getCategoriasHandler;
