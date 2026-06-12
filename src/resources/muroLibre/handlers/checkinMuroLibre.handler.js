import { BusinessError, registrarMuroLibre } from '../services/registrarMuroLibre.service.js';
import { resolveSocioFromQrToken, findActiveSocioByDni } from '../../socios/services/socioQr.service.js';

export const checkinMuroLibreHandler = async (req, res) => {
  try {
    const { token, dni, tipoPase, estadoPago, paymentMethod, enviarComprobanteWp, observaciones } = req.body;

    let socio = null;
    if (token) {
      socio = await resolveSocioFromQrToken(token, req.user?.clubId);
    } else if (dni) {
      socio = await findActiveSocioByDni(dni, req.user?.clubId);
      if (!socio) {
        throw new BusinessError('Socio no encontrado por DNI', 404);
      }
    } else {
      throw new BusinessError('Se requiere token QR o DNI para identificar el socio', 400);
    }

    const result = await registrarMuroLibre({
      clubId: req.user?.clubId,
      user: req.user,
      body: {
        socioId: String(socio._id),
        tipoPase,
        estadoPago,
        paymentMethod,
        enviarComprobanteWp,
        observaciones,
      },
      scannedBy: req.user?.id,
      checkinMethod: token ? 'QR' : 'DNI',
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error en el checkin de muro libre:', error);
    res.status(500).json({ message: 'Error en el checkin de muro libre' });
  }
};

export default checkinMuroLibreHandler;