import cron from 'node-cron';
import { syncInstagramFeed } from '../resources/novedades/services/syncInstagram.service.js';
import { refreshInstagramToken } from '../resources/novedades/services/refreshInstagramToken.service.js';
import { notifyClub } from '../services/pushNotification.service.js';

export const startInstagramSyncJob = ({ clubId }) => {
  // Corre cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await syncInstagramFeed({ clubId });
      if (result.inserted > 0) {
        console.log(`📸 Instagram sync: ${result.inserted} novedades nuevas (${result.skipped} ya existían)`);
        notifyClub(clubId, {
          title: '📸 Novedad del club',
          body: `Hay ${result.inserted} publicación${result.inserted > 1 ? 'es' : ''} nueva${result.inserted > 1 ? 's' : ''} en Instagram`,
          data: { tipo: 'instagram_sync' },
        }).catch((err) => console.error('Error enviando push de Instagram sync:', err));
      }
    } catch (error) {
      console.error('❌ Error en sync de Instagram:', error.message);
    }
  });

  // Refresca el token de acceso los días 1 y 15 de cada mes a las 4am.
  // Dura 60 días y se puede refrescar en cualquier momento después de las
  // primeras 24hs, así que esta frecuencia deja margen de sobra.
  cron.schedule('0 4 1,15 * *', async () => {
    try {
      await refreshInstagramToken(clubId);
      console.log('🔑 Token de Instagram refrescado correctamente');
    } catch (error) {
      console.error('❌ Error refrescando token de Instagram:', error.message);
    }
  });

  console.log('📸 Instagram sync job iniciado (cada 30 minutos)');
};
