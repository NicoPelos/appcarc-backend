import mongoose from 'mongoose';
import { calcularDeuda } from '../../cuotas/services/calcularDeuda.service.js';

/**
 * @openapi
 * /api/socios/{id}/deuda:
 *   get:
 *     summary: Calcular deuda de cuotas (social y escuelita) de un socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deuda calculada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 social:
 *                   type: object
 *                   properties:
 *                     ultimoPeriodoPagado:
 *                       type: string
 *                       nullable: true
 *                     periodoActual:
 *                       type: string
 *                     mesesDeuda:
 *                       type: integer
 *                     periodos:
 *                       type: array
 *                       items:
 *                         type: string
 *                     precioUnitario:
 *                       type: number
 *                       nullable: true
 *                     totalDeuda:
 *                       type: number
 *                       nullable: true
 *                 escuelita:
 *                   nullable: true
 *                   description: null si el socio no es alumno de escuelita
 *       403:
 *         description: Sin permiso para ver la deuda de este socio
 *       404:
 *         description: Socio no encontrado
 */
export const getSocioDeudaHandler = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Socio no encontrado' });
  }

  if (req.user.role === 'socio' && req.user.socioId !== id) {
    return res.status(403).json({ message: 'No tenés permiso para ver la deuda de este socio' });
  }

  try {
    const [social, escuelita] = await Promise.all([
      calcularDeuda({ socioId: id, clubId: req.user.clubId, tipo: 'social' }),
      calcularDeuda({ socioId: id, clubId: req.user.clubId, tipo: 'escuelita' }),
    ]);

    if (social === null) {
      return res.status(404).json({ message: 'Socio no encontrado' });
    }

    return res.status(200).json({ social, escuelita });
  } catch (error) {
    console.error('Error calculando deuda:', error);
    return res.status(500).json({ message: 'Error al calcular deuda' });
  }
};

export default getSocioDeudaHandler;
