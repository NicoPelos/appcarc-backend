import Escuelita from '../models/Escuelita.js';

export const purgarAlumnoHandler = async (req, res) => {
  try {
    const alumno = await Escuelita.findOneAndDelete({
      _id: req.params.id,
      clubId: req.user?.clubId,
    });

    if (!alumno) {
      return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });
    }

    res.status(200).json({ message: 'Alumno eliminado permanentemente' });
  } catch (error) {
    console.error('Error eliminando alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al eliminar alumno de escuelita' });
  }
};

export default purgarAlumnoHandler;
