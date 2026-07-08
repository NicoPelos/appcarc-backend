import cron from 'node-cron';
import User from '../resources/usuarios/models/User.js';
import { calcularDeuda } from '../resources/cuotas/services/calcularDeuda.service.js';
import { sendPushNotification } from '../services/pushNotification.service.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const getMesActual = () => MESES[new Date().getMonth()];

const buildBody = (social, escuelita) => {
  const partes = [];
  if (social?.mesesDeuda > 0) {
    partes.push(`cuota social (${social.mesesDeuda} ${social.mesesDeuda === 1 ? 'mes' : 'meses'})`);
  }
  if (escuelita?.mesesDeuda > 0) {
    partes.push(`escuelita (${escuelita.mesesDeuda} ${escuelita.mesesDeuda === 1 ? 'mes' : 'meses'})`);
  }
  return `Tenés cuotas pendientes: ${partes.join(' y ')}. ¡No te olvides de ponerte al día!`;
};

export const enviarRecordatorios = async () => {
  console.log('📅 Recordatorio de cuotas: iniciando...');

  const users = await User.find({
    active: true,
    expoPushToken: { $ne: null },
    socioId: { $ne: null },
  }).select('socioId expoPushToken clubId').lean();

  let notificados = 0;

  for (const user of users) {
    try {
      const [social, escuelita] = await Promise.all([
        calcularDeuda({ socioId: user.socioId, clubId: user.clubId, tipo: 'social' }),
        calcularDeuda({ socioId: user.socioId, clubId: user.clubId, tipo: 'escuelita' }),
      ]);

      if (!social?.mesesDeuda && !escuelita?.mesesDeuda) continue;

      await sendPushNotification([user.expoPushToken], {
        title: `Recordatorio de cuotas - ${getMesActual()}`,
        body: buildBody(social, escuelita),
        data: { tipo: 'recordatorio_cuotas' },
      });
      notificados++;
    } catch (err) {
      console.error(`Error procesando socio ${user.socioId}:`, err.message);
    }
  }

  console.log(`📅 Recordatorio de cuotas: ${notificados} socios notificados`);
};

export const startRecordatorioCuotasJob = () => {
  // Corre el 1° de cada mes a las 9am
  cron.schedule('0 9 1 * *', async () => {
    try {
      await enviarRecordatorios();
    } catch (err) {
      console.error('❌ Error en recordatorio de cuotas:', err.message);
    }
  });

  console.log('📅 Recordatorio de cuotas job iniciado (cada 1° del mes a las 9am)');
};
