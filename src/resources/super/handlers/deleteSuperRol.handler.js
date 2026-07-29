import Rol from '../../roles/models/Rol.js';
import { invalidarClub } from '../../../services/permisosCache.js';

/**
 * @openapi
 * /api/super/roles/{id}:
 *   delete:
 *     summary: Eliminar (desactivar) un rol de un club (superadmin, cualquier club)
 *     tags: [Super]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Rol eliminado
 *       404:
 *         description: Rol no encontrado
 */
export const deleteSuperRolHandler = async (req, res) => {
  try {
    const rol = await Rol.findOne({ _id: req.params.id, active: true });
    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    rol.active = false;
    await rol.save();

    invalidarClub(rol.clubId);
    res.status(200).json({ message: 'Rol eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando rol' });
  }
};
