import Escuelita from '../models/Escuelita.js';

export const updateAlumnoHandler = async (req, res) => {
  try {
    const updates = {};
    const { estado, fechaInscripcion, observaciones } = req.body;

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

    updates.updatedBy = req.user.email || req.user.id;

    const alumno = await Escuelita.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      updates,
      { returnDocument: 'after' }
    ).populate('socioId', 'socioNumber nombre apellido dni correoElectronico telefono estado active');

    if (!alumno) {
      return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });
    }

    res.status(200).json(alumno);
  } catch (error) {
    console.error('Error actualizando alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al actualizar alumno de escuelita' });
  }
};

export default updateAlumnoHandler;
