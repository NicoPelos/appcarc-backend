import Movimiento from '../models/Movimiento.js';
import Socio from '../../socios/models/Socio.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';

const buildDetalle = async (movimientos) => {
  const socioIds = new Set();
  const etiquetaIds = new Set();

  for (const m of movimientos) {
    if (m.sourceModel === 'Cobro' && m.sourceId?.items) {
      for (const item of m.sourceId.items) {
        if (item.socioId) socioIds.add(String(item.socioId));
        if (item.etiquetaId) etiquetaIds.add(String(item.etiquetaId));
      }
    }
  }

  const [socios, etiquetas] = await Promise.all([
    socioIds.size
      ? Socio.find({ _id: { $in: [...socioIds] } }, 'socioNumber nombre apellido dni').lean()
      : [],
    etiquetaIds.size
      ? Etiqueta.find({ _id: { $in: [...etiquetaIds] } }, 'nombre').lean()
      : [],
  ]);

  const socioMap = new Map(socios.map((s) => [String(s._id), s]));
  const etiquetaMap = new Map(etiquetas.map((e) => [String(e._id), e]));

  return movimientos.map((m) => {
    let detalle = null;

    if (m.sourceModel === 'Cobro' && m.sourceId?.items) {
      detalle = m.sourceId.items.map((item) => {
        const socio = socioMap.get(String(item.socioId));
        const etiqueta = etiquetaMap.get(String(item.etiquetaId));
        return {
          socioId: item.socioId,
          socioNumber: socio?.socioNumber || '',
          nombre: socio?.nombre || '',
          apellido: socio?.apellido || '',
          etiqueta: etiqueta?.nombre || '',
          periodo: item.periodo,
          amount: item.amount,
        };
      });
    } else if (m.sourceModel === 'Asistencia' && m.sourceId) {
      detalle = [{
        socioId: m.sourceId.socioId || null,
        nombre: m.sourceId.nombre || '',
        apellido: m.sourceId.apellido || '',
        esSocio: m.sourceId.esSocio,
        periodo: m.sourceId.periodo || '',
        tipoPase: m.sourceId.tipoPase || null,
      }];
    }

    return { ...m, detalle };
  });
};

/**
 * @openapi
 * /api/movimientos:
 *   get:
 *     summary: Obtener lista de movimientos
 *     tags: [Movimientos]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         required: false
 *         description: Cantidad de resultados por página
 *       - in: query
 *         name: socioId
 *         schema:
 *           type: string
 *         required: false
 *         description: Filtrar movimientos de un socio en particular (solo cobros/muro libre de un único socio)
 *     responses:
 *       200:
 *         description: Lista de movimientos obtenida exitosamente
 *       500:
 *         description: Error al obtener movimientos
 */

export const getMovimientosHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, trash, type, socioId } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const showTrash = trash === 'true';
    const filter = { clubId: req.user?.clubId, active: !showTrash };
    if (type && ['Ingreso', 'Egreso'].includes(type)) filter.type = type;
    if (socioId) filter.socioId = socioId;

    const [total, movimientosRaw] = await Promise.all([
      Movimiento.countDocuments(filter),
      Movimiento.find(filter)
        .sort({ date: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .populate('sourceId')
        .lean(),
    ]);

    const movimientos = await buildDetalle(movimientosRaw);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      movimientos,
    });
  } catch (error) {
    console.error('Error obteniendo movimientos:', error);
    res.status(500).json({ message: 'Error al obtener movimientos' });
  }
};
