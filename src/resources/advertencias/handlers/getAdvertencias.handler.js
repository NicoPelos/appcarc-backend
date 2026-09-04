import Asistencia from '../../asistencias/models/Asistencia.js';
import Advertencia from '../models/Advertencia.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import Escuelita from '../../escuelita/models/Escuelita.js';
import { ADVERTENCIA } from '../../../constants/advertenciaCodes.js';
import { periodoDeFecha } from '../../../services/fechaArgentina.js';

const CODIGOS_VALIDOS = Object.values(ADVERTENCIA);
const TIPOS_VALIDOS = ['escuelita', 'muro_libre', 'morosidad'];

// CUOTA_SOCIAL_IMPAGA/CUOTA_IMPAGA/PASE_MENSUAL_IMPAGO quedan congeladas en
// el check-in que las generó — sin re-chequeo, secretaría las vería "sin
// pagar" para siempre aunque el socio ya haya pagado. Se re-evalúan acá
// contra el estado actual de la Cuota para que la lista funcione como
// worklist (desaparece sola a medida que se van pagando). LIMITE_SEMANAL
// queda afuera a propósito: es un hecho puntual de comportamiento, no algo
// que se "pague y resuelva".
//
// CUOTA_IMPAGA (escuelita) no tiene una única etiqueta global — depende del
// plan del socio (X1 vs X2, Adultos, etc.), solo una de esas etiquetas tiene
// uso_sistema 'cuota_escuelita' (appcarc-backend#156). Se resuelve aparte,
// por socio, vía su inscripción activa → plan → etiquetaId.
const USO_SISTEMA_POR_CODIGO = {
  [ADVERTENCIA.CUOTA_SOCIAL_IMPAGA]: 'cuota_social',
  [ADVERTENCIA.PASE_MENSUAL_IMPAGO]: 'muro_libre_mensual_socio',
};

// Mismo período que calculó cada flujo de check-in al generar la advertencia
// — escuelita usa periodoDeFecha (ajusta a hora argentina), muro libre usa
// el mes UTC crudo de la fecha (inconsistencia preexistente entre ambos
// servicios, no se toca acá; solo hace falta replicarla para reconsultar el
// mismo período que se guardó en su momento).
const periodoDeAdvertencia = (asistencia) => (
  asistencia.tipo === 'escuelita'
    ? periodoDeFecha(new Date(asistencia.fecha))
    : `${new Date(asistencia.fecha).getUTCFullYear()}-${String(new Date(asistencia.fecha).getUTCMonth() + 1).padStart(2, '0')}`
);

const formatWaPhone = (telefono) => {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `549${digits.slice(1)}`;
  return `549${digits}`;
};

const buildWaLink = (telefono, nombre, advertencias) => {
  const phone = formatWaPhone(telefono);
  if (!phone) return null;
  const lista = advertencias.map((a) => `• ${a.mensaje}`).join('\n');
  const text = encodeURIComponent(
    `Hola ${nombre}, te contactamos del club. En tu último ingreso registramos las siguientes advertencias:\n${lista}\nPor favor pasate por secretaría para regularizarlas. ¡Gracias!`,
  );
  return `https://wa.me/${phone}?text=${text}`;
};

/**
 * @openapi
 * /api/advertencias:
 *   get:
 *     summary: Listar asistencias con advertencias
 *     tags: [Advertencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dias
 *         schema: { type: integer, default: 30 }
 *         description: Cantidad de días hacia atrás a consultar (máx 365)
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [escuelita, muro_libre, morosidad] }
 *       - in: query
 *         name: codigo
 *         schema: { type: string, enum: [CUOTA_SOCIAL_IMPAGA, CUOTA_IMPAGA, LIMITE_SEMANAL, PASE_MENSUAL_IMPAGO, MOROSIDAD_CUOTA_SOCIAL] }
 *         description: Filtrar por código de advertencia específico
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista paginada de asistencias con advertencias
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error al obtener advertencias
 */
export const getAdvertenciasHandler = async (req, res) => {
  try {
    const { clubId } = req.user;
    const { dias = 30, tipo, codigo, page = 1, limit = 20 } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const diasNum = Math.min(Math.max(parseInt(dias, 10) || 30, 1), 365);

    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ message: 'El tipo debe ser escuelita, muro_libre o morosidad' });
    }
    if (codigo && !CODIGOS_VALIDOS.includes(codigo)) {
      return res.status(400).json({ message: `Código inválido. Válidos: ${CODIGOS_VALIDOS.join(', ')}` });
    }

    const desde = new Date();
    desde.setDate(desde.getDate() - diasNum);

    // Advertencias ligadas a un check-in puntual (escuelita/muro_libre), embebidas en Asistencia.
    let asistenciaItems = [];
    if (!tipo || tipo === 'escuelita' || tipo === 'muro_libre') {
      const filter = {
        clubId,
        active: true,
        'advertencias.0': { $exists: true },
        fecha: { $gte: desde },
      };
      if (tipo) filter.tipo = tipo;
      if (codigo) filter['advertencias.codigo'] = codigo;

      const docs = await Asistencia.find(filter).populate('socioId', 'telefono').sort({ fecha: -1 }).lean();

      const codigosResolubles = [...Object.keys(USO_SISTEMA_POR_CODIGO), ADVERTENCIA.CUOTA_IMPAGA];
      const necesitaChequeo = docs.some((d) => d.advertencias.some((a) => codigosResolubles.includes(a.codigo)));

      let etiquetaIdPorUso = new Map();
      let etiquetaEscuelitaPorSocio = new Map();
      let pagadasSet = new Set();
      if (necesitaChequeo) {
        const socioIds = [...new Set(docs.filter((d) => d.socioId).map((d) => String(d.socioId._id ?? d.socioId)))];

        const usosSistema = [...new Set(Object.values(USO_SISTEMA_POR_CODIGO))];
        const etiquetas = await Etiqueta.find({ clubId, uso_sistema: { $in: usosSistema }, active: true }).lean();
        etiquetaIdPorUso = new Map(etiquetas.map((e) => [e.uso_sistema, String(e._id)]));

        // CUOTA_IMPAGA no tiene una única etiqueta global — depende del plan
        // de cada socio (X1/X2, Adultos, etc.) — se resuelve por su
        // inscripción activa en escuelita.
        const necesitaEscuelita = docs.some((d) => d.advertencias.some((a) => a.codigo === ADVERTENCIA.CUOTA_IMPAGA));
        if (necesitaEscuelita && socioIds.length) {
          const alumnos = await Escuelita.find({ clubId, socioId: { $in: socioIds }, active: true })
            .populate('planId', 'etiquetaId')
            .select('socioId planId')
            .lean();
          etiquetaEscuelitaPorSocio = new Map(
            alumnos.filter((al) => al.planId?.etiquetaId).map((al) => [String(al.socioId), String(al.planId.etiquetaId)]),
          );
        }

        const etiquetaIds = [...new Set([...etiquetaIdPorUso.values(), ...etiquetaEscuelitaPorSocio.values()])];
        if (socioIds.length && etiquetaIds.length) {
          const cuotasPagadas = await Cuota.find({
            clubId, estado: 'pagada', socioId: { $in: socioIds }, etiquetaId: { $in: etiquetaIds },
          }).select('socioId etiquetaId periodo').lean();
          pagadasSet = new Set(cuotasPagadas.map((c) => `${c.socioId}:${c.etiquetaId}:${c.periodo}`));
        }
      }

      asistenciaItems = docs
        .map((doc) => {
          const socioIdStr = doc.socioId ? String(doc.socioId._id ?? doc.socioId) : null;
          const periodo = periodoDeAdvertencia(doc);
          const advertenciasVigentes = doc.advertencias.filter((a) => {
            const etiquetaId = a.codigo === ADVERTENCIA.CUOTA_IMPAGA
              ? (socioIdStr && etiquetaEscuelitaPorSocio.get(socioIdStr))
              : etiquetaIdPorUso.get(USO_SISTEMA_POR_CODIGO[a.codigo] ?? '');
            const esResoluble = a.codigo === ADVERTENCIA.CUOTA_IMPAGA || Boolean(USO_SISTEMA_POR_CODIGO[a.codigo]);
            if (!esResoluble) return true; // no resoluble (ej. LIMITE_SEMANAL): se mantiene siempre
            if (!socioIdStr || !etiquetaId) return true; // sin datos para chequear, no se oculta por las dudas
            return !pagadasSet.has(`${socioIdStr}:${etiquetaId}:${periodo}`);
          });
          if (advertenciasVigentes.length === 0) return null; // ya se resolvieron todas — sale de la worklist

          const telefono = doc.socioId?.telefono ?? null;
          return {
            ...doc,
            advertencias: advertenciasVigentes,
            telefono,
            waLink: buildWaLink(telefono, doc.nombre, advertenciasVigentes),
            socioId: doc.socioId?._id ?? doc.socioId,
          };
        })
        .filter((item) => item !== null);
    }

    // Advertencias de estado (morosidad), independientes de check-ins: se muestran
    // mientras sigan abiertas, sin importar cuándo se detectaron (no aplica "dias").
    let morosidadItems = [];
    if ((!tipo || tipo === 'morosidad') && (!codigo || codigo === ADVERTENCIA.MOROSIDAD_CUOTA_SOCIAL)) {
      const docs = await Advertencia.find({ clubId, estado: 'abierta' })
        .populate('socioId', 'telefono')
        .sort({ ultimaRevision: -1 })
        .lean();
      morosidadItems = docs.map((doc) => {
        const telefono = doc.socioId?.telefono ?? null;
        const advertencias = [{ codigo: doc.codigo, mensaje: doc.mensaje }];
        return {
          _id: doc._id,
          tipo: 'morosidad',
          fecha: doc.ultimaRevision,
          nombre: doc.nombre,
          apellido: doc.apellido,
          telefono,
          advertencias,
          waLink: buildWaLink(telefono, doc.nombre, advertencias),
          socioId: doc.socioId?._id ?? doc.socioId,
        };
      });
    }

    const merged = [...asistenciaItems, ...morosidadItems].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
    const total = merged.length;
    const items = merged.slice((pageNumber - 1) * pageSize, (pageNumber - 1) * pageSize + pageSize);

    return res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      advertencias: items,
    });
  } catch (error) {
    console.error('Error obteniendo advertencias:', error);
    return res.status(500).json({ message: 'Error al obtener advertencias' });
  }
};
