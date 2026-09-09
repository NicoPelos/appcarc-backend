import { getEtiquetaMap, buildIngresosEgresosPorCategoria } from '../services/categoriaMovimiento.service.js';

const DIAS_DEFAULT = 365;

/**
 * @openapi
 * /api/movimientos/resumen-por-categoria:
 *   get:
 *     summary: Ingresos y egresos del período agrupados por categoría (Cuota Social, Escuela Niños, Muro Libre, etc.)
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Listas [categoria, monto] de ingresos y egresos
 */
export const resumenPorCategoriaHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;

    const hasta = req.query.hasta ? new Date(`${req.query.hasta}T23:59:59.999Z`) : new Date();
    const desde = req.query.desde
      ? new Date(`${req.query.desde}T00:00:00.000Z`)
      : new Date(hasta.getTime() - DIAS_DEFAULT * 24 * 60 * 60 * 1000);

    const etiquetaMap = await getEtiquetaMap(clubId);
    const { ingresos, egresos } = await buildIngresosEgresosPorCategoria({ clubId, desde, hasta, etiquetaMap });

    res.json({
      desde,
      hasta,
      ingresosPorCategoria: ingresos.map(([categoria, monto]) => ({ categoria, monto })),
      egresosPorCategoria: egresos.map(([categoria, monto]) => ({ categoria, monto })),
    });
  } catch (error) {
    console.error('Error calculando el resumen por categoría:', error);
    res.status(500).json({ message: 'Error al calcular el resumen por categoría' });
  }
};

export default resumenPorCategoriaHandler;
