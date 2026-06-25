import Precios from '../models/Precios.js';

export const deletePrecioHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const precio = await Precios.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!precio) return res.status(404).json({ message: 'Precio no encontrado' });

    precio.active = false;
    precio.deletedAt = new Date();
    precio.deletedBy = req.user.email || req.user.id;
    precio.updatedBy = req.user.email || req.user.id;
    await precio.save();

    return res.status(200).json({ message: 'Precio eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando precio:', error);
    return res.status(500).json({ message: 'Error al eliminar precio' });
  }
};

export default deletePrecioHandler;
