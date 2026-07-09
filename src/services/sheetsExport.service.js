import { google } from 'googleapis';
import Socio from '../resources/socios/models/Socio.js';
import Cuota from '../resources/cuotas/models/Cuota.js';
import Cobro from '../resources/cobros/models/Cobro.js';
import Escuelita from '../resources/escuelita/models/Escuelita.js';
import Movimiento from '../resources/movimientos/models/Movimiento.js';
import Horarios from '../resources/horarios/models/Horarios.js';
import Etiqueta from '../resources/etiquetas/models/Etiqueta.js';
import Asistencia from '../resources/asistencias/models/Asistencia.js';

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

const buildCuotasMatrix = async ({ clubId, tipo, etiquetaIds = [], periodos, extraHeaders = [], extraCols = () => [] }) => {
  const socios = await Socio.find({ clubId, active: true }).sort({ apellido: 1, nombre: 1 }).lean();

  const cuotaFilter = { clubId, periodo: { $in: periodos }, active: true };
  if (etiquetaIds.length > 0) {
    cuotaFilter.$or = [{ tipo }, { etiquetaId: { $in: etiquetaIds } }];
  } else {
    cuotaFilter.tipo = tipo;
  }

  const cuotas = await Cuota.find(cuotaFilter).lean();

  const map = {};
  for (const c of cuotas) {
    const sid = c.socioId.toString();
    if (!map[sid]) map[sid] = {};
    map[sid][c.periodo] = { estado: c.estado, monto: c.montoEsperadoSnapshot };
  }

  const INFO_COLS = 4 + extraHeaders.length;
  const headers = ['N° Socio', 'Apellido', 'Nombre', 'DNI', ...extraHeaders, ...periodos.map(periodLabel), 'Meses adeudados', 'Deuda estimada'];

  const rows = socios.map((s) => {
    const sid = s._id.toString();
    const socioData = map[sid] || {};
    let adeudados = 0;
    let deuda = 0;

    const cells = periodos.map((p) => {
      const entry = socioData[p];
      if (!entry) return '';
      if (entry.estado === 'pagada') return '✓';
      if (entry.estado === 'pendiente') {
        adeudados++;
        deuda += entry.monto || 0;
        return '✗';
      }
      return '';
    });

    return [
      s.socioNumber || '',
      s.apellido || '',
      s.nombre || '',
      s.dni || '',
      ...extraCols(s),
      ...cells,
      adeudados,
      deuda > 0 ? fmtMoney(deuda) : '',
    ];
  });

  return { headers, rows, dataStartCol: INFO_COLS, dataEndCol: INFO_COLS + periodos.length };
};

const buildCuotasSocialesRows = async (clubId) => {
  const etiquetas = await Etiqueta.find({ clubId, uso_sistema: 'cuota_social', active: true }).lean();
  return buildCuotasMatrix({
    clubId, tipo: 'social',
    etiquetaIds: etiquetas.map((e) => e._id),
    periodos: generatePeriodos(24),
  });
};

const buildCuotasEscuelitaRows = async (clubId) => {
  const periodos = generatePeriodos(24);

  const alumnos = await Escuelita.find({ clubId, active: true })
    .populate('socioId', 'socioNumber nombre apellido dni _id')
    .populate('planId', 'nombre')
    .lean();

  if (alumnos.length === 0) {
    const INFO_COLS = 5;
    return {
      headers: ['N° Socio', 'Apellido', 'Nombre', 'DNI', 'Categoría', ...periodos.map(periodLabel), 'Meses adeudados', 'Deuda estimada'],
      rows: [],
      dataStartCol: INFO_COLS,
      dataEndCol: INFO_COLS + periodos.length,
    };
  }

  const socioIds = alumnos.map((a) => a.socioId?._id).filter(Boolean);
  const etiquetasEsc = await Etiqueta.find({ clubId, uso_sistema: 'cuota_escuelita', active: true }).lean();
  const etiquetaIdsEsc = etiquetasEsc.map((e) => e._id);
  const cuotaFilter = { clubId, socioId: { $in: socioIds }, periodo: { $in: periodos }, active: true };
  if (etiquetaIdsEsc.length > 0) {
    cuotaFilter.$or = [{ tipo: 'escuelita' }, { etiquetaId: { $in: etiquetaIdsEsc } }];
  } else {
    cuotaFilter.tipo = 'escuelita';
  }
  const cuotas = await Cuota.find(cuotaFilter).lean();

  const map = {};
  for (const c of cuotas) {
    const sid = c.socioId.toString();
    if (!map[sid]) map[sid] = {};
    map[sid][c.periodo] = { estado: c.estado, monto: c.montoEsperadoSnapshot };
  }

  const INFO_COLS = 5;
  const headers = ['N° Socio', 'Apellido', 'Nombre', 'DNI', 'Categoría', ...periodos.map(periodLabel), 'Meses adeudados', 'Deuda estimada'];

  const rows = alumnos.map((a) => {
    const s = a.socioId || {};
    const sid = s._id?.toString() || '';
    const socioData = map[sid] || {};
    let adeudados = 0;
    let deuda = 0;

    const cells = periodos.map((p) => {
      const entry = socioData[p];
      if (!entry) return '';
      if (entry.estado === 'pagada') return '✓';
      if (entry.estado === 'pendiente') { adeudados++; deuda += entry.monto || 0; return '✗'; }
      return '';
    });

    return [
      s.socioNumber || '', s.apellido || '', s.nombre || '', s.dni || '',
      a.planId?.nombre || '',
      ...cells,
      adeudados,
      deuda > 0 ? fmtMoney(deuda) : '',
    ];
  });

  return { headers, rows, dataStartCol: INFO_COLS, dataEndCol: INFO_COLS + periodos.length };
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

// ─── Helpers de la API de Sheets ─────────────────────────────────────────────

const TAB_NAMES = ['Socios', 'Cuotas Sociales', 'Cuotas Escuelita', 'Cobros', 'Escuelita', 'Movimientos', 'Asistencias', 'Muro Libre', 'Horarios'];

const getOrCreateSpreadsheet = async (clubName, spreadsheetId) => {
  if (spreadsheetId) return { id: spreadsheetId, isNew: false };

  const res = await sheets.spreadsheets.create({
    resource: {
      properties: { title: `${clubName} — Registro` },
      sheets: TAB_NAMES.map((title, index) => ({ properties: { sheetId: index, title, index } })),
    },
  });

  const id = res.data.spreadsheetId;
  console.log(`✅ Google Sheet creado: https://docs.google.com/spreadsheets/d/${id}`);
  console.log(`   Compartilo manualmente desde Google Drive con las autoridades del club.`);
  return { id, isNew: true };
};

const getSheetIdMap = async (spreadsheetId) => {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const map = {};
  for (const s of res.data.sheets) map[s.properties.title] = s.properties.sheetId;
  return map;
};

const ensureTabsExist = async (spreadsheetId, existingMap) => {
  const missing = TAB_NAMES.filter((n) => !(n in existingMap));
  if (missing.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
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

const buildFormatRequests = (sheetId, numCols, cuotasOpts = null) => {
  const requests = [
    // Header: bold + fondo azul + texto blanco
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLORS.headerBg,
            textFormat: { foregroundColor: COLORS.headerFg, bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    // Fila de encabezado fija (freeze)
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ];

  // Formato condicional para matriz de cuotas (solo en tabs de cuotas)
  if (cuotasOpts) {
    const { startCol, endCol } = cuotasOpts;
    requests.push(
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: '✓' }] },
              format: { backgroundColor: COLORS.green },
            },
          },
          index: 0,
        },
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: '✗' }] },
              format: { backgroundColor: COLORS.red },
            },
          },
          index: 1,
        },
      },
    );
  }

  return requests;
};

// ─── Export principal ─────────────────────────────────────────────────────────

export const exportToSheets = async ({ clubId, clubName = 'CARC', spreadsheetId: existingSpreadsheetId = null }) => {
  const [socios, cuotasSociales, cuotasEscuelita, cobros, escuelita, movimientos, asistencias, muroLibre, horarios] = await Promise.all([
    buildSociosRows(clubId),
    buildCuotasSocialesRows(clubId),
    buildCuotasEscuelitaRows(clubId),
    buildCobrosRows(clubId),
    buildEscuelitaRows(clubId),
    buildMovimientosRows(clubId),
    buildAsistenciasRows(clubId),
    buildMuroLibreRows(clubId),
    buildHorariosRows(clubId),
  ]);

  const { id: spreadsheetId, isNew } = await getOrCreateSpreadsheet(clubName, existingSpreadsheetId);

  const sheetIdMap = await getSheetIdMap(spreadsheetId);
  await ensureTabsExist(spreadsheetId, sheetIdMap);
  const allSheetIds = Object.keys(sheetIdMap).length < TAB_NAMES.length
    ? await getSheetIdMap(spreadsheetId)
    : sheetIdMap;

  const tabs = [
    { name: 'Socios',           data: socios },
    { name: 'Cuotas Sociales',  data: cuotasSociales },
    { name: 'Cuotas Escuelita', data: cuotasEscuelita },
    { name: 'Cobros',           data: cobros },
    { name: 'Escuelita',        data: escuelita },
    { name: 'Movimientos',      data: movimientos },
    { name: 'Asistencias',      data: asistencias },
    { name: 'Muro Libre',       data: muroLibre },
    { name: 'Horarios',         data: horarios },
  ];

  for (const tab of tabs) {
    await writeTab(spreadsheetId, tab.name, tab.data.headers, tab.data.rows);
  }

  // Formato: headers + formato condicional de cuotas (solo al crear el sheet)
  if (isNew) {
    const formatRequests = [];
    for (const tab of tabs) {
      const sheetId = allSheetIds[tab.name];
      if (sheetId == null) continue;
      const isCuotas = tab.name === 'Cuotas Sociales' || tab.name === 'Cuotas Escuelita';
      formatRequests.push(...buildFormatRequests(
        sheetId,
        tab.data.headers.length,
        isCuotas ? { startCol: tab.data.dataStartCol, endCol: tab.data.dataEndCol } : null,
      ));
    }
    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: formatRequests } });
    }
  }

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    stats: {
      socios: socios.rows.length,
      cuotasSociales: cuotasSociales.rows.length,
      cuotasEscuelita: cuotasEscuelita.rows.length,
      cobros: cobros.rows.length,
      escuelita: escuelita.rows.length,
      movimientos: movimientos.rows.length,
      asistencias: asistencias.rows.length,
      muroLibre: muroLibre.rows.length,
      horarios: horarios.rows.length,
    },
  };
};
