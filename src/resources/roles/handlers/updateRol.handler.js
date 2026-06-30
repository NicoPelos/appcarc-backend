import Rol from '../models/Rol.js';
import { TODOS_LOS_PERMISOS } from '../../../constants/permisos.js';
import { invalidarClub } from '../../../services/permisosCache.js';

/**
 * @openapi
 * /api/roles/{id}:
 *   put:
 *     summary: Editar nombre y/o permisos de un rol
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               permisos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["socios:read", "cobros:read"]
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       400:
 *         description: Permisos inválidos
 *       404:
 *         description: Rol no encontrado
 *       500:
 *         description: Error al actualizar rol
 */
export const updateRolHandler = async (req, res) => {
  const { nombre, permisos } = req.body;

  if (permisos !== undefined) {
    const invalidos = permisos.filter(p => !TODOS_LOS_PERMISOS.includes(p));
    if (invalidos.length) return res.status(400).json({ message: `Permisos inválidos: ${invalidos.join(', ')}` });
  }

  try {
    const rol = await Rol.findOne({ _id: req.params.id, clubId: req.user.clubId, active: true });
    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    if (nombre !== undefined) rol.nombre = nombre;
    if (permisos !== undefined) rol.permisos = permisos;
    await rol.save();

    invalidarClub(req.user.clubId);
    res.status(200).json(rol);
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando rol' });
  }
};
