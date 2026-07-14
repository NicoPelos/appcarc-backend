import Notification from '../models/Notification.js';

/**
 * @openapi
 * /api/notificaciones/me:
 *   get:
 *     summary: Obtener el historial de notificaciones del usuario actual
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notificaciones (más recientes primero)
 *       500:
 *         description: Error al obtener notificaciones
 */
export const getMisNotificacionesHandler = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id, clubId: req.user.clubId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({ notifications });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
};

export default getMisNotificacionesHandler;
