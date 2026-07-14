import cron from 'node-cron';
import { syncFaaFeed } from '../resources/novedades/services/syncFaaFeed.service.js';

export const startFaaSyncJob = () => {
  // Corre cada 2 horas — el feed de FAA se actualiza con poca frecuencia,
  // no hace falta el mismo intervalo que Instagram.
  cron.schedule('0 */2 * * *', async () => {
    try {
      const result = await syncFaaFeed();
      if (result.inserted > 0) {
        console.log(`📰 Sync FAA: ${result.inserted} novedades nuevas (${result.skipped} ya existían)`);
      }
    } catch (error) {
      console.error('❌ Error en sync de FAA:', error.message);
    }
  });

  console.log('📰 Sync de novedades de FAA iniciado (cada 2 horas)');
};

export default startFaaSyncJob;
