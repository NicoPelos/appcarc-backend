import Socio from '../models/Socio.js';
import User from '../../usuarios/models/User.js';

/**
 * @openapi
 * /api/socios/me/profile:
 *   get:
 *     summary: Obtener el perfil del usuario actual
 *     tags: [Perfil]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 socio:
 *                   type: object
 *       404:
 *         description: Usuario o socio no encontrado
 *       500:
 *         description: Error al obtener perfil
 */
export const getMyProfileHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    let socio = null;
    if (user.socioId) {
      socio = await Socio.findOne({ _id: user.socioId, clubId: req.user?.clubId });
    }

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        clubId: user.clubId,
      },
      socio,
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ message: 'Error al obtener perfil' });
  }
};

export default getMyProfileHandler;
