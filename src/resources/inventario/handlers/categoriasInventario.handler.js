import CategoriaInventario, { CATEGORIAS_POR_DEFECTO } from '../models/CategoriaInventario.js';
import { logAudit } from '../../audit/services/audit.service.js';

const SIN_DEFECTOS = 'club-sin-categorias';

// La primera vez que un club mira sus categorías, se le cargan las de por
// defecto. Después manda lo que el club haya agregado o quitado.
const asegurarDefectos = async (clubId) => {
  const existe = await CategoriaInventario.exists({ clubId });
  if (existe) return;
  await CategoriaInventario.insertMany(
    CATEGORIAS_POR_DEFECTO.map((nombre) => ({ clubId, nombre, createdBy: SIN_DEFECTOS })),
    { ordered: false },
  ).catch(() => {});
};

export const getCategoriasInventarioHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;
    await asegurarDefectos(clubId);
    const categorias = await CategoriaInventario.find({ clubId, active: true }).sort({ nombre: 1 }).select('nombre').lean();
    res.status(200).json(categorias.map((c) => c.nombre));
  } catch (error) {
    console.error('Error listando categorías de inventario:', error);
    res.status(500).json({ message: 'Error al obtener las categorías' });
  }
};

export const createCategoriaInventarioHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre) return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
    if (nombre.length > 40) return res.status(400).json({ message: 'El nombre de la categoría no puede superar los 40 caracteres' });

    await asegurarDefectos(clubId);
    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';
    try {
      const categoria = await CategoriaInventario.create({ clubId, nombre, createdBy: actor });
      logAudit({ clubId, req, action: 'CREATE', resource: 'CategoriaInventario', resourceId: categoria._id, before: null, after: categoria.toObject() });
      res.status(201).json({ nombre: categoria.nombre });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: `Ya existe la categoría "${nombre}"` });
      throw error;
    }
  } catch (error) {
    console.error('Error creando categoría de inventario:', error);
    res.status(500).json({ message: 'Error al crear la categoría' });
  }
};

export default getCategoriasInventarioHandler;
