import { getEtiquetaMap, buildIngresosEgresosPorCategoria, buildDetalleCategoria } from '../services/categoriaMovimiento.service.js';

const DIAS_DEFAULT = 365;
const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_DEFAULT = 6;
const MESES_MAX = 24;
const MESES_MAX_RANGO = 36;
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

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

// Alternativa a buildMesesRango cuando el caller pide un rango calendario
// explícito (appcarc-backend#172, vista dedicada para comparar categorías
// mes a mes en cualquier ventana, no solo "los últimos N meses desde hoy"
// como hace el gráfico del Dashboard) — enumera cada mes entre `desdePeriodo`
// y `hastaPeriodo` (ambos "YYYY-MM"), inclusive.
const enumerarMesesEntre = (desdePeriodo, hastaPeriodo) => {
  const [y1, m1] = desdePeriodo.split('-').map(Number);
  const [y2, m2] = hastaPeriodo.split('-').map(Number);
  const meses = [];
  let y = y1;
  let m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    const desde = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const hasta = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const periodo = `${y}-${String(m).padStart(2, '0')}`;
    meses.push({ periodo, desde, hasta });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (meses.length > MESES_MAX_RANGO) break; // corte de seguridad, se valida el tope antes de llegar acá
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
 *         description: Cantidad de meses hacia atrás desde hoy (ignorado si se pasan desde/hasta)
 *         schema: { type: integer, minimum: 1, maximum: 24, default: 6 }
 *       - in: query
 *         name: desde
 *         description: Mes inicial YYYY-MM, para un rango calendario explícito (appcarc-backend#172)
 *         schema: { type: string }
 *       - in: query
 *         name: hasta
 *         description: Mes final YYYY-MM, inclusive
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Un objeto por mes, con las listas de categoría/monto de ese mes
 */
export const resumenPorCategoriaMensualHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;

    let rangos;
    if (req.query.desde || req.query.hasta) {
      const desdePeriodo = String(req.query.desde || '');
      const hastaPeriodo = String(req.query.hasta || '');
      if (!PERIODO_REGEX.test(desdePeriodo) || !PERIODO_REGEX.test(hastaPeriodo)) {
        return res.status(400).json({ message: 'desde/hasta deben tener formato YYYY-MM' });
      }
      if (desdePeriodo > hastaPeriodo) {
        return res.status(400).json({ message: 'desde no puede ser posterior a hasta' });
      }
      rangos = enumerarMesesEntre(desdePeriodo, hastaPeriodo);
      if (rangos.length > MESES_MAX_RANGO) {
        return res.status(400).json({ message: `El rango no puede superar los ${MESES_MAX_RANGO} meses` });
      }
    } else {
      const cantidad = Math.min(Math.max(parseInt(req.query.meses, 10) || MESES_DEFAULT, 1), MESES_MAX);
      rangos = buildMesesRango(cantidad);
    }

    const etiquetaMap = await getEtiquetaMap(clubId);

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

// Fechas ya calculadas por el caller (`req.query.desde`/`hasta`) pueden venir
// como fecha sola ("2026-08-01", desde un <input type=date>) o como ISO
// completo con hora (el `desde`/`hasta` que ya devuelve resumen-por-categoria
// y que el Dashboard reenvía tal cual al abrir el detalle de una porción de
// la torta) — completar la hora solo hace falta en el primer caso.
const parseFechaHasta = (raw) => {
  if (!raw) return new Date();
  return String(raw).includes('T') ? new Date(raw) : new Date(`${raw}T23:59:59.999Z`);
};
const parseFechaDesde = (raw, hastaDate) => {
  if (!raw) return new Date(hastaDate.getTime() - DIAS_DEFAULT * 24 * 60 * 60 * 1000);
  return String(raw).includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00.000Z`);
};

/**
 * @openapi
 * /api/movimientos/resumen-por-categoria/detalle:
 *   get:
 *     summary: Listado item por item de los movimientos que componen una categoría (appcarc-backend#171)
 *     tags: [Movimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [Ingreso, Egreso], default: Ingreso }
 *       - in: query
 *         name: categoria
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: periodo
 *         description: Mes puntual YYYY-MM (alternativa a desde/hasta, para el gráfico mes a mes)
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         schema: { type: string }
 *       - in: query
 *         name: hasta
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listado de movimientos/items de esa categoría, más recientes primero
 */
export const resumenPorCategoriaDetalleHandler = async (req, res) => {
  try {
    const clubId = req.user?.clubId;
    const tipo = req.query.tipo === 'Egreso' ? 'Egreso' : 'Ingreso';
    const categoria = String(req.query.categoria || '').trim();
    if (!categoria) return res.status(400).json({ message: 'Falta el parámetro categoria' });

    let desde;
    let hasta;
    if (req.query.periodo) {
      const [y, m] = String(req.query.periodo).split('-').map(Number);
      if (!y || !m || m < 1 || m > 12) {
        return res.status(400).json({ message: 'periodo inválido, formato esperado YYYY-MM' });
      }
      desde = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
      hasta = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    } else {
      hasta = parseFechaHasta(req.query.hasta);
      desde = parseFechaDesde(req.query.desde, hasta);
    }

    const etiquetaMap = await getEtiquetaMap(clubId);
    const detalle = await buildDetalleCategoria({ clubId, tipo, categoria, desde, hasta, etiquetaMap });
    const total = detalle.reduce((sum, d) => sum + d.monto, 0);

    res.json({ tipo, categoria, desde, hasta, total, detalle });
  } catch (error) {
    console.error('Error calculando el detalle por categoría:', error);
    res.status(500).json({ message: 'Error al calcular el detalle por categoría' });
  }
};

export default resumenPorCategoriaHandler;
