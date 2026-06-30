import Rol from '../models/Rol.js';
import { TODOS_LOS_PERMISOS } from '../../../constants/permisos.js';
import { invalidarClub } from '../../../services/permisosCache.js';

/**
 * @openapi
 * /api/roles:
 *   post:
 *     summary: Crear un nuevo rol para el club
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: entrenador
 *               permisos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["socios:read", "muroLibre:read"]
 *     responses:
 *       201:
 *         description: Rol creado
 *       400:
 *         description: Nombre requerido o permisos inválidos
 *       409:
 *         description: El rol ya existe
 *       500:
 *         description: Error al crear rol
 */
export const createRolHandler = async (req, res) => {
  const { nombre, permisos = [] } = req.body;
  if (!nombre) return res.status(400).json({ message: 'El campo nombre es requerido' });

  const invalidos = permisos.filter(p => !TODOS_LOS_PERMISOS.includes(p));
  if (invalidos.length) return res.status(400).json({ message: `Permisos inválidos: ${invalidos.join(', ')}` });

  try {
    const existe = await Rol.findOne({ clubId: req.user.clubId, nombre });
    if (existe) return res.status(409).json({ message: `El rol '${nombre}' ya existe` });

    const rol = new Rol({ clubId: req.user.clubId, nombre, permisos });
    await rol.save();
    invalidarClub(req.user.clubId);
    res.status(201).json(rol);
  } catch (error) {
    res.status(500).json({ message: 'Error creando rol' });
  }
};
