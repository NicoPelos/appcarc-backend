import Asistencia from '../models/Asistencia.js';

export const deleteAsistenciaHandler = async (req, res) => {
  try {
    const asistencia = await Asistencia.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      { active: false, updatedBy: req.user.email || req.user.id },
      { returnDocument: 'after' },
    );
    if (!asistencia) {
      return res.status(404).json({ message: 'Asistencia no encontrada' });
    }
    res.status(200).json({ message: 'Asistencia eliminada' });
  } catch (error) {
    console.error('Error eliminando asistencia:', error);
    res.status(500).json({ message: 'Error al eliminar asistencia' });
  }
};

export default deleteAsistenciaHandler;
