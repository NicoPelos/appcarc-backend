import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

export const createCategoriaHandler = async (req, res) => {
  try {
    const { nombre, codigo, descripcion, frecuenciaSemanal, precioMensual } = req.body;

    if (!nombre) return res.status(400).json({ message: 'nombre es requerido' });
    if (!codigo) return res.status(400).json({ message: 'codigo es requerido' });
    if (![1, 2].includes(Number(frecuenciaSemanal))) {
      return res.status(400).json({ message: 'frecuenciaSemanal debe ser 1 o 2' });
    }

    const existe = await CategoriaEscuelita.findOne({ clubId: req.user.clubId, codigo });
    if (existe) return res.status(409).json({ message: `Ya existe una categoría con código "${codigo}"` });

    const categoria = new CategoriaEscuelita({
      clubId: req.user.clubId,
      nombre,
      codigo: codigo.toLowerCase().replace(/\s+/g, '_'),
      descripcion: descripcion || '',
      frecuenciaSemanal: Number(frecuenciaSemanal),
      precioMensual: precioMensual != null ? Number(precioMensual) : null,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await categoria.save();
    return res.status(201).json(categoria);
  } catch (error) {
    console.error('Error creando categoría:', error);
    return res.status(500).json({ message: 'Error al crear categoría' });
  }
};

export default createCategoriaHandler;
