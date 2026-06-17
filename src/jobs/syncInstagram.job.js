import cron from 'node-cron';
import { syncInstagramFeed } from '../resources/novedades/services/syncInstagram.service.js';
import { notifyClub } from '../services/pushNotification.service.js';

export const startInstagramSyncJob = ({ clubId, rssUrl }) => {
  if (!rssUrl) {
    console.log('ℹ️  INSTAGRAM_RSS_URL no configurado — sync de Instagram deshabilitado');
    return;
  }

  // Corre cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await syncInstagramFeed({ rssUrl, clubId });
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

  console.log('📸 Instagram sync job iniciado (cada 30 minutos)');
};
