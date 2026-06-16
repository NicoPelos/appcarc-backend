import {
  BusinessError,
  registrarAsistenciaEscuelita,
} from '../services/registrarAsistenciaEscuelita.service.js';

export const createAsistenciaEscuelitaHandler = async (req, res) => {
  try {
    const asistencia = await registrarAsistenciaEscuelita({
      clubId: req.user?.clubId,
      user: req.user,
      body: req.body,
    });

    res.status(201).json(asistencia);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error registrando asistencia escuelita:', error);
    res.status(500).json({ message: 'Error al registrar asistencia de escuelita' });
  }
};
