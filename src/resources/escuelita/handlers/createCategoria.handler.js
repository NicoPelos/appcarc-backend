import CategoriaEscuelita from '../models/CategoriaEscuelita.js';

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
 *                 enum: [1, 2]
 *               precioMensual: { type: number }
*               codigoPrecio:
*                 type: string
*                 description: Código del precio en el catálogo (ej. cuota_escuelita_ninos_2x)
 *     responses:
 *       201:
 *         description: Categoría creada
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Código duplicado
 *       500:
 *         description: Error al crear categoría
 */
export const createCategoriaHandler = async (req, res) => {
  try {
    const { nombre, codigo, descripcion, frecuenciaSemanal, precioMensual, codigoPrecio } = req.body;

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
      codigoPrecio: codigoPrecio || null,
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
