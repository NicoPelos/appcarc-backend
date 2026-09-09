import { getEtiquetaMap, buildIngresosEgresosPorCategoria } from '../services/categoriaMovimiento.service.js';

const DIAS_DEFAULT = 365;
const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_DEFAULT = 6;
const MESES_MAX = 24;

// Construye los límites UTC de cada uno de los últimos `cantidad` meses
// calendario (incluyendo el actual) — Date.UTC no depende del timezone del
// servidor (a diferencia de `new Date(year, month, day)`), aunque "qué mes
// es ahora" sigue leyendo la hora local del servidor (margen de error de
// unas pocas horas alrededor del cambio de mes, aceptado por ahora — ver
// appcarc-backend#160, centralización de fechas ART pendiente).
const buildMesesRango = (cantidad) => {
  const ahora = new Date();
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    const y = ahora.getUTCFullYear();
    const m = ahora.getUTCMonth() - i;
    const desde = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const hasta = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)); // día 0 del mes siguiente = último día de este mes
    const periodo = `${desde.getUTCFullYear()}-${String(desde.getUTCMonth() + 1).padStart(2, '0')}`;
    meses.push({ periodo, desde, hasta });
  }
  return meses;
};

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

/**
 * @openapi
 * /api/movimientos/resumen-por-categoria-mensual:
 *   get:
 *     summary: Ingresos y egresos por categoría, mes a mes, para comparar la evolución de cada categoría
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: meses
 *         schema: { type: integer, minimum: 1, maximum: 24, default: 6 }
 *     responses:
 *       200:
 *         description: Un objeto por mes, con las listas de categoría/monto de ese mes
 */
export const resumenPorCategoriaMensualHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;
    const cantidad = Math.min(Math.max(parseInt(req.query.meses, 10) || MESES_DEFAULT, 1), MESES_MAX);

    const etiquetaMap = await getEtiquetaMap(clubId);
    const rangos = buildMesesRango(cantidad);

    const resultados = await Promise.all(
      rangos.map(({ desde, hasta }) => buildIngresosEgresosPorCategoria({ clubId, desde, hasta, etiquetaMap })),
    );

    const meses = rangos.map(({ periodo }, i) => ({
      periodo,
      label: MESES_LABEL[Number(periodo.slice(5, 7)) - 1],
      ingresosPorCategoria: resultados[i].ingresos.map(([categoria, monto]) => ({ categoria, monto })),
      egresosPorCategoria: resultados[i].egresos.map(([categoria, monto]) => ({ categoria, monto })),
    }));

    res.json({ meses });
  } catch (error) {
    console.error('Error calculando el resumen mensual por categoría:', error);
    res.status(500).json({ message: 'Error al calcular el resumen mensual por categoría' });
  }
};

export default resumenPorCategoriaHandler;
