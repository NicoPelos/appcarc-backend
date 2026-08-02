import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../resources/usuarios/models/User.js', () => ({
  default: { findOne: vi.fn(), find: vi.fn() },
}));
vi.mock('../../../resources/notificaciones/models/Notification.js', () => ({
  default: { insertMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../resources/vinculos/models/VinculoFamiliar.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../resources/roles/services/resolverRoles.service.js', () => ({
  obtenerRolIdsPorSlugs: vi.fn(),
}));

import { notifySocio, sendPushNotification } from '../../pushNotification.service.js';
import User from '../../../resources/usuarios/models/User.js';
import Notification from '../../../resources/notificaciones/models/Notification.js';
import VinculoFamiliar from '../../../resources/vinculos/models/VinculoFamiliar.js';

const chainableFindOne = (result) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }) });
const chainableFind = (result) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }) });

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Notification.insertMany.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });
  afterEach(() => vi.clearAllMocks());

  it('guarda socioId en el historial cuando se pasa', async () => {
    await sendPushNotification(
      [{ userId: 'u1', clubId: 'CARC', token: null }],
      { title: 't', body: 'b', socioId: 'socio1' },
    );
    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u1', clubId: 'CARC', socioId: 'socio1', title: 't', body: 'b' }),
    ]);
  });

  it('socioId queda null si no se pasa', async () => {
    await sendPushNotification([{ userId: 'u1', clubId: 'CARC', token: null }], { title: 't', body: 'b' });
    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ socioId: null }),
    ]);
  });
});

describe('notifySocio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Notification.insertMany.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });
  afterEach(() => vi.clearAllMocks());

  it('llega a la cuenta propia del socio si tiene una', async () => {
    User.findOne.mockReturnValue(chainableFindOne({ _id: 'userPropio', clubId: 'CARC', expoPushToken: null }));
    VinculoFamiliar.find.mockReturnValue(chainableFind([]));

    const result = await notifySocio('socio1', { title: 't', body: 'b' });

    expect(result.sent).toBe(0); // sin push token válido, pero se guarda igual en el historial
    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'userPropio', socioId: 'socio1' }),
    ]);
  });

  it('bug real arreglado: un hijo vinculado sin cuenta propia le llega al tutor', async () => {
    User.findOne.mockReturnValue(chainableFindOne(null)); // el hijo no tiene cuenta propia
    VinculoFamiliar.find.mockReturnValue(chainableFind([{ padreUserId: 'tutor1' }]));
    User.find.mockReturnValue(chainableFind([{ _id: 'tutor1', clubId: 'CARC', expoPushToken: null }]));

    await notifySocio('hijoSocioId', { title: 't', body: 'b' });

    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'tutor1', socioId: 'hijoSocioId' }),
    ]);
  });

  it('si tiene cuenta propia Y tutores vinculados, le llega a todos sin duplicar', async () => {
    User.findOne.mockReturnValue(chainableFindOne({ _id: 'userPropio', clubId: 'CARC', expoPushToken: null }));
    VinculoFamiliar.find.mockReturnValue(chainableFind([{ padreUserId: 'tutor1' }, { padreUserId: 'tutor2' }]));
    User.find.mockReturnValue(chainableFind([
      { _id: 'tutor1', clubId: 'CARC', expoPushToken: null },
      { _id: 'tutor2', clubId: 'CARC', expoPushToken: null },
    ]));

    await notifySocio('socio1', { title: 't', body: 'b' });

    const inserted = Notification.insertMany.mock.calls[0][0];
    expect(inserted.map((n) => n.userId)).toEqual(['userPropio', 'tutor1', 'tutor2']);
  });

  it('sin cuenta propia ni tutores, no manda nada (no explota)', async () => {
    User.findOne.mockReturnValue(chainableFindOne(null));
    VinculoFamiliar.find.mockReturnValue(chainableFind([]));

    const result = await notifySocio('socioHuerfano', { title: 't', body: 'b' });

    expect(result).toEqual({ sent: 0 });
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });
});
