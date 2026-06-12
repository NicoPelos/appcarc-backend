import Socio from '../../socios/models/Socio.js';
import Escuelita from '../models/Escuelita.js';

export const createAlumnoHandler = async (req, res) => {
  try {
    const { socioId, fechaInscripcion, estado = 'activo', observaciones = '' } = req.body;

    if (!socioId) {
      return res.status(400).json({ message: 'socioId es obligatorio' });
    }

    if (!['activo', 'pausado', 'baja'].includes(estado)) {
      return res.status(400).json({ message: 'Estado de alumno inválido' });
    }

    const socio = await Socio.findOne({ _id: socioId, clubId: req.user?.clubId, active: true });
    if (!socio) {
      return res.status(404).json({ message: 'El socio no existe, está inactivo o pertenece a otro club' });
    }

    const existing = await Escuelita.findOne({ clubId: req.user.clubId, socioId, active: true });
    if (existing) {
      return res.status(409).json({ message: 'El socio ya está inscripto en escuelita' });
    }

    const inscriptionDate = fechaInscripcion ? new Date(fechaInscripcion) : new Date();
    if (Number.isNaN(inscriptionDate.getTime())) {
      return res.status(400).json({ message: 'La fecha de inscripción es inválida' });
    }

    const alumno = new Escuelita({
      clubId: req.user.clubId,
      socioId,
      dni: socio.dni || '',
      fechaInscripcion: inscriptionDate,
      estado,
      observaciones,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await alumno.save();
    await alumno.populate('socioId', 'socioNumber nombre apellido dni correoElectronico telefono estado active');

    res.status(201).json(alumno);
  } catch (error) {
    console.error('Error creando alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al crear alumno de escuelita' });
  }
};

export default createAlumnoHandler;
