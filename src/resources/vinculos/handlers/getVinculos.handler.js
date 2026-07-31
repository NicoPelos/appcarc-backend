import VinculoFamiliar from '../models/VinculoFamiliar.js';

/**
 * @openapi
 * /api/vinculos:
 *   get:
 *     summary: Listar vínculos familiares (por hijo o por tutor)
 *     tags: [Vinculos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hijoSocioId
 *         schema:
 *           type: string
 *       - in: query
 *         name: padreUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de vínculos
 */
export const getVinculosHandler = async (req, res) => {
  try {
    const filter = { clubId: req.user?.clubId, active: true };
    if (req.query.hijoSocioId) filter.hijoSocioId = req.query.hijoSocioId;
    if (req.query.padreUserId) filter.padreUserId = req.query.padreUserId;

    const vinculos = await VinculoFamiliar.find(filter)
      .sort({ createdAt: -1 })
      .populate('padreUserId', 'nombre email')
      .populate('hijoSocioId', 'socioNumber nombre apellido dni fotoPerfil');

    return res.status(200).json({ vinculos });
  } catch (error) {
    console.error('Error obteniendo vínculos familiares:', error);
    return res.status(500).json({ message: 'Error al obtener vínculos' });
  }
};

export default getVinculosHandler;
