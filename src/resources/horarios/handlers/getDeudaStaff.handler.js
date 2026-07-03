import Horarios from '../models/Horarios.js';
import Precios from '../../cuotas/models/Precios.js';

const getPrecioVigente = async ({ clubId, etiquetaId, fecha }) => {
  return Precios.findOne({
    clubId,
    etiquetaId,
    active: true,
    vigenteDesde: { $lte: fecha },
    $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: fecha } }],
  })
    .sort({ vigenteDesde: -1 })
    .lean();
};

/**
 * @openapi
 * /api/horarios/deuda:
 *   get:
 *     summary: Calcular deuda del club con el staff para un período
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: periodo
 *         in: query
 *         required: true
 *         description: Período YYYY-MM
 *         schema: { type: string }
 *       - name: socioId
 *         in: query
 *         description: Filtrar por socio del staff (opcional)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deuda del club con el staff
 *       400:
 *         description: Período inválido
 *       500:
 *         description: Error al calcular deuda
 */
export const getDeudaStaffHandler = async (req, res) => {
  try {
    const { periodo, socioId } = req.query;
    const { clubId } = req.user;

    if (!periodo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
      return res.status(400).json({ message: 'periodo debe tener formato YYYY-MM' });
    }

    const [year, month] = periodo.split('-').map(Number);
    const desde = new Date(Date.UTC(year, month - 1, 1));
    const hasta = new Date(Date.UTC(year, month, 1));
    const fechaRef = new Date(Date.UTC(year, month, 0)); // último día del período para buscar precio vigente

    const filter = { clubId, active: true, fecha: { $gte: desde, $lt: hasta } };
    if (socioId) filter.socioId = socioId;

    const horarios = await Horarios.find(filter)
      .populate('socioId', 'nombre apellido')
      .populate('etiquetaId', 'nombre unidad')
      .lean();

    // Agrupar por socio
    const porSocio = {};
    for (const h of horarios) {
      const key = String(h.socioId?._id ?? h._id);
      if (!porSocio[key]) {
        porSocio[key] = {
          socioId: h.socioId?._id ?? null,
          nombre: h.socioId ? `${h.socioId.nombre} ${h.socioId.apellido}` : '(sin socio)',
          breakdown: {},
        };
      }
      const etqKey = String(h.etiquetaId?._id ?? 'sin-etiqueta');
      if (!porSocio[key].breakdown[etqKey]) {
        porSocio[key].breakdown[etqKey] = { etiqueta: h.etiquetaId, totalHoras: 0 };
      }
      porSocio[key].breakdown[etqKey].totalHoras += h.totalHoras || 0;
    }

    // Calcular montos
    const resultado = await Promise.all(
      Object.values(porSocio).map(async (persona) => {
        let totalDeuda = 0;
        const detalles = await Promise.all(
          Object.values(persona.breakdown).map(async ({ etiqueta, totalHoras }) => {
            let precioPorHora = null;
            let subtotal = null;

            if (etiqueta?._id) {
              const precio = await getPrecioVigente({ clubId, etiquetaId: etiqueta._id, fecha: fechaRef });
              precioPorHora = precio?.monto ?? null;
              subtotal = precioPorHora !== null ? totalHoras * precioPorHora : null;
            }

            if (subtotal !== null) totalDeuda += subtotal;

            return {
              etiqueta: etiqueta ? { _id: etiqueta._id, nombre: etiqueta.nombre } : null,
              totalHoras: Math.round(totalHoras * 100) / 100,
              precioPorHora,
              subtotal,
              sinPrecio: precioPorHora === null,
            };
          }),
        );

        return { socioId: persona.socioId, nombre: persona.nombre, periodo, detalles, totalDeuda };
      }),
    );

    return res.status(200).json(resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  } catch (error) {
    console.error('Error calculando deuda staff:', error);
    return res.status(500).json({ message: 'Error al calcular deuda del staff' });
  }
};

export default getDeudaStaffHandler;
