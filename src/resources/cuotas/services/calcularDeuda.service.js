import Cuota from '../models/Cuota.js';
import Precios from '../models/Precios.js';
import Suscripcion from '../../suscripciones/models/Suscripcion.js';

const periodoHoy = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const addOneMonth = (periodo) => {
  const [year, month] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const expandPeriodos = (desde, hasta) => {
  const periodos = [];
  let current = desde;
  while (current <= hasta) {
    periodos.push(current);
    current = addOneMonth(current);
    if (periodos.length > 600) break;
  }
  return periodos;
};

const getPrecioVigente = async ({ clubId, etiquetaId, fecha }) => {
  return Precios.findOne({
    clubId,
    etiquetaId,
    active: true,
    vigenteDesde: { $lte: fecha },
    $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: fecha } }],
  })
    .sort({ vigenteDesde: -1 })
    .populate('etiquetaId', 'nombre unidad uso_sistema')
    .lean();
};

/**
 * Calcula la deuda de un socio basándose en sus suscripciones activas.
 * Retorna un array de deudas, una por suscripción.
 */
export const calcularDeuda = async ({ socioId, clubId }) => {
  const hoy = periodoHoy();
  const ahora = new Date();

  const suscripciones = await Suscripcion.find({
    socioId,
    clubId,
    active: true,
  })
    .populate('etiquetaId', 'nombre unidad uso_sistema')
    .lean();

  if (!suscripciones.length) return [];

  const resultados = await Promise.all(
    suscripciones.map(async (sus) => {
      const desde = sus.fechaDesde;
      const hasta = sus.fechaHasta || hoy;

      if (desde > hoy) {
        return {
          suscripcionId: sus._id,
          etiqueta: sus.etiquetaId,
          fechaDesde: sus.fechaDesde,
          fechaHasta: sus.fechaHasta,
          ultimoPeriodoPagado: null,
          periodoActual: hoy,
          mesesDeuda: 0,
          periodos: [],
          precioUnitario: null,
          totalDeuda: 0,
        };
      }

      const candidatos = expandPeriodos(desde, hasta);

      const [ultimaCuota, pagadas] = await Promise.all([
        Cuota.findOne({
          socioId,
          clubId,
          suscripcionId: sus._id,
          estado: 'pagada',
          periodo: { $lte: hoy },
        })
          .sort({ periodo: -1 })
          .lean(),
        Cuota.find({
          socioId,
          clubId,
          suscripcionId: sus._id,
          estado: 'pagada',
          periodo: { $in: candidatos },
        }).lean(),
      ]);

      const pagadasSet = new Set(pagadas.map((c) => c.periodo));
      const pendientes = candidatos.filter((p) => !pagadasSet.has(p));

      const precio = await getPrecioVigente({
        clubId,
        etiquetaId: sus.etiquetaId._id,
        fecha: ahora,
      });

      const precioUnitario = precio?.monto ?? null;

      return {
        suscripcionId: sus._id,
        etiqueta: sus.etiquetaId,
        fechaDesde: sus.fechaDesde,
        fechaHasta: sus.fechaHasta,
        ultimoPeriodoPagado: ultimaCuota?.periodo ?? null,
        periodoActual: hoy,
        mesesDeuda: pendientes.length,
        periodos: pendientes,
        precioUnitario,
        totalDeuda: precioUnitario !== null ? pendientes.length * precioUnitario : null,
      };
    }),
  );

  return resultados;
};
