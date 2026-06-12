import Escuelita from '../models/Escuelita.js';

export const deleteAlumnoHandler = async (req, res) => {
  try {
    const alumno = await Escuelita.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      {
        active: false,
        estado: 'baja',
        updatedBy: req.user.email || req.user.id,
      },
      { returnDocument: 'after' }
    );

    if (!alumno) {
      return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });
    }

    res.status(200).json({ message: 'Alumno dado de baja de escuelita' });
  } catch (error) {
    console.error('Error dando de baja alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al dar de baja alumno de escuelita' });
  }
};

export default deleteAlumnoHandler;
