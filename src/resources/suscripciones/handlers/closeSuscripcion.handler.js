import Suscripcion from '../models/Suscripcion.js';

const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * @openapi
 * /api/suscripciones/{id}/cerrar:
 *   put:
 *     summary: Cerrar una suscripción (admin o secretaria)
 *     tags: [Suscripciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fechaHasta]
 *             properties:
 *               fechaHasta:
 *                 type: string
 *                 example: "2026-06"
 *                 description: Período de fin en formato YYYY-MM
 *     responses:
 *       200:
 *         description: Suscripción cerrada
 *       400:
 *         description: Datos inválidos o suscripción ya cerrada
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error al cerrar suscripción
 */
export const closeSuscripcionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { fechaHasta } = req.body;

    if (!fechaHasta) {
      return res.status(400).json({ message: 'fechaHasta es requerido' });
    }
    if (!PERIODO_PATTERN.test(fechaHasta)) {
      return res.status(400).json({ message: 'fechaHasta debe tener formato YYYY-MM' });
    }

    const suscripcion = await Suscripcion.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!suscripcion) {
      return res.status(404).json({ message: 'Suscripción no encontrada' });
    }

    if (suscripcion.fechaHasta !== null) {
      return res.status(400).json({ message: 'La suscripción ya tiene una fecha de cierre' });
    }

    suscripcion.fechaHasta = fechaHasta;
    suscripcion.updatedBy = req.user.email || req.user.id;
    await suscripcion.save();

    return res.status(200).json(suscripcion);
  } catch (error) {
    console.error('Error cerrando suscripción:', error);
    return res.status(500).json({ message: 'Error al cerrar suscripción' });
  }
};

export default closeSuscripcionHandler;
