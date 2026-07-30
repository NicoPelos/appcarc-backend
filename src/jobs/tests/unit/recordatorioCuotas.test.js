import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../resources/usuarios/models/User.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../resources/cuotas/services/calcularDeuda.service.js', () => ({
  calcularDeuda: vi.fn(),
}));
vi.mock('../../../services/pushNotification.service.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue({ sent: 1 }),
}));

import { enviarRecordatorios } from '../../recordatorioCuotas.job.js';
import User from '../../../resources/usuarios/models/User.js';
import { calcularDeuda } from '../../../resources/cuotas/services/calcularDeuda.service.js';
import { sendPushNotification } from '../../../services/pushNotification.service.js';

const mockSelectLean = (result) => ({ select: () => ({ lean: () => Promise.resolve(result) }) });

const user = { _id: 'u1', socioId: 'socio1', clubId: 'CARC', expoPushToken: 'ExponentPushToken[xxx]' };

beforeEach(() => {
  vi.clearAllMocks();
  User.find.mockReturnValue(mockSelectLean([user]));
});

describe('enviarRecordatorios', () => {
  it('avisa cuando el socio debe cuota social', async () => {
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { uso_sistema: 'cuota_social' }, mesesDeuda: 2 }],
      otrosCargos: [],
    });

    await enviarRecordatorios();

    expect(sendPushNotification).toHaveBeenCalledWith(
      [{ userId: 'u1', clubId: 'CARC', token: 'ExponentPushToken[xxx]' }],
      expect.objectContaining({ body: expect.stringContaining('cuota social (2 meses)') }),
    );
  });

  it('avisa cuando el socio debe escuelita', async () => {
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { uso_sistema: 'cuota_escuelita' }, mesesDeuda: 1 }],
      otrosCargos: [],
    });

    await enviarRecordatorios();

    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('escuelita (1 mes)') }),
    );
  });

  it('no avisa si está al día', async () => {
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { uso_sistema: 'cuota_social' }, mesesDeuda: 0 }],
      otrosCargos: [],
    });

    await enviarRecordatorios();

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('no revienta si un socio falla', async () => {
    calcularDeuda.mockRejectedValue(new Error('DB error'));

    await expect(enviarRecordatorios()).resolves.not.toThrow();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});
