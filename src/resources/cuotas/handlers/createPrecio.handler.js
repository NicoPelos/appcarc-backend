import Precios from '../models/Precios.js';

/**
 * @openapi
 * /api/precios:
 *   post:
 *     summary: Crear precio en el catálogo (solo admin)
 *     tags: [Precios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoria, codigo, nombre, unidad, monto]
 *             properties:
 *               categoria:
 *                 type: string
 *                 enum: [cuota, hora, pase]
 *               codigo:
 *                 type: string
 *                 example: cuota_social
 *               nombre:
 *                 type: string
 *               unidad:
 *                 type: string
 *                 enum: [mes, hora, dia, pase]
 *               monto:
 *                 type: number
 *               vigenteDesde:
 *                 type: string
 *                 format: date
 *               vigenteHasta:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Precio creado
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error al crear precio
 */
const VALID_CATEGORIAS = ['cuota', 'hora', 'pase'];
const VALID_CODIGOS = [
  'cuota_social', 'cuota_escuelita',
  'hora_palestrero', 'hora_profesor', 'hora_secretaria',
  'muro_libre_diario_socio', 'muro_libre_diario_no_socio',
  'muro_libre_mensual_socio', 'muro_libre_mensual_no_socio',
];
const VALID_UNIDADES = ['mes', 'hora', 'dia', 'pase'];

export const createPrecioHandler = async (req, res) => {
  try {
    const { categoria, codigo, nombre, unidad, monto, vigenteDesde, vigenteHasta } = req.body;

    if (!categoria || !VALID_CATEGORIAS.includes(categoria)) {
      return res.status(400).json({ message: `categoria debe ser: ${VALID_CATEGORIAS.join(', ')}` });
    }
    if (!codigo || !VALID_CODIGOS.includes(codigo)) {
      return res.status(400).json({ message: `codigo inválido` });
    }
    if (!nombre) {
      return res.status(400).json({ message: 'nombre es requerido' });
    }
    if (!unidad || !VALID_UNIDADES.includes(unidad)) {
      return res.status(400).json({ message: `unidad debe ser: ${VALID_UNIDADES.join(', ')}` });
    }
    if (monto == null || isNaN(Number(monto)) || Number(monto) < 0) {
      return res.status(400).json({ message: 'monto debe ser un número mayor o igual a 0' });
    }

    const precio = new Precios({
      clubId: req.user.clubId,
      categoria,
      codigo,
      nombre,
      unidad,
      monto: Number(monto),
      vigenteDesde: vigenteDesde ? new Date(vigenteDesde) : new Date(),
      vigenteHasta: vigenteHasta ? new Date(vigenteHasta) : null,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await precio.save();
    return res.status(201).json(precio);
  } catch (error) {
    console.error('Error creando precio:', error);
    return res.status(500).json({ message: 'Error al crear precio' });
  }
};

export default createPrecioHandler;
