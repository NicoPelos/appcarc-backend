import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Cobro from '../../cobros/models/Cobro.js';
import Movimiento, { CATEGORIAS_MOVIMIENTO } from '../models/Movimiento.js';

// Compartido entre el export a Google Sheets (sheetsExport.service.js,
// pestaña Resumen) y GET /api/movimientos/resumen-por-categoria — antes esta
// lógica vivía privada dentro de sheetsExport.service.js, atada a un rango
// fijo de 12 meses; se extrajo para poder pedir cualquier rango de fechas
// desde una pantalla (ver appCARC-web Dashboard, "Ingresos por categoría").

// Mapa {etiquetaId: {nombre, uso_sistema}} de todas las etiquetas del club —
// lo usan Cobros (para saber qué se cobró en cada item), Datos y Resumen.
export const getEtiquetaMap = async (clubId) => {
  const etiquetas = await Etiqueta.find({ clubId }).lean();
  const map = {};
  for (const e of etiquetas) map[e._id.toString()] = { nombre: e.nombre, uso_sistema: e.uso_sistema };
  return map;
};

// Categoriza un item de Cobro (siempre tiene etiquetaId) por su uso_sistema o,
// si no matchea nada específico, por si el nombre de la etiqueta menciona
// "adultos" (las clases de adultos son Suscripcion normales, no tienen un
// uso_sistema propio distinto de escuelita hoy).
//
// BUG histórico corregido acá (2026-09-09): el parámetro se llamaba
// `usoSistema` (camelCase) pero getEtiquetaMap (y por lo tanto TODOS los
// callers reales) siempre pasan `uso_sistema` (snake_case, igual que el
// modelo Etiqueta) — quedaba siempre undefined → default '', así que
// NINGÚN item de Cobro categorizaba nunca por uso_sistema. "Cuota Social"
// y "Muro Libre" pagados vía Registrar Cobro (no en el momento del
// check-in) caían siempre en "Otros"; "Escuela Niños"/"Escuela Adultos"
// se salvaban a medias porque además matchean por el nombre de la
// etiqueta. Nunca se notó porque este cálculo solo alimentaba el export a
// Sheets — nadie llegó a auditar el desglose ítem por ítem hasta ahora.
export const categoriaIngresoPorEtiqueta = ({ nombre = '', uso_sistema = '' }) => {
  const usoSistema = uso_sistema || '';
  if (usoSistema === 'cuota_social') return 'Cuota Social';
  if (/adultos/i.test(nombre)) return 'Escuela Adultos';
  // No solo la etiqueta con uso_sistema 'cuota_escuelita' — hay otras por
  // plan (X1 vs X2, appcarc-backend#156) que no tienen ese uso_sistema
  // seteado, pero sí dicen "escuelita" en el nombre.
  if (usoSistema === 'cuota_escuelita' || /escuelita/i.test(nombre)) return 'Escuela Niños';
  if (usoSistema.startsWith('muro_libre')) return 'Muro Libre';
  return 'Otros';
};

// Los ingresos/egresos cargados a mano (sourceType:'manual') ya tienen un
// campo Movimiento.categoria real (issue #55) — se usa directo. Estas dos
// funciones de palabras clave quedan solo como red de seguridad para
// registros viejos que quedaron sin categoria por algún motivo (no debería
// pasar después del backfill, pero mejor no perder esa plata del resumen si
// pasa).
export const categoriaIngresoManual = (m) => {
  if (m.categoria) return m.categoria;
  const c = (m.concept || '').toLowerCase();
  if (/trekking|treking|treeking|viaje/.test(c)) return 'Viajes';
  if (/muro|boulder/.test(c)) return 'Muro Libre';
  if (/adulto/.test(c)) return 'Escuela Adultos';
  if (/clases?\s*ni|escuelita|juvenil/.test(c)) return 'Escuela Niños';
  if (/cuota social/.test(c)) return 'Cuota Social';
  return 'Otros';
};

export const categoriaEgresoManual = (m) => {
  if (m.categoria) return m.categoria;
  const c = (m.concept || '').toLowerCase();
  if (/honorario/.test(c)) return 'Honorarios';
  if (/alquiler|epec|federaci[oó]n patronal|federaci[oó]n andinista|impuesto/.test(c)) return 'Costos Fijos';
  return 'Varios';
};

export const CATEGORIAS_INGRESO = [
  'Cuota Social', 'Escuela Niños', 'Escuela Adultos', 'Muro Libre',
  ...CATEGORIAS_MOVIMIENTO.Ingreso,
];
export const CATEGORIAS_EGRESO = [...CATEGORIAS_MOVIMIENTO.Egreso];

const sumarEn = (map, key, monto) => { map[key] = (map[key] || 0) + (monto || 0); };

// `hasta` es opcional (sin tope superior) para no romper al caller original
// (sheetsExport.service.js, ventana fija de 12 meses hacia atrás desde hoy).
export const buildIngresosEgresosPorCategoria = async ({ clubId, desde, hasta, etiquetaMap }) => {
  const ingresos = Object.fromEntries(CATEGORIAS_INGRESO.map((c) => [c, 0]));
  const egresos = Object.fromEntries(CATEGORIAS_EGRESO.map((c) => [c, 0]));

  const dateFilter = { $gte: desde };
  if (hasta) dateFilter.$lte = hasta;

  const movimientos = await Movimiento.find({ clubId, active: true, date: dateFilter })
    .select('type sourceType sourceId concept categoria amount')
    .lean();

  const cobroIds = movimientos.filter((m) => m.sourceType === 'cobro' && m.sourceId).map((m) => m.sourceId);
  const cobros = cobroIds.length
    ? await Cobro.find({ _id: { $in: cobroIds } }).select('items').lean()
    : [];
  const cobroMap = Object.fromEntries(cobros.map((c) => [c._id.toString(), c]));

  for (const m of movimientos) {
    if (m.type === 'Ingreso') {
      if (m.sourceType === 'cobro') {
        const cobro = cobroMap[m.sourceId?.toString()];
        if (cobro) {
          for (const item of cobro.items) {
            const etiqueta = etiquetaMap[item.etiquetaId?.toString()] || {};
            sumarEn(ingresos, categoriaIngresoPorEtiqueta(etiqueta), item.amount);
          }
        }
      } else if (m.sourceType === 'muro_libre') {
        sumarEn(ingresos, 'Muro Libre', m.amount);
      } else {
        sumarEn(ingresos, categoriaIngresoManual(m), m.amount);
      }
    } else if (m.type === 'Egreso') {
      sumarEn(egresos, categoriaEgresoManual(m), m.amount);
    }
  }

  return {
    ingresos: CATEGORIAS_INGRESO.map((c) => [c, ingresos[c]]),
    egresos: CATEGORIAS_EGRESO.map((c) => [c, egresos[c]]),
  };
};
