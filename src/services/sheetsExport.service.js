import { google } from 'googleapis';
import Socio from '../resources/socios/models/Socio.js';
import Cuota from '../resources/cuotas/models/Cuota.js';
import Suscripcion from '../resources/suscripciones/models/Suscripcion.js';
import Cobro from '../resources/cobros/models/Cobro.js';
import Escuelita from '../resources/escuelita/models/Escuelita.js';
import Movimiento from '../resources/movimientos/models/Movimiento.js';
import Horarios from '../resources/horarios/models/Horarios.js';
import Etiqueta from '../resources/etiquetas/models/Etiqueta.js';
import Asistencia from '../resources/asistencias/models/Asistencia.js';
import Advertencia from '../resources/advertencias/models/Advertencia.js';
import { calcularDeuda } from '../resources/cuotas/services/calcularDeuda.service.js';
import { ADVERTENCIA } from '../constants/advertenciaCodes.js';

const auth = new google.auth.GoogleAuth({
  keyFile: 'google-credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ─── Colores ──────────────────────────────────────────────────────────────────
const COLORS = {
  headerBg:  { red: 0.17, green: 0.35, blue: 0.62 },
  headerFg:  { red: 1,    green: 1,    blue: 1    },
  green:     { red: 0.72, green: 0.88, blue: 0.80 },
  red:       { red: 0.96, green: 0.79, blue: 0.79 },
  deuda1:    { red: 1,    green: 0.95, blue: 0.70 }, // 1-2 meses
  deuda2:    { red: 0.98, green: 0.80, blue: 0.45 }, // 3-5 meses
  deuda3:    { red: 0.90, green: 0.45, blue: 0.38 }, // 6+ meses
};

const TAB_COLOR = {
  Resumen: { red: 0.17, green: 0.35, blue: 0.62 },
  Activos:    { red: 0.72, green: 0.88, blue: 0.80 },
  Adherentes: { red: 0.75, green: 0.85, blue: 0.95 },
  Bajas:      { red: 0.85, green: 0.85, blue: 0.85 },
  Datos:      { red: 0.93, green: 0.93, blue: 0.88 },
};

const ESTADOS = ['Activo', 'Adherente', 'Baja'];
const ESTADO_TAB_SUFFIJO = { Activo: 'Activos', Adherente: 'Adherentes', Baja: 'Bajas' };

// ─── Helpers de formato de valores ────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const fmtTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const fmtMoney = (n) => (n != null ? `$${Number(n).toLocaleString('es-AR')}` : '');

const generatePeriodos = (months = 24) => {
  const periods = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
};

const periodLabel = (p) => {
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const [year, month] = p.split('-');
  return `${MESES[parseInt(month, 10) - 1]}-${year.slice(2)}`;
};

// ─── Constructores de datos por pestaña ──────────────────────────────────────

const buildSociosRows = async (clubId) => {
  const headers = [
    'N° Socio', 'Apellido', 'Nombre', 'DNI', 'Sexo', 'Fecha Nacimiento',
    'Email', 'Teléfono', 'Tel. Emergencia', 'Ciudad',
    'Estado', 'Condición', 'Observaciones', 'Fecha de Asociado',
  ];
  const socios = await Socio.find({ clubId, active: true }).sort({ apellido: 1, nombre: 1 }).lean();
  const rows = socios.map((s) => [
    s.socioNumber || '',
    s.apellido || '',
    s.nombre || '',
    s.dni || '',
    s.sexo || '',
    fmtDate(s.fechaNacimiento),
    s.correoElectronico || '',
    s.telefono || '',
    s.telefonoEmergencia || '',
    s.ciudad || '',
    s.estado || '',
    s.condicionObs || '',
    s.observaciones || '',
    fmtDate(s.fechaDeAsociado),
  ]);
  return { headers, rows };
};

// Una suscripción exenta nunca genera Cuota (calcularDeuda.service.js corta
// antes) — sin esto, los períodos cubiertos por una suscripción exenta
// quedarían en blanco en la matriz en vez de marcarse como al día.
const buildExentoMap = async ({ clubId, etiquetaIds, periodos }) => {
  const suscripciones = await Suscripcion.find({
    clubId, etiquetaId: { $in: etiquetaIds }, active: true, exento: true,
  }).lean();

  const map = {};
  for (const s of suscripciones) {
    const sid = s.socioId.toString();
    if (!map[sid]) map[sid] = new Set();
    const hasta = s.fechaHasta || periodos[periodos.length - 1];
    for (const p of periodos) {
      if (p >= s.fechaDesde && p <= hasta) map[sid].add(p);
    }
  }
  return map;
};

// Deuda "real" por socio para una etiqueta puntual (cuota_social o
// cuota_escuelita), usando el mismo calcularDeuda que ya confía el resto del
// sistema (job de morosidad, pantalla de deuda del socio) — en vez de contar
// a mano cuántas Cuota quedaron con estado:'pendiente'. Esto importa porque
// una Cuota 'pendiente' hoy solo existe si vino de la migración histórica del
// Excel viejo: la deuda que se genera de acá en adelante nunca crea ese
// registro, así que contar 'pendiente' subestima (o directamente no detecta)
// deuda nueva. Un socio puede tener más de un tramo de suscripción a la misma
// etiqueta (ver caso Zurita #191) — se suman los mesesDeuda y se unen los
// períodos pendientes de todos los tramos que matchean.
const CONCURRENCIA_DEUDA = 25;
const buildDeudaMap = async ({ clubId, socios, usoSistema }) => {
  const map = {};
  for (let i = 0; i < socios.length; i += CONCURRENCIA_DEUDA) {
    const chunk = socios.slice(i, i + CONCURRENCIA_DEUDA);
    await Promise.all(chunk.map(async (s) => {
      const sid = s._id.toString();
      try {
        const deuda = await calcularDeuda({ socioId: s._id, clubId });
        const relevantes = deuda.suscripciones.filter((sub) => sub.etiqueta?.uso_sistema === usoSistema);
        const pendientes = new Set();
        let mesesDeuda = 0;
        for (const sub of relevantes) {
          mesesDeuda += sub.mesesDeuda || 0;
          for (const p of sub.periodos || []) pendientes.add(p);
        }
        map[sid] = { pendientes, mesesDeuda };
      } catch {
        map[sid] = { pendientes: new Set(), mesesDeuda: 0 };
      }
    }));
  }
  return map;
};

// Núcleo compartido de la matriz de cuotas (mes a mes, ✓/✗) — lo usan tanto
// Cuotas Sociales como Cuotas Escuelita, cada una resolviendo su propia lista
// de "socios" (todo el padrón para Sociales, solo los inscriptos para
// Escuelita) antes de llamar acá.
const buildCuotasMatrixRows = async ({ clubId, socios, etiquetaIds, usoSistema, periodos, extraHeaders = [], extraCols = () => [] }) => {
  const INFO_COLS = 4 + extraHeaders.length;
  const headers = ['N° Socio', 'Apellido', 'Nombre', 'DNI', ...extraHeaders, ...periodos.map(periodLabel), 'Meses adeudados'];

  if (socios.length === 0) {
    return { headers, rows: [], dataStartCol: INFO_COLS, dataEndCol: INFO_COLS + periodos.length, adeudadosCol: INFO_COLS + periodos.length };
  }

  const cuotaFilter = { clubId, periodo: { $in: periodos }, active: true, etiquetaId: { $in: etiquetaIds }, socioId: { $in: socios.map((s) => s._id) } };
  const [cuotas, exentoMap, deudaMap] = await Promise.all([
    Cuota.find(cuotaFilter).lean(),
    buildExentoMap({ clubId, etiquetaIds, periodos }),
    buildDeudaMap({ clubId, socios, usoSistema }),
  ]);

  const map = {};
  for (const c of cuotas) {
    const sid = c.socioId.toString();
    if (!map[sid]) map[sid] = {};
    map[sid][c.periodo] = c.estado;
  }

  const rows = socios.map((s) => {
    const sid = s._id.toString();
    const socioData = map[sid] || {};
    const exentoPeriodos = exentoMap[sid];
    const deuda = deudaMap[sid] || { pendientes: new Set(), mesesDeuda: 0 };

    const cells = periodos.map((p) => {
      if (exentoPeriodos?.has(p)) return '✓';
      const estado = socioData[p];
      if (estado === 'pagada') return '✓';
      if (estado === 'pendiente' || deuda.pendientes.has(p)) return '✗';
      return '';
    });

    return [
      s.socioNumber || '', s.apellido || '', s.nombre || '', s.dni || '',
      ...extraCols(s),
      ...cells,
      deuda.mesesDeuda,
    ];
  });

  return { headers, rows, dataStartCol: INFO_COLS, dataEndCol: INFO_COLS + periodos.length, adeudadosCol: INFO_COLS + periodos.length };
};

export const buildCuotasSocialesRowsPorEstado = async (clubId, estado) => {
  const periodos = generatePeriodos(24);
  const [socios, etiquetas] = await Promise.all([
    Socio.find({ clubId, active: true, estado }).sort({ apellido: 1, nombre: 1 }).lean(),
    Etiqueta.find({ clubId, uso_sistema: 'cuota_social', active: true }).lean(),
  ]);
  return buildCuotasMatrixRows({
    clubId, socios, etiquetaIds: etiquetas.map((e) => e._id), usoSistema: 'cuota_social', periodos,
  });
};

export const buildCuotasEscuelitaRowsPorEstado = async (clubId, estado) => {
  const periodos = generatePeriodos(24);
  const alumnos = await Escuelita.find({ clubId, active: true })
    .populate('socioId', 'socioNumber nombre apellido dni estado _id')
    .populate('planId', 'nombre')
    .lean();

  const filtrados = alumnos.filter((a) => a.socioId?.estado === estado);
  const socios = filtrados.map((a) => ({ ...a.socioId, _planNombre: a.planId?.nombre || '' }));
  const etiquetas = await Etiqueta.find({ clubId, uso_sistema: 'cuota_escuelita', active: true }).lean();

  return buildCuotasMatrixRows({
    clubId, socios, etiquetaIds: etiquetas.map((e) => e._id), usoSistema: 'cuota_escuelita', periodos,
    extraHeaders: ['Categoría'], extraCols: (s) => [s._planNombre || ''],
  });
};

const buildCobrosRows = async (clubId) => {
  const headers = ['Fecha', 'N° Socio', 'Apellido', 'Nombre', 'Tipo', 'Período', 'Monto', 'Método', 'Responsable'];
  const cobros = await Cobro.find({ clubId, active: true })
    .sort({ date: -1 })
    .populate({ path: 'items.socioId', select: 'socioNumber nombre apellido' })
    .lean();

  const rows = [];
  for (const c of cobros) {
    for (const item of c.items) {
      const s = item.socioId || {};
      rows.push([fmtDate(c.date), s.socioNumber || '', s.apellido || '', s.nombre || '',
        item.tipo, item.periodo, fmtMoney(item.amount), c.paymentMethod, c.responsable]);
    }
  }
  return { headers, rows };
};

const buildEscuelitaRows = async (clubId) => {
  const headers = ['N° Socio', 'Apellido', 'Nombre', 'DNI', 'Categoría', 'Frec/sem', 'Estado', 'Inscripción'];
  const alumnos = await Escuelita.find({ clubId, active: true })
    .populate('socioId', 'socioNumber nombre apellido dni')
    .populate('planId', 'nombre atributos')
    .sort({ createdAt: -1 })
    .lean();

  const rows = alumnos.map((a) => {
    const s = a.socioId || {};
    return [
      s.socioNumber || '', s.apellido || '', s.nombre || '', s.dni || '',
      a.planId?.nombre || '',
      a.planId?.atributos?.frecuenciaSemanal ? `${a.planId.atributos.frecuenciaSemanal}x semana` : '',
      a.estado,
      fmtDate(a.fechaInscripcion),
    ];
  });
  return { headers, rows };
};

const buildMovimientosRows = async (clubId) => {
  const headers = ['Fecha', 'Tipo', 'Concepto', 'Monto', 'Método', 'Responsable'];
  const movimientos = await Movimiento.find({ clubId, active: true }).sort({ date: -1 }).lean();
  const rows = movimientos.map((m) => [
    fmtDate(m.date), m.type, m.concept || m.description || '',
    fmtMoney(m.amount), m.paymentMethod, m.responsable,
  ]);
  return { headers, rows };
};

const buildHorariosRows = async (clubId) => {
  const headers = ['Fecha', 'Apellido', 'Nombre', 'Tarea', 'Hora Entrada', 'Hora Salida', 'Horas Totales', 'Observaciones'];
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 12);
  desde.setDate(1);

  const horarios = await Horarios.find({ clubId, active: true, fecha: { $gte: desde } })
    .populate('socioId', 'nombre apellido')
    .populate('etiquetaId', 'nombre')
    .sort({ fecha: -1 })
    .lean();

  const rows = horarios.map((h) => [
    fmtDate(h.fecha),
    h.socioId?.apellido || '',
    h.socioId?.nombre || '',
    h.etiquetaId?.nombre || '',
    fmtTime(h.horaEntrada),
    fmtTime(h.horaSalida),
    h.totalHoras != null ? h.totalHoras : '',
    h.observaciones || '',
  ]);
  return { headers, rows };
};

const buildAsistenciasRows = async (clubId) => {
  const headers = [
    'Fecha', 'Tipo', 'Apellido', 'Nombre', 'DNI', 'Es Socio',
    'Categoría', 'Tipo Pase', 'Estado Pago', 'Monto', 'Forma Pago', 'Observaciones',
  ];
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 12);
  desde.setDate(1);

  const asistencias = await Asistencia.find({ clubId, active: true, fecha: { $gte: desde } })
    .sort({ fecha: -1 })
    .lean();

  const TIPO_LABEL = { muro_libre: 'Muro Libre', escuelita: 'Escuelita' };

  const rows = asistencias.map((a) => [
    fmtDate(a.fecha),
    TIPO_LABEL[a.tipo] || a.tipo,
    a.apellido || '',
    a.nombre || '',
    a.dni || '',
    a.esSocio ? 'Sí' : 'No',
    a.categoria || '',
    a.tipoPase || '',
    a.estadoPago || '',
    a.monto ? fmtMoney(a.monto) : '',
    a.formaPago || '',
    a.observaciones || '',
  ]);
  return { headers, rows };
};

const buildMuroLibreRows = async (clubId) => {
  const headers = ['Fecha', 'Apellido', 'Nombre', 'DNI', 'Es Socio', 'Tipo Pase', 'Estado Pago', 'Monto', 'Forma Pago', 'Período', 'Observaciones'];
  const asistencias = await Asistencia.find({ clubId, tipo: 'muro_libre', active: true })
    .sort({ fecha: -1 })
    .lean();
  const rows = asistencias.map((a) => [
    fmtDate(a.fecha),
    a.apellido || '',
    a.nombre || '',
    a.dni || '',
    a.esSocio ? 'Sí' : 'No',
    a.tipoPase || '',
    a.estadoPago || '',
    a.monto ? fmtMoney(a.monto) : '',
    a.formaPago || '',
    a.periodo || '',
    a.observaciones || '',
  ]);
  return { headers, rows };
};

// Formato "largo"/tidy: una fila por cuota real (socio + etiqueta + período).
// Pensada para que cualquiera arme sus propias tablas dinámicas o gráficos en
// Sheets — las pestañas de matriz (una columna por mes) son perfectas para
// leer a simple vista, pero imposibles de pivotear directamente.
export const buildDatosLargoRows = async (clubId) => {
  const headers = ['N° Socio', 'Apellido', 'Nombre', 'Estado Socio', 'Etiqueta', 'Período', 'Estado Cuota', 'Monto', 'Fecha de Pago'];
  const ESTADO_LABEL = { pagada: 'Pagada', pendiente: 'Pendiente', anulada: 'Anulada' };

  const etiquetas = await Etiqueta.find({ clubId, active: true, uso_sistema: { $in: ['cuota_social', 'cuota_escuelita'] } }).lean();
  if (etiquetas.length === 0) return { headers, rows: [] };
  const etiquetaMap = {};
  etiquetas.forEach((e) => { etiquetaMap[e._id.toString()] = e.nombre; });

  const cuotas = await Cuota.find({ clubId, active: true, etiquetaId: { $in: etiquetas.map((e) => e._id) } })
    .populate('socioId', 'socioNumber nombre apellido estado')
    .sort({ periodo: 1 })
    .lean();

  const rows = cuotas
    .filter((c) => c.socioId)
    .map((c) => {
      const s = c.socioId;
      return [
        s.socioNumber || '', s.apellido || '', s.nombre || '', s.estado || '',
        etiquetaMap[c.etiquetaId?.toString()] || '',
        c.periodo,
        ESTADO_LABEL[c.estado] || c.estado,
        c.montoPagadoSnapshot || c.montoEsperadoSnapshot || '',
        fmtDate(c.fechaPago),
      ];
    });

  return { headers, rows };
};

// ─── Resumen (portada con números clave + gráficos) ──────────────────────────

const RESUMEN_LAYOUT = {
  estadoHeaderRow: 4, // fila 5 (1-indexed)
  estadoDataRows: 3,
  recaudacionHeaderRow: 4, // fila 5, columna D
  recaudacionDataRows: 12,
};

export const buildResumenData = async (clubId) => {
  const [activos, adherentes, bajas, morosos] = await Promise.all([
    Socio.countDocuments({ clubId, active: true, estado: 'Activo' }),
    Socio.countDocuments({ clubId, active: true, estado: 'Adherente' }),
    Socio.countDocuments({ clubId, active: true, estado: 'Baja' }),
    Advertencia.countDocuments({ clubId, codigo: ADVERTENCIA.MOROSIDAD_CUOTA_SOCIAL, estado: 'abierta' }),
  ]);

  const mesesOrden = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    mesesOrden.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const desde = new Date();
  desde.setDate(1);
  desde.setMonth(desde.getMonth() - 11);
  desde.setHours(0, 0, 0, 0);

  const movimientos = await Movimiento.find({ clubId, active: true, type: 'Ingreso', date: { $gte: desde } })
    .select('date amount')
    .lean();

  const porMes = Object.fromEntries(mesesOrden.map((k) => [k, 0]));
  for (const m of movimientos) {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (porMes[key] !== undefined) porMes[key] += m.amount || 0;
  }

  return {
    estados: [['Activo', activos], ['Adherente', adherentes], ['Baja', bajas]],
    recaudacion: mesesOrden.map((k) => [periodLabel(k), porMes[k]]),
    morosos,
    totalVigentes: activos + adherentes,
    actualizado: `${fmtDate(new Date())} ${fmtTime(new Date())}`,
  };
};

const writeResumenTab = async (spreadsheetId, resumen) => {
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'Resumen'!A:Z` });

  const { estadoHeaderRow, recaudacionHeaderRow } = RESUMEN_LAYOUT;
  const values = [];
  values[0] = ['Resumen del club'];
  values[1] = [`Actualizado: ${resumen.actualizado}`];
  values[estadoHeaderRow] = ['Estado', 'Cantidad', '', 'Mes', 'Recaudado'];
  resumen.estados.forEach((row, i) => { values[estadoHeaderRow + 1 + i] = row; });
  resumen.recaudacion.forEach((row, i) => {
    const r = recaudacionHeaderRow + 1 + i;
    values[r] = [...(values[r] || ['', '', '']), ...row];
  });
  const morososRow = estadoHeaderRow + 1 + resumen.estados.length + 1;
  values[morososRow] = ['Socios con 3+ meses de deuda', resumen.morosos];
  values[morososRow + 1] = ['Socios vigentes (Activos + Adherentes)', resumen.totalVigentes];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Resumen'!A1`,
    valueInputOption: 'RAW',
    resource: { values },
  });
};

const buildResumenFormatAndCharts = (sheetId, resumen) => {
  const { estadoHeaderRow, estadoDataRows, recaudacionHeaderRow, recaudacionDataRows } = RESUMEN_LAYOUT;
  const requests = [
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: estadoHeaderRow, endRowIndex: estadoHeaderRow + 1, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { backgroundColor: COLORS.headerBg, textFormat: { foregroundColor: COLORS.headerFg, bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    {
      addChart: {
        chart: {
          spec: {
            title: 'Socios por estado',
            pieChart: {
              legendPosition: 'RIGHT_LEGEND',
              domain: { sourceRange: { sources: [{ sheetId, startRowIndex: estadoHeaderRow + 1, endRowIndex: estadoHeaderRow + 1 + estadoDataRows, startColumnIndex: 0, endColumnIndex: 1 }] } },
              series: { sourceRange: { sources: [{ sheetId, startRowIndex: estadoHeaderRow + 1, endRowIndex: estadoHeaderRow + 1 + estadoDataRows, startColumnIndex: 1, endColumnIndex: 2 }] } },
            },
          },
          position: { overlayPosition: { anchorCell: { sheetId, rowIndex: estadoHeaderRow + estadoDataRows + 3, columnIndex: 0 }, widthPixels: 420, heightPixels: 260 } },
        },
      },
    },
    {
      addChart: {
        chart: {
          spec: {
            title: 'Recaudación mensual (últimos 12 meses)',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NO_LEGEND',
              axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
              domains: [{ domain: { sourceRange: { sources: [{ sheetId, startRowIndex: recaudacionHeaderRow + 1, endRowIndex: recaudacionHeaderRow + 1 + recaudacionDataRows, startColumnIndex: 3, endColumnIndex: 4 }] } } }],
              series: [{ series: { sourceRange: { sources: [{ sheetId, startRowIndex: recaudacionHeaderRow + 1, endRowIndex: recaudacionHeaderRow + 1 + recaudacionDataRows, startColumnIndex: 4, endColumnIndex: 5 }] } } }],
            },
          },
          position: { overlayPosition: { anchorCell: { sheetId, rowIndex: estadoHeaderRow + estadoDataRows + 3, columnIndex: 5 }, widthPixels: 520, heightPixels: 260 } },
        },
      },
    },
  ];
  return requests;
};

// ─── Helpers de la API de Sheets ─────────────────────────────────────────────

const CUOTAS_TAB_NAMES = ESTADOS.flatMap((estado) => [
  `Cuotas Soc. — ${ESTADO_TAB_SUFFIJO[estado]}`,
  `Cuotas Esc. — ${ESTADO_TAB_SUFFIJO[estado]}`,
]);

const TAB_NAMES = ['Resumen', 'Socios', ...CUOTAS_TAB_NAMES, 'Cobros', 'Escuelita', 'Movimientos', 'Asistencias', 'Muro Libre', 'Horarios', 'Datos'];

const getOrCreateSpreadsheet = async (clubName, spreadsheetId) => {
  if (spreadsheetId) return { id: spreadsheetId, isNew: false };

  const res = await sheets.spreadsheets.create({
    resource: {
      properties: { title: `${clubName} — Registro` },
      sheets: TAB_NAMES.map((title, index) => ({ properties: { sheetId: index, title, index } })),
    },
  });
  const id = res.data.spreadsheetId;
  return { id, isNew: true };
};

const getSheetIdMap = async (spreadsheetId) => {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const map = {};
  for (const s of res.data.sheets) map[s.properties.title] = s.properties.sheetId;
  return map;
};

const ensureTabsExist = async (spreadsheetId, existingMap) => {
  const missing = TAB_NAMES.filter((t) => !(t in existingMap));
  if (missing.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
};

// Pestañas de una versión anterior de este export (ej. la vieja "Cuotas
// Sociales" combinada, reemplazada por el split en Activos/Adherentes/Bajas)
// quedan huérfanas: ya no se reescriben, pero siguen ahí mostrando datos
// congelados — confunden más de lo que ayudan. Se llama después de
// ensureTabsExist, así siempre queda al menos una pestaña viva antes de
// borrar el resto.
const removeOrphanTabs = async (spreadsheetId, existingMap) => {
  const orphanIds = Object.entries(existingMap)
    .filter(([title]) => !TAB_NAMES.includes(title))
    .map(([, sheetId]) => sheetId);
  if (orphanIds.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: orphanIds.map((sheetId) => ({ deleteSheet: { sheetId } })) },
  });
};

const writeTab = async (spreadsheetId, tabName, headers, rows) => {
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tabName}'!A:ZZ` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'RAW',
    resource: { values: [headers, ...rows] },
  });
};

// Los charts y las reglas de formato condicional son "addX": si se vuelven a
// pedir en cada corrida (el job corre todos los días a las 3am) se apilan sin
// límite. Antes de reconstruir el formato de cada corrida, se borra todo lo
// existente en cada pestaña para que quede siempre exactamente un juego
// limpio, no más.
const clearExistingDecorations = async (spreadsheetId) => {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties.sheetId,conditionalFormats,charts.chartId)' });
  const requests = [];
  for (const sheet of res.data.sheets) {
    const sheetId = sheet.properties.sheetId;
    const cfCount = sheet.conditionalFormats?.length || 0;
    for (let i = cfCount - 1; i >= 0; i--) {
      requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
    }
    for (const chart of sheet.charts || []) {
      requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
  }
};

const buildFormatRequests = (sheetId, numCols, cuotasOpts = null) => {
  const requests = [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
        cell: { userEnteredFormat: { backgroundColor: COLORS.headerBg, textFormat: { foregroundColor: COLORS.headerFg, bold: true } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ];

  if (cuotasOpts) {
    const { startCol, endCol, adeudadosCol } = cuotasOpts;
    requests.push(
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: startCol } }, fields: 'gridProperties.frozenColumnCount' } },
      { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: '✓' }] }, format: { backgroundColor: COLORS.green } } }, index: 0 } },
      { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: '✗' }] }, format: { backgroundColor: COLORS.red } } }, index: 1 } },
      { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: adeudadosCol, endColumnIndex: adeudadosCol + 1 }], booleanRule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '6' }] }, format: { backgroundColor: COLORS.deuda3 } } }, index: 2 } },
      { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: adeudadosCol, endColumnIndex: adeudadosCol + 1 }], booleanRule: { condition: { type: 'NUMBER_BETWEEN', values: [{ userEnteredValue: '3' }, { userEnteredValue: '5' }] }, format: { backgroundColor: COLORS.deuda2 } } }, index: 3 } },
      { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: adeudadosCol, endColumnIndex: adeudadosCol + 1 }], booleanRule: { condition: { type: 'NUMBER_BETWEEN', values: [{ userEnteredValue: '1' }, { userEnteredValue: '2' }] }, format: { backgroundColor: COLORS.deuda1 } } }, index: 4 } },
    );
  }

  return requests;
};

const tabColorFor = (tabName) => {
  if (tabName === 'Resumen') return TAB_COLOR.Resumen;
  if (tabName === 'Datos') return TAB_COLOR.Datos;
  for (const estado of ESTADOS) {
    if (tabName.endsWith(ESTADO_TAB_SUFFIJO[estado])) return TAB_COLOR[ESTADO_TAB_SUFFIJO[estado]];
  }
  return null;
};

// ─── Export principal ─────────────────────────────────────────────────────────

export const exportToSheets = async ({ clubId, clubName = 'CARC', spreadsheetId: existingSpreadsheetId = null }) => {
  const [
    socios, cobros, escuelita, movimientos, asistencias, muroLibre, horarios, datos, resumenData,
    ...cuotasPorEstado
  ] = await Promise.all([
    buildSociosRows(clubId),
    buildCobrosRows(clubId),
    buildEscuelitaRows(clubId),
    buildMovimientosRows(clubId),
    buildAsistenciasRows(clubId),
    buildMuroLibreRows(clubId),
    buildHorariosRows(clubId),
    buildDatosLargoRows(clubId),
    buildResumenData(clubId),
    ...ESTADOS.map((estado) => buildCuotasSocialesRowsPorEstado(clubId, estado)),
    ...ESTADOS.map((estado) => buildCuotasEscuelitaRowsPorEstado(clubId, estado)),
  ]);

  const cuotasSociales = ESTADOS.map((_, i) => cuotasPorEstado[i]);
  const cuotasEscuelita = ESTADOS.map((_, i) => cuotasPorEstado[ESTADOS.length + i]);

  const { id: spreadsheetId, isNew } = await getOrCreateSpreadsheet(clubName, existingSpreadsheetId);

  const sheetIdMap = await getSheetIdMap(spreadsheetId);
  await ensureTabsExist(spreadsheetId, sheetIdMap);
  await removeOrphanTabs(spreadsheetId, sheetIdMap);
  const allSheetIds = await getSheetIdMap(spreadsheetId);

  const tabs = [
    { name: 'Socios', data: socios },
    ...ESTADOS.map((estado, i) => ({ name: `Cuotas Soc. — ${ESTADO_TAB_SUFFIJO[estado]}`, data: cuotasSociales[i], esCuotas: true })),
    ...ESTADOS.map((estado, i) => ({ name: `Cuotas Esc. — ${ESTADO_TAB_SUFFIJO[estado]}`, data: cuotasEscuelita[i], esCuotas: true })),
    { name: 'Cobros', data: cobros },
    { name: 'Escuelita', data: escuelita },
    { name: 'Movimientos', data: movimientos },
    { name: 'Asistencias', data: asistencias },
    { name: 'Muro Libre', data: muroLibre },
    { name: 'Horarios', data: horarios },
    { name: 'Datos', data: datos },
  ];

  for (const tab of tabs) {
    await writeTab(spreadsheetId, tab.name, tab.data.headers, tab.data.rows);
  }
  await writeResumenTab(spreadsheetId, resumenData);

  // Formato: se rehace siempre (no solo al crear la planilla), porque las
  // pestañas de estado son nuevas para cualquier planilla que ya existiera
  // antes de este cambio. clearExistingDecorations evita que se acumulen
  // charts/reglas duplicadas en cada corrida diaria.
  await clearExistingDecorations(spreadsheetId);
  const formatRequests = [];
  for (const tab of tabs) {
    const sheetId = allSheetIds[tab.name];
    if (sheetId == null) continue;
    formatRequests.push(...buildFormatRequests(
      sheetId,
      tab.data.headers.length,
      tab.esCuotas ? { startCol: tab.data.dataStartCol, endCol: tab.data.dataEndCol, adeudadosCol: tab.data.adeudadosCol } : null,
    ));
    const color = tabColorFor(tab.name);
    if (color) formatRequests.push({ updateSheetProperties: { properties: { sheetId, tabColor: color }, fields: 'tabColor' } });
  }
  const resumenSheetId = allSheetIds['Resumen'];
  if (resumenSheetId != null) {
    formatRequests.push(...buildResumenFormatAndCharts(resumenSheetId, resumenData));
    formatRequests.push({ updateSheetProperties: { properties: { sheetId: resumenSheetId, tabColor: TAB_COLOR.Resumen }, fields: 'tabColor' } });
  }
  if (formatRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: formatRequests } });
  }

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    stats: {
      socios: socios.rows.length,
      cuotasSociales: cuotasSociales.map((c) => c.rows.length),
      cuotasEscuelita: cuotasEscuelita.map((c) => c.rows.length),
      cobros: cobros.rows.length,
      escuelita: escuelita.rows.length,
      movimientos: movimientos.rows.length,
      asistencias: asistencias.rows.length,
      muroLibre: muroLibre.rows.length,
      horarios: horarios.rows.length,
      datos: datos.rows.length,
      morosos: resumenData.morosos,
    },
  };
};
