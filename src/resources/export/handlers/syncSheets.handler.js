import { exportToSheets } from '../../../services/sheetsExport.service.js';

/**
 * @openapi
 * /api/export/sheets:
 *   post:
 *     summary: Exportar datos del club a Google Sheets (solo admin)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Exportación completada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: URL del Google Sheet generado
 *                 stats:
 *                   type: object
 *                   description: Cantidad de filas exportadas por pestaña
 *       500:
 *         description: Error al exportar
 */
export const syncSheetsHandler = async (req, res) => {
  try {
    const clubId = req.user.clubId;
    const clubName = process.env.CLUB_NAME || 'CARC';

    const result = await exportToSheets({ clubId, clubName });

    return res.status(200).json({
      message: 'Exportación completada',
      url: result.url,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Error exportando a Google Sheets:', error);
    return res.status(500).json({ message: 'Error al exportar a Google Sheets', detail: error.message });
  }
};
