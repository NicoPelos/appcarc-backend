import { BusinessError, registrarCobro } from '../services/registrarCobro.service.js';

export const createCobroHandler = async (req, res) => {
  try {
    const result = await registrarCobro({
      clubId: req.user?.clubId,
      user: req.user,
      body: req.body,
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error registrando cobro:', error);
    res.status(500).json({ message: 'Error al registrar cobro' });
  }
};

export default createCobroHandler;
