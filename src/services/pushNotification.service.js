import User from '../resources/usuarios/models/User.js';

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
 * Envía una notificación push a tokens específicos.
 * @param {string[]} tokens - Lista de Expo push tokens
 * @param {{ title: string, body: string, data?: object }} notification
 */
export const sendPushNotification = async (tokens, { title, body, data = {} }) => {
  const validTokens = tokens.filter(isValidExpoToken);
  if (validTokens.length === 0) return { sent: 0 };

  const messages = validTokens.map((to) => ({ to, title, body, data }));

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
  const users = await User.find({
    clubId,
    active: true,
    expoPushToken: { $ne: null },
  }).select('expoPushToken').lean();

  const tokens = users.map((u) => u.expoPushToken).filter(Boolean);
  return sendPushNotification(tokens, { title, body, data });
};

/**
 * Envía una notificación push a usuarios de un club con alguno de los roles indicados.
 */
export const notifyRoles = async (clubId, roles, { title, body, data = {} }) => {
  const users = await User.find({
    clubId,
    active: true,
    roles: { $in: roles },
    expoPushToken: { $ne: null },
  }).select('expoPushToken').lean();

  const tokens = users.map((u) => u.expoPushToken).filter(Boolean);
  return sendPushNotification(tokens, { title, body, data });
};

/**
 * Envía una notificación push al usuario vinculado a un socio específico.
 */
export const notifySocio = async (socioId, { title, body, data = {} }) => {
  const user = await User.findOne({
    socioId: String(socioId),
    active: true,
    expoPushToken: { $ne: null },
  }).select('expoPushToken').lean();

  if (!user?.expoPushToken) return { sent: 0 };
  return sendPushNotification([user.expoPushToken], { title, body, data });
};
