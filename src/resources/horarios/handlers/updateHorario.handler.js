import Horarios from '../models/Horarios.js';
import { logAudit } from '../../audit/services/audit.service.js';

const ROLES_EDIT_ALL = ['admin', 'secretaria', 'autoridad', 'superadmin'];

/**
 * @openapi
 * /api/horarios/{id}:
 *   put:
 *     summary: Actualizar un horario
 *     tags: [Horarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
 *       200:
 *         description: Horario actualizado exitosamente
 *       400:
 *         description: Error en los datos enviados
 *       404:
 *         description: Horario no encontrado
 *       500:
 *         description: Error al actualizar horario
 */
export const updateHorarioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, nombre, horaEntrada, horaSalida, totalHoras, tipoTarea, observaciones } = req.body;

    const horario = await Horarios.findOne({ _id: id, active: true });
    if (!horario) return res.status(404).json({ message: 'Horario no encontrado' });

    const canEditAll = req.user?.roles?.some(r => ROLES_EDIT_ALL.includes(r));
    if (!canEditAll && horario.socioId?.toString() !== req.user?.socioId) {
      return res.status(403).json({ message: 'No tenés permiso para modificar el horario de otro integrante' });
    }

    const horarioAntes = horario.toObject();

    if (fecha !== undefined) {
      const d = new Date(fecha);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'La fecha es inválida' });
      horario.fecha = d;
    }

    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || !nombre.trim()) {
        return res.status(400).json({ message: 'El nombre no puede estar vacío' });
      }
      horario.nombre = nombre.trim();
    }

    if (horaEntrada !== undefined) {
      const d = new Date(horaEntrada);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'La hora de entrada es inválida' });
      horario.horaEntrada = d;
    }

    if (horaSalida !== undefined) {
      const d = new Date(horaSalida);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'La hora de salida es inválida' });
      horario.horaSalida = d;
    }

    if (totalHoras !== undefined) horario.totalHoras = totalHoras;
    if (tipoTarea !== undefined) horario.tipoTarea = tipoTarea;
    if (observaciones !== undefined) horario.observaciones = observaciones;
    horario.updatedBy = req.user?.email ?? req.user?.id ?? 'Sistema';

    await horario.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Horarios', resourceId: horario._id, before: horarioAntes, after: horario.toObject() });
    res.status(200).json(horario);
  } catch (error) {
    console.error('Error actualizando horario:', error);
    res.status(500).json({ message: 'Error al actualizar horario' });
  }
};
