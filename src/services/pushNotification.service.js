import User from '../resources/usuarios/models/User.js';
import Notification from '../resources/notificaciones/models/Notification.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo acepta hasta 100 por request

const isValidExpoToken = (token) =>
  typeof token === 'string' && token.startsWith('ExponentPushToken[');

const sendBatch = async (messages) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo Push API error: ${response.status}`);
  }

  return response.json();
};

/**
 * Envía una notificación push a destinatarios específicos y guarda un registro
 * en el historial in-app de cada uno. El registro se guarda para todos los
 * destinatarios (tengan o no push token) — el push es solo el mecanismo de
 * entrega inmediata, la campanita de la app es la fuente de verdad del
 * historial (antes dependía de escuchar el push en el momento exacto en que
 * llegaba, así que se perdía si la app estaba cerrada).
 * @param {{ userId: string, clubId: string, token?: string|null }[]} recipients
 * @param {{ title: string, body: string, data?: object }} notification
 */
export const sendPushNotification = async (recipients, { title, body, data = {} }) => {
  const list = (recipients ?? []).filter((r) => r?.userId && r?.clubId);
  if (list.length === 0) return { sent: 0 };

  await Notification.insertMany(
    list.map((r) => ({ clubId: r.clubId, userId: r.userId, title, body, data })),
  ).catch((error) => console.error('Error guardando historial de notificaciones:', error.message));

  const messages = list
    .filter((r) => isValidExpoToken(r.token))
    .map((r) => ({ to: r.token, title, body, data }));

  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      await sendBatch(batch);
      sent += batch.length;
    } catch (error) {
      console.error(`Error enviando batch de push notifications: ${error.message}`);
    }
  }

  return { sent };
};

/**
 * Envía una notificación push a todos los socios activos de un club.
 */
export const notifyClub = async (clubId, { title, body, data = {} }) => {
  const users = await User.find({ clubId, active: true }).select('expoPushToken').lean();

  return sendPushNotification(
    users.map((u) => ({ userId: u._id, clubId, token: u.expoPushToken })),
    { title, body, data },
  );
};

/**
 * Envía una notificación push a usuarios de un club con alguno de los roles indicados.
 */
export const notifyRoles = async (clubId, roles, { title, body, data = {} }) => {
  const users = await User.find({ clubId, active: true, roles: { $in: roles } })
    .select('expoPushToken').lean();

  return sendPushNotification(
    users.map((u) => ({ userId: u._id, clubId, token: u.expoPushToken })),
    { title, body, data },
  );
};

/**
 * Envía una notificación push al usuario vinculado a un socio específico.
 */
export const notifySocio = async (socioId, { title, body, data = {} }) => {
  const user = await User.findOne({ socioId: String(socioId), active: true })
    .select('expoPushToken clubId').lean();

  if (!user) return { sent: 0 };
  return sendPushNotification(
    [{ userId: user._id, clubId: user.clubId, token: user.expoPushToken }],
    { title, body, data },
  );
};
