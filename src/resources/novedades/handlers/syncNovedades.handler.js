import { syncInstagramFeed } from '../services/syncInstagram.service.js';

/**
 * @openapi
 * /api/novedades/sync:
 *   post:
 *     summary: Forzar sincronización inmediata con el feed RSS de Instagram
 *     tags: [Novedades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sincronización completada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 inserted: { type: integer }
 *                 skipped: { type: integer }
 *                 total: { type: integer }
 *       500:
 *         description: Error al sincronizar (ej. INSTAGRAM_RSS_URL no configurado)
 */
export const syncNovedadesHandler = async (req, res) => {
  try {
    const rssUrl = process.env.INSTAGRAM_RSS_URL;
    const clubId = req.user?.clubId;

    const result = await syncInstagramFeed({ rssUrl, clubId });

    res.status(200).json({
      message: 'Sincronización completada',
      ...result,
    });
  } catch (error) {
    console.error('Error sincronizando Instagram:', error);
    res.status(500).json({ message: error.message || 'Error al sincronizar' });
  }
};
