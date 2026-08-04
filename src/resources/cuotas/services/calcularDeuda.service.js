import Cuota from '../models/Cuota.js';
import Precios from '../models/Precios.js';
import Suscripcion from '../../suscripciones/models/Suscripcion.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
import CargoPuntual from '../../cargosPuntuales/models/CargoPuntual.js';

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
 * Cargos que no son mensuales/por suscripción: pases DIARIOS de Muro Libre
 * pagados "pendiente" en el momento del check-in. Los pases MENSUALES no
 * entran acá — desde que el check-in mensual suscribe al socio (ver
 * registrarMuroLibre.service.js), esa deuda ya la cubre calcularDeudaSuscripciones
 * a través de la Suscripcion real. Se acumulan en un array genérico de "otros
 * cargos" para que a futuro cualquier otro cobro por evento/uso (salidas,
 * alquileres, etc.) se sume acá con el mismo formato, sin volver a cambiar el
 * contrato de /api/socios/:id/deuda.
 */
const calcularCargoMuroLibre = async ({ socioId, clubId }) => {
  const pendientes = await Asistencia.find({
    clubId,
    socioId,
    tipo: 'muro_libre',
    tipoPase: 'diario',
    active: true,
    estadoPago: 'pendiente',
  }).select('fecha precioSugeridoSnapshot tipoPase').sort({ fecha: 1 }).lean();

  if (!pendientes.length) return null;

  return {
    tipo: 'muro_libre',
    nombre: 'Muro Libre',
    cantidadPendiente: pendientes.length,
    unidadPendiente: 'visita',
    fechas: pendientes.map((p) => p.fecha),
    totalDeuda: pendientes.reduce((sum, p) => sum + (p.precioSugeridoSnapshot ?? 0), 0),
  };
};

/**
 * Cargos puntuales atribuidos manualmente desde secretaría (viajes, inscripciones,
 * etc. — ver src/resources/cargosPuntuales). A diferencia de calcularCargoMuroLibre,
 * cada uno se muestra como una entrada individual (no agregada) porque cada cargo
 * puntual es un concepto distinto con su propio importe.
 */
const calcularCargosPuntuales = async ({ socioId, clubId }) => {
  const pendientes = await CargoPuntual.find({
    clubId,
    socioId,
    estado: 'pendiente',
    active: true,
  })
    .populate('etiquetaId', 'nombre')
    .sort({ createdAt: 1 })
    .lean();

  return pendientes.map((c) => ({
    tipo: 'cargo_puntual',
    cargoPuntualId: c._id,
    nombre: c.etiquetaId?.nombre ?? 'Cargo puntual',
    descripcion: c.description,
    totalDeuda: c.montoEsperadoSnapshot,
  }));
};

const calcularOtrosCargos = async ({ socioId, clubId }) => {
  const [muroLibre, cargosPuntuales] = await Promise.all([
    calcularCargoMuroLibre({ socioId, clubId }),
    calcularCargosPuntuales({ socioId, clubId }),
  ]);

  return [muroLibre, ...cargosPuntuales].filter(Boolean);
};

/**
 * Calcula la deuda de un socio basándose en sus suscripciones activas.
 * Retorna un array de deudas, una por suscripción.
 */
const calcularDeudaSuscripciones = async ({ socioId, clubId }) => {
  const hoy = periodoHoy();
  const ahora = new Date();

  // Ojo: no filtrar por fechaHasta >= hoy acá. Una suscripción cerrada con
  // fecha pasada puede seguir teniendo períodos sin pagar dentro de su propio
  // rango (ej. al excluir un mes puntual con /excluir-periodo, el tramo viejo
  // queda con fechaHasta pasado pero puede deber meses anteriores) — cada
  // suscripción ya acota sus propios "candidatos" a [fechaDesde, fechaHasta]
  // más abajo, así que no hace falta (ni conviene) descartarla acá.
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

      if (sus.exento) {
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
          exento: true,
        };
      }

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

export const calcularDeuda = async ({ socioId, clubId }) => {
  const [suscripciones, otrosCargos] = await Promise.all([
    calcularDeudaSuscripciones({ socioId, clubId }),
    calcularOtrosCargos({ socioId, clubId }),
  ]);

  return { suscripciones, otrosCargos };
};
