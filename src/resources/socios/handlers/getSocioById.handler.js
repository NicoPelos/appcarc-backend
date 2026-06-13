import Socio from '../models/Socio.js';


/**
 * @openapi
 * /api/socios/{id}:
 *   get:
 *     summary: Obtener socio por ID
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID del socio
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Socio encontrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Socio'
 *       404:
 *         description: Socio no encontrado
 *       500:
 *         description: Error al obtener socio
 */ 

export const getSocioByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socio = await Socio.findOne({ _id: id, clubId: req.user?.clubId });
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });
    res.status(200).json(socio);
  } catch (error) {
    console.error('Error obteniendo socio (handler):', error);
    res.status(500).json({ message: 'Error al obtener socio' });
  }
};

export default getSocioByIdHandler;
