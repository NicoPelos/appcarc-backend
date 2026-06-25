import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

export const updateCategoriaHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, frecuenciaSemanal, precioMensual } = req.body;

    const categoria = await CategoriaEscuelita.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' });

    if (nombre !== undefined) categoria.nombre = nombre;
    if (descripcion !== undefined) categoria.descripcion = descripcion;
    if (frecuenciaSemanal !== undefined) {
      if (![1, 2].includes(Number(frecuenciaSemanal))) {
        return res.status(400).json({ message: 'frecuenciaSemanal debe ser 1 o 2' });
      }
      categoria.frecuenciaSemanal = Number(frecuenciaSemanal);
    }
    if (precioMensual !== undefined) {
      categoria.precioMensual = precioMensual != null ? Number(precioMensual) : null;
    }

    categoria.updatedBy = req.user.email || req.user.id;
    await categoria.save();

    return res.status(200).json(categoria);
  } catch (error) {
    console.error('Error actualizando categoría:', error);
    return res.status(500).json({ message: 'Error al actualizar categoría' });
  }
};

export default updateCategoriaHandler;
