import { syncInstagramFeed } from '../../novedades/services/syncInstagram.service.js';
import { exportToSheets } from '../../../services/sheetsExport.service.js';
import { enviarRecordatorios } from '../../../jobs/recordatorioCuotas.job.js';

const JOBS = {
  syncSheets: async () => {
    const clubId = process.env.DEFAULT_CLUB_ID;
    const clubName = process.env.CLUB_NAME || 'CARC';
    if (!clubId) throw new Error('DEFAULT_CLUB_ID no configurado');
    return exportToSheets({ clubId, clubName });
  },
  syncInstagram: async () => {
    const clubId = process.env.DEFAULT_CLUB_ID;
    return syncInstagramFeed({ clubId });
  },
  recordatorioCuotas: async () => {
    await enviarRecordatorios();
    return { message: 'Recordatorios enviados' };
  },
};

export const runJobHandler = async (req, res) => {
  try {
    const { nombre } = req.params;

    if (!JOBS[nombre]) {
      return res.status(400).json({
        message: `Job '${nombre}' no existe`,
        disponibles: Object.keys(JOBS),
      });
    }

    console.log(`[super] Ejecutando job '${nombre}' manualmente...`);
    const result = await JOBS[nombre]();
    res.status(200).json({ job: nombre, result });
  } catch (error) {
    console.error(`[super] Error ejecutando job:`, error);
    res.status(500).json({ message: error.message });
  }
};
