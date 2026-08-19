import Socio from '../models/Socio.js';
import { calcularDeuda } from '../../cuotas/services/calcularDeuda.service.js';

// Mismo criterio de estados que revisa avisoMorosidad.job.js — un socio en
// Baja no genera deuda nueva, no tiene sentido incluirlo en el reporte.
const ESTADOS_A_REVISAR = ['Activo', 'Adherente'];

/**
 * @openapi
 * /api/socios/morosos:
 *   get:
 *     summary: Listar socios con deuda de al menos N meses en cualquier plan (no solo cuota social)
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: meses
 *         schema: { type: integer, default: 1 }
 *         description: Umbral de meses adeudados (>=)
 *     responses:
 *       200:
 *         description: Socios con deuda, ordenados por total adeudado descendente
 *       500:
 *         description: Error al calcular morosos
 */
export const getSociosMorososHandler = async (req, res) => {
  try {
    const clubId = req.user.clubId;
    const meses = Math.max(parseInt(req.query.meses, 10) || 1, 1);

    const socios = await Socio.find({ clubId, active: true, estado: { $in: ESTADOS_A_REVISAR } })
      .select('nombre apellido dni socioNumber telefono correoElectronico estado')
      .lean();

    const resultado = [];
    for (const socio of socios) {
      const deuda = await calcularDeuda({ socioId: socio._id, clubId });
      const deudas = deuda.suscripciones.filter((s) => !s.exento && s.mesesDeuda >= meses);
      if (deudas.length === 0) continue;

      const totalDeuda = deudas.reduce((sum, d) => sum + (d.totalDeuda ?? 0), 0);
      resultado.push({
        socio,
        deudas: deudas.map((d) => ({ etiqueta: d.etiqueta, mesesDeuda: d.mesesDeuda, totalDeuda: d.totalDeuda })),
        totalDeuda,
      });
    }

    resultado.sort((a, b) => b.totalDeuda - a.totalDeuda);
    res.status(200).json({ meses, total: resultado.length, socios: resultado });
  } catch (error) {
    console.error('Error obteniendo socios morosos:', error);
    res.status(500).json({ message: 'Error al obtener socios morosos' });
  }
};

export default getSociosMorososHandler;
