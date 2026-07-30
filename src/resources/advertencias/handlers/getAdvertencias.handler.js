import Asistencia from '../../asistencias/models/Asistencia.js';
import Advertencia from '../models/Advertencia.js';
import { ADVERTENCIA } from '../../../constants/advertenciaCodes.js';

const CODIGOS_VALIDOS = Object.values(ADVERTENCIA);
const TIPOS_VALIDOS = ['escuelita', 'muro_libre', 'morosidad'];

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
      asistenciaItems = docs.map((doc) => {
        const telefono = doc.socioId?.telefono ?? null;
        return {
          ...doc,
          telefono,
          waLink: buildWaLink(telefono, doc.nombre, doc.advertencias),
          socioId: doc.socioId?._id ?? doc.socioId,
        };
      });
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
