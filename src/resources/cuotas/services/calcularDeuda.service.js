import Cuota from '../models/Cuota.js';
import Precios from '../models/Precios.js';
import Socio from '../../socios/models/Socio.js';
import Escuelita from '../../escuelita/models/Escuelita.js';

const PRECIO_CODIGO = {
  social: 'cuota_social',
  escuelita: 'cuota_escuelita',
};

const periodoHoy = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const addOneMonth = (periodo) => {
  const [year, month] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const dateToUTCPeriodo = (date) => {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const expandPeriodos = (desde, hasta) => {
  const periodos = [];
  let current = desde;
  while (current <= hasta) {
    periodos.push(current);
    current = addOneMonth(current);
    if (periodos.length > 600) break; // guardia: max 50 años
  }
  return periodos;
};

const getFallbackDesde = async ({ socioId, clubId, tipo }) => {
  if (tipo === 'social') {
    const socio = await Socio.findOne({ _id: socioId, clubId }).lean();
    return socio?.fechaDeAsociado ? dateToUTCPeriodo(socio.fechaDeAsociado) : null;
  }

  if (tipo === 'escuelita') {
    const alumno = await Escuelita.findOne({ socioId, clubId, active: true }).lean();
    if (!alumno) return undefined; // undefined = no es alumno, distinto de null = sin fecha
    return alumno.fechaInscripcion ? dateToUTCPeriodo(alumno.fechaInscripcion) : null;
  }

  return null;
};

// Retorna null si el socio no aplica para ese tipo (ej: no es alumno de escuelita)
export const calcularDeuda = async ({ socioId, clubId, tipo }) => {
  const hoy = periodoHoy();

  const ultimaCuota = await Cuota.findOne({
    socioId,
    clubId,
    tipo,
    estado: 'pagada',
    periodo: { $lte: hoy },
  })
    .sort({ periodo: -1 })
    .lean();

  let desde;

  if (ultimaCuota) {
    desde = addOneMonth(ultimaCuota.periodo);
  } else {
    const fallback = await getFallbackDesde({ socioId, clubId, tipo });

    if (fallback === undefined) return null; // no es alumno de escuelita

    if (!fallback) {
      return {
        ultimoPeriodoPagado: null,
        periodoActual: hoy,
        mesesDeuda: 0,
        periodos: [],
        precioUnitario: null,
        totalDeuda: null,
        advertencia: tipo === 'social'
          ? 'El socio no tiene fecha de asociado ni cuotas registradas.'
          : 'El alumno no tiene fecha de inscripción ni cuotas registradas.',
      };
    }

    desde = fallback;
  }

  if (desde > hoy) {
    return {
      ultimoPeriodoPagado: ultimaCuota?.periodo ?? null,
      periodoActual: hoy,
      mesesDeuda: 0,
      periodos: [],
      precioUnitario: null,
      totalDeuda: 0,
    };
  }

  const candidatos = expandPeriodos(desde, hoy);

  const pagadas = await Cuota.find({
    socioId,
    clubId,
    tipo,
    estado: 'pagada',
    periodo: { $in: candidatos },
  }).lean();

  const pagadasSet = new Set(pagadas.map((c) => c.periodo));
  const pendientes = candidatos.filter((p) => !pagadasSet.has(p));

  const ahora = new Date();
  const precio = await Precios.findOne({
    clubId,
    codigo: PRECIO_CODIGO[tipo],
    active: true,
    vigenteDesde: { $lte: ahora },
    $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: ahora } }],
  })
    .sort({ vigenteDesde: -1 })
    .lean();

  const precioUnitario = precio?.monto ?? null;
  const totalDeuda = precioUnitario !== null ? pendientes.length * precioUnitario : null;

  return {
    ultimoPeriodoPagado: ultimaCuota?.periodo ?? null,
    periodoActual: hoy,
    mesesDeuda: pendientes.length,
    periodos: pendientes,
    precioUnitario,
    totalDeuda,
  };
};
