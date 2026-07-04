import Escuelita from '../models/Escuelita.js';
import Cuota from '../../cuotas/models/Cuota.js';
import Asistencia from '../../asistencias/models/Asistencia.js';
import { resolveSocioFromQrTokenOrDni, BusinessError } from '../../socios/services/socioQr.service.js';
import { ADVERTENCIA } from '../../../constants/advertenciaCodes.js';

const periodoActual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Lunes a domingo de la semana actual en Argentina (UTC-3)
const getWeekBounds = () => {
  const OFFSET_MS = -3 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() + OFFSET_MS);
  const day = localNow.getUTCDay(); // 0=Dom, 1=Lun...
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(localNow);
  monday.setUTCDate(localNow.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  // Convertir de hora local a UTC para comparar con fechas almacenadas
  return {
    start: new Date(monday.getTime() - OFFSET_MS),
    end:   new Date(sunday.getTime() - OFFSET_MS),
  };
};

/**
 * @openapi
 * /api/escuelita/checkin:
 *   post:
 *     summary: Registrar asistencia a escuelita
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token QR del socio
 *               dni:
 *                 type: string
 *                 description: DNI del socio
 *               observaciones:
 *                 type: string
 *     responses:
 *       201:
 *         description: Asistencia registrada
 *       402:
 *         description: Sin cuota pagada o límite de clases alcanzado
 *       404:
 *         description: Socio o alumno no encontrado
 *       500:
 *         description: Error al registrar asistencia
 */
export const checkinEscuelitaHandler = async (req, res) => {
  try {
    const { token, dni, observaciones } = req.body;
    const { clubId } = req.user;
    const actor = req.user.email || req.user.id;

    // 1. Identificar socio por QR o DNI
    const { socio, method } = await resolveSocioFromQrTokenOrDni({
      token,
      dni,
      clubId,
      missingMessage: 'Se requiere token QR o DNI',
      dniNotFoundMessage: 'Socio no encontrado por DNI',
    });

    // 2. Buscar inscripción activa en escuelita
    const alumno = await Escuelita.findOne({ clubId, socioId: socio._id, active: true })
      .populate('planId', 'nombre atributos');

    if (!alumno) {
      return res.status(404).json({ message: 'El socio no está inscripto en la escuelita' });
    }

    if (alumno.estado !== 'activo') {
      return res.status(402).json({ message: `La inscripción está en estado "${alumno.estado}"` });
    }

    const plan = alumno.planId;
    const frecuenciaSemanal = plan?.atributos?.frecuenciaSemanal ?? 1;

    const advertencias = [];
    const periodo = periodoActual();

    // 3a. Verificar cuota social del mes (advertencia, no bloquea)
    const cuotaSocial = await Cuota.findOne({
      clubId,
      socioId: socio._id,
      tipo: 'social',
      periodo,
      estado: 'pagada',
    }).lean();

    if (!cuotaSocial) {
      advertencias.push({
        codigo: ADVERTENCIA.CUOTA_SOCIAL_IMPAGA,
        mensaje: `Sin cuota social pagada para ${periodo}`,
      });
    }

    // 3b. Verificar cuota de escuelita del mes (advertencia, no bloquea)
    const cuotaPagada = await Cuota.findOne({
      clubId,
      socioId: socio._id,
      tipo: 'escuelita',
      periodo,
      estado: 'pagada',
    }).lean();

    if (!cuotaPagada) {
      advertencias.push({
        codigo: ADVERTENCIA.CUOTA_IMPAGA,
        mensaje: `Sin cuota de escuelita pagada para ${periodo}`,
      });
    }

    // 4. Contar clases de esta semana (advertencia, no bloquea)
    const { start, end } = getWeekBounds();
    const clasesEstaSemana = await Asistencia.countDocuments({
      clubId,
      socioId: socio._id,
      tipo: 'escuelita',
      active: true,
      fecha: { $gte: start, $lte: end },
    });

    if (clasesEstaSemana >= frecuenciaSemanal) {
      advertencias.push({
        codigo: ADVERTENCIA.LIMITE_SEMANAL,
        mensaje: `Ya registró ${clasesEstaSemana} clase${clasesEstaSemana !== 1 ? 's' : ''} esta semana (límite: ${frecuenciaSemanal})`,
      });
    }

    // 5. Verificar que no haya asistencia registrada hoy (bloqueo duro)
    const OFFSET_MS = -3 * 60 * 60 * 1000;
    const localNow = new Date(Date.now() + OFFSET_MS);
    const startOfDayLocal = new Date(localNow);
    startOfDayLocal.setUTCHours(0, 0, 0, 0);
    const endOfDayLocal = new Date(localNow);
    endOfDayLocal.setUTCHours(23, 59, 59, 999);
    const startUTC = new Date(startOfDayLocal.getTime() - OFFSET_MS);
    const endUTC = new Date(endOfDayLocal.getTime() - OFFSET_MS);

    const asistenciaHoy = await Asistencia.findOne({
      clubId,
      socioId: socio._id,
      tipo: 'escuelita',
      active: true,
      fecha: { $gte: startUTC, $lte: endUTC },
    }).lean();

    if (asistenciaHoy) {
      return res.status(409).json({
        message: `${socio.nombre} ${socio.apellido} ya registró asistencia hoy`,
      });
    }

    // 6. Registrar asistencia
    const asistencia = await Asistencia.create({
      clubId,
      tipo: 'escuelita',
      socioId: socio._id,
      nombre: socio.nombre,
      apellido: socio.apellido,
      dni: socio.dni,
      esSocio: true,
      fecha: new Date(),
      categoria: plan?.nombre || '',
      advertencias,
      observaciones: String(observaciones || '').trim(),
      checkinMethod: method,
      scannedBy: req.user.id,
      createdBy: actor,
      updatedBy: actor,
    });

    return res.status(201).json({
      asistencia,
      socio: { _id: socio._id, nombre: socio.nombre, apellido: socio.apellido },
      clasesEstaSemana: clasesEstaSemana + 1,
      limiteClases: frecuenciaSemanal,
      advertencias,
    });
  } catch (error) {
    if (error instanceof BusinessError || error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error en checkin escuelita:', error);
    return res.status(500).json({ message: 'Error al registrar asistencia' });
  }
};

export default checkinEscuelitaHandler;
