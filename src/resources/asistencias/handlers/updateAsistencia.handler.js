import Asistencia from '../models/Asistencia.js';

export const updateAsistenciaHandler = async (req, res) => {
  try {
    const { observaciones, categoria } = req.body;
    const updates = { updatedBy: req.user.email || req.user.id };
    if (observaciones !== undefined) updates.observaciones = String(observaciones).trim();
    if (categoria !== undefined) updates.categoria = String(categoria).trim();

    const asistencia = await Asistencia.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      updates,
      { returnDocument: 'after' },
    );
    if (!asistencia) {
      return res.status(404).json({ message: 'Asistencia no encontrada' });
    }
    res.status(200).json(asistencia);
  } catch (error) {
    console.error('Error actualizando asistencia:', error);
    res.status(500).json({ message: 'Error al actualizar asistencia' });
  }
};

export default updateAsistenciaHandler;
