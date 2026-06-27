import CategoriaEscuelita from '../models/CategoriaEscuelita.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';

/**
 * @openapi
 * /api/escuelita/categorias:
 *   post:
 *     summary: Crear categoría de escuelita (solo admin)
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, codigo, frecuenciaSemanal]
 *             properties:
 *               nombre: { type: string }
 *               codigo: { type: string }
 *               descripcion: { type: string }
 *               frecuenciaSemanal:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 6
 *               etiquetaId:
 *                 type: string
 *                 description: ID de la etiqueta de precio asociada (opcional)
 *     responses:
 *       201:
 *         description: Categoría creada
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Etiqueta no encontrada
 *       409:
 *         description: Código duplicado
 *       500:
 *         description: Error al crear categoría
 */
export const createCategoriaHandler = async (req, res) => {
  try {
    const { nombre, codigo, descripcion, frecuenciaSemanal, etiquetaId } = req.body;

    if (!nombre) return res.status(400).json({ message: 'nombre es requerido' });
    if (!codigo) return res.status(400).json({ message: 'codigo es requerido' });

    const freq = Number(frecuenciaSemanal);
    if (!Number.isInteger(freq) || freq < 1 || freq > 6) {
      return res.status(400).json({ message: 'frecuenciaSemanal debe ser un entero entre 1 y 6' });
    }

    const existe = await CategoriaEscuelita.findOne({ clubId: req.user.clubId, codigo });
    if (existe) return res.status(409).json({ message: `Ya existe una categoría con código "${codigo}"` });

    if (etiquetaId) {
      const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId: req.user.clubId, active: true });
      if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });
    }

    const categoria = new CategoriaEscuelita({
      clubId: req.user.clubId,
      nombre,
      codigo: codigo.toLowerCase().replace(/\s+/g, '_'),
      descripcion: descripcion || '',
      frecuenciaSemanal: freq,
      etiquetaId: etiquetaId || null,
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
