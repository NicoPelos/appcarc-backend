import Horarios from '../models/Horarios.js';

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
    res.status(200).json(horario);
  } catch (error) {
    console.error('Error actualizando horario:', error);
    res.status(500).json({ message: 'Error al actualizar horario' });
  }
};
