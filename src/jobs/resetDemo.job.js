import cron from 'node-cron';
import { resetDemoClub } from '../services/demoSeed.service.js';

export const startResetDemoJob = () => {
  // Corre todos los días a las 5am — el club demo es autoservicio público
  // (ver appcarc-backend#9), así que se resetea solo, sin intervención manual.
  cron.schedule('0 5 * * *', async () => {
    try {
      const result = await resetDemoClub();
      console.log(`🔄 Club demo reseteado: ${result.socios} socios ficticios`);
    } catch (error) {
      console.error('❌ Error reseteando club demo:', error.message);
    }
  });

  console.log('🔄 Reset diario del club demo iniciado (todos los días a las 5am)');
};

export default startResetDemoJob;
