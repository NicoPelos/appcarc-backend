import Asistencia from '../../asistencias/models/Asistencia.js';
import { ADVERTENCIA } from '../../../constants/advertenciaCodes.js';

const CODIGOS_VALIDOS = Object.values(ADVERTENCIA);
const TIPOS_VALIDOS = ['escuelita', 'muro_libre'];

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
 *         schema: { type: string, enum: [escuelita, muro_libre] }
 *       - in: query
 *         name: codigo
 *         schema: { type: string, enum: [CUOTA_SOCIAL_IMPAGA, CUOTA_IMPAGA, LIMITE_SEMANAL, PASE_MENSUAL_IMPAGO] }
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
      return res.status(400).json({ message: 'El tipo debe ser escuelita o muro_libre' });
    }
    if (codigo && !CODIGOS_VALIDOS.includes(codigo)) {
      return res.status(400).json({ message: `Código inválido. Válidos: ${CODIGOS_VALIDOS.join(', ')}` });
    }

    const desde = new Date();
    desde.setDate(desde.getDate() - diasNum);

    const filter = {
      clubId,
      active: true,
      'advertencias.0': { $exists: true },
      fecha: { $gte: desde },
    };
    if (tipo) filter.tipo = tipo;
    if (codigo) filter['advertencias.codigo'] = codigo;

    const [total, docs] = await Promise.all([
      Asistencia.countDocuments(filter),
      Asistencia.find(filter)
        .populate('socioId', 'telefono')
        .sort({ fecha: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    const items = docs.map((doc) => {
      const telefono = doc.socioId?.telefono ?? null;
      return {
        ...doc,
        telefono,
        waLink: buildWaLink(telefono, doc.nombre, doc.advertencias),
        socioId: doc.socioId?._id ?? doc.socioId,
      };
    });

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
