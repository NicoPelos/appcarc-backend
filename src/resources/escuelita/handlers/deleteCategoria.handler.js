import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

export const deleteCategoriaHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const categoria = await CategoriaEscuelita.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' });

    categoria.active = false;
    categoria.deletedAt = new Date();
    categoria.deletedBy = req.user.email || req.user.id;
    categoria.updatedBy = req.user.email || req.user.id;
    await categoria.save();

    return res.status(200).json({ message: 'Categoría eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando categoría:', error);
    return res.status(500).json({ message: 'Error al eliminar categoría' });
  }
};

export default deleteCategoriaHandler;
