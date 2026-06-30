import Rol from '../models/Rol.js';
import { invalidarClub } from '../../../services/permisosCache.js';

/**
 * @openapi
 * /api/roles/{id}:
 *   delete:
 *     summary: Eliminar (desactivar) un rol del club
 *     tags: [Roles]
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
 *       500:
 *         description: Error al eliminar rol
 */
export const deleteRolHandler = async (req, res) => {
  try {
    const rol = await Rol.findOne({ _id: req.params.id, clubId: req.user.clubId, active: true });
    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    rol.active = false;
    await rol.save();

    invalidarClub(req.user.clubId);
    res.status(200).json({ message: 'Rol eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando rol' });
  }
};
