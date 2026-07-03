import { randomBytes } from 'crypto';
import Horarios from '../models/Horarios.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/horarios:
 *   post:
 *     summary: Crear un nuevo horario
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, nombre]
 *             properties:
 *               fecha:
 *                 type: string
 *                 format: date
 *               nombre:
 *                 type: string
 *               horaEntrada:
 *                 type: string
 *                 format: date-time
 *               horaSalida:
 *                 type: string
 *                 format: date-time
 *               totalHoras:
 *                 type: number
 *               tipoTarea:
 *                 type: string
 *               observaciones:
 *                 type: string
 *     responses:
 *       201:
 *         description: Horario creado exitosamente
 *       400:
 *         description: Error en los datos enviados
 *       500:
 *         description: Error al crear horario
 */
const ROLES_EDIT_ALL = ['admin', 'secretaria', 'autoridad', 'superadmin'];

export const createHorarioHandler = async (req, res) => {
  try {
    const { fecha, nombre, horaEntrada, horaSalida, totalHoras, tipoTarea, observaciones } = req.body;

    const canEditAll = req.user?.roles?.some(r => ROLES_EDIT_ALL.includes(r));
    if (!canEditAll && !req.user?.socioId) {
      return res.status(403).json({ message: 'Tu usuario no tiene un perfil de socio asociado para registrar horarios' });
    }

    if (!fecha) return res.status(400).json({ message: 'La fecha es obligatoria' });
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) return res.status(400).json({ message: 'La fecha es inválida' });

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    if (horaEntrada) {
      const d = new Date(horaEntrada);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'La hora de entrada es inválida' });
    }

    if (horaSalida) {
      const d = new Date(horaSalida);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'La hora de salida es inválida' });
    }

    const horario = new Horarios({
      idHorarios: randomBytes(4).toString('hex'),
      clubId: req.user?.clubId,
      socioId: canEditAll ? (req.body.socioId ?? null) : req.user.socioId,
      fecha: fechaDate,
      nombre: nombre.trim(),
      horaEntrada: horaEntrada ? new Date(horaEntrada) : undefined,
      horaSalida: horaSalida ? new Date(horaSalida) : undefined,
      totalHoras: totalHoras ?? undefined,
      tipoTarea: tipoTarea || '',
      observaciones: observaciones || '',
      createdBy: req.user?.email ?? req.user?.id,
      updatedBy: req.user?.email ?? req.user?.id,
    });

    await horario.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Horarios', resourceId: horario._id, before: null, after: horario.toObject() });
    res.status(201).json(horario);
  } catch (error) {
    console.error('Error creando horario:', error);
    res.status(500).json({ message: 'Error al crear horario' });
  }
};
