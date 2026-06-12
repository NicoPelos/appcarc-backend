import { generateSocioQrToken, findActiveSocioById } from '../services/socioQr.service.js';
import Socio from '../models/Socio.js';

export const getSocioQrHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const socio = await findActiveSocioById(id, req.user?.clubId);
    if (!socio) {
      return res.status(404).json({ message: 'Socio no encontrado' });
    }

    const token = generateSocioQrToken({ clubId: socio.clubId, socioId: socio._id });

    res.status(200).json({ token, socioId: socio._id, clubId: socio.clubId });
  } catch (error) {
    console.error('Error generando QR de socio:', error);
    res.status(error.status || 500).json({ message: error.message || 'Error generando QR' });
  }
};

export default getSocioQrHandler;