import cron from 'node-cron';
import { exportToSheets } from '../services/sheetsExport.service.js';

export const startSyncSheetsJob = () => {
  const clubId = process.env.DEFAULT_CLUB_ID;
  const clubName = process.env.CLUB_NAME || 'CARC';

  if (!clubId) {
    console.info('ℹ️  syncSheets: DEFAULT_CLUB_ID no configurado, job desactivado.');
    return;
  }

  // Todos los días a las 3am
  cron.schedule('0 3 * * *', async () => {
    console.log('🔄 syncSheets: iniciando exportación a Google Sheets...');
    try {
      const result = await exportToSheets({ clubId, clubName });
      console.log(`✅ syncSheets: exportación completada → ${result.url}`);
      console.log(`   Socios: ${result.stats.socios} | Cobros: ${result.stats.cobros} | Horarios: ${result.stats.horarios}`);
    } catch (err) {
      console.error('❌ syncSheets: error en exportación:', err.message);
    }
  });

  console.log('📅 syncSheets: job programado (todos los días a las 3am)');
};
