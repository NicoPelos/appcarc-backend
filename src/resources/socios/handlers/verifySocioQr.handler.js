import { resolveSocioFromQrToken, findActiveSocioByDni, buildSocioVerificationPayload } from '../services/socioQr.service.js';

export const verifySocioQrHandler = async (req, res) => {
  try {
    const { token, dni } = req.body;

    let socio = null;
    if (token) {
      socio = await resolveSocioFromQrToken(token, req.user?.clubId);
    } else if (dni) {
      socio = await findActiveSocioByDni(dni, req.user?.clubId);
      if (!socio) {
        return res.status(404).json({ message: 'Socio no encontrado por DNI' });
      }
    } else {
      return res.status(400).json({ message: 'Se requiere token QR o DNI' });
    }

    const payload = await buildSocioVerificationPayload(socio);
    res.status(200).json(payload);
  } catch (error) {
    console.error('Error verificando QR de socio:', error);
    res.status(error.status || 500).json({ message: error.message || 'Error verificando socio' });
  }
};

export default verifySocioQrHandler;