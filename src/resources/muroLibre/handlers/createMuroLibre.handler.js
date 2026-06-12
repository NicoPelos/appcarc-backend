import { BusinessError, registrarMuroLibre } from '../services/registrarMuroLibre.service.js';

export const createMuroLibreHandler = async (req, res) => {
  try {
    const result = await registrarMuroLibre({
      clubId: req.user?.clubId,
      user: req.user,
      body: req.body,
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error registrando muro libre:', error);
    res.status(500).json({ message: 'Error al registrar muro libre' });
  }
};

export default createMuroLibreHandler;
