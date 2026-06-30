import Escuelita from '../models/Escuelita.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/escuelita/{id}:
 *   put:
 *     summary: Actualizar información de un alumno de escuelita
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID del alumno de escuelita a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AlumnoUpdateRequest'
 *     responses:
 *       200:
 *         description: Alumno de escuelita actualizado exitosamente
 *       400:
 *         description: Error en los datos enviados para actualizar el alumno de escuelita
 *       404:
 *         description: Alumno de escuelita no encontrado
 *       500:
 *         description: Error al actualizar alumno de escuelita
 *
 * components:
 *   schemas:
 *     AlumnoUpdateRequest:
 *       type: object
 *       properties:
 *         estado:
 *           type: string
 *           enum: [activo, pausado, baja]
 *           description: Estado del alumno en escuelita (activo, pausado o baja)
 *         fechaInscripcion:
 *           type: string
 *           format: date-time
 *           description: Fecha de inscripción del alumno en escuelita
 *         observaciones:
 *           type: string
 *           description: Observaciones adicionales sobre el alumno de escuelita (opcional)
 */

export const updateAlumnoHandler = async (req, res) => {
  try {
    const updates = {};
    const { estado, fechaInscripcion, observaciones, categoriaId } = req.body;

    if (estado !== undefined) {
      if (!['activo', 'pausado', 'baja'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de alumno inválido' });
      }
      updates.estado = estado;
    }

    if (fechaInscripcion !== undefined) {
      const inscriptionDate = new Date(fechaInscripcion);
      if (Number.isNaN(inscriptionDate.getTime())) {
        return res.status(400).json({ message: 'La fecha de inscripción es inválida' });
      }
      updates.fechaInscripcion = inscriptionDate;
    }

    if (observaciones !== undefined) {
      updates.observaciones = observaciones;
    }

    if (categoriaId !== undefined) {
      updates.categoriaId = categoriaId || null;
    }

    updates.updatedBy = req.user.email || req.user.id;

    const alumnoAntes = await Escuelita.findOne({ _id: req.params.id, clubId: req.user?.clubId, active: true }).lean();
    if (!alumnoAntes) return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });

    const alumno = await Escuelita.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      updates,
      { returnDocument: 'after' }
    )
      .populate('socioId', 'socioNumber nombre apellido dni correoElectronico telefono estado active')
      .populate('categoriaId', 'nombre codigo frecuenciaSemanal precioMensual codigoPrecio');

    if (!alumno) {
      return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });
    }

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Escuelita', resourceId: alumno._id, before: alumnoAntes, after: alumno.toObject() });
    res.status(200).json(alumno);
  } catch (error) {
    console.error('Error actualizando alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al actualizar alumno de escuelita' });
  }
};

export default updateAlumnoHandler;
