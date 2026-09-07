import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../resources/usuarios/models/User.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../resources/escuelita/models/Escuelita.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../resources/cuotas/services/calcularDeuda.service.js', () => ({
  calcularDeuda: vi.fn(),
}));
vi.mock('../../../services/pushNotification.service.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue({ sent: 1 }),
  notifyJobFailure: vi.fn().mockResolvedValue(undefined),
}));

let cronCallback;
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn((_expr, cb) => { cronCallback = cb; }) },
}));

import { enviarRecordatorios, startRecordatorioCuotasJob } from '../../recordatorioCuotas.job.js';
import User from '../../../resources/usuarios/models/User.js';
import Escuelita from '../../../resources/escuelita/models/Escuelita.js';
import { calcularDeuda } from '../../../resources/cuotas/services/calcularDeuda.service.js';
import { sendPushNotification, notifyJobFailure } from '../../../services/pushNotification.service.js';

const mockSelectLean = (result) => ({ select: () => ({ lean: () => Promise.resolve(result) }) });

// Escuelita.findOne(...).populate(...).lean() — por defecto "no inscripto".
const mockAlumno = (etiquetaId = null) => ({
  populate: () => ({ lean: () => Promise.resolve(etiquetaId ? { planId: { etiquetaId } } : null) }),
});

const user = { _id: 'u1', socioId: 'socio1', clubId: 'CARC', expoPushToken: 'ExponentPushToken[xxx]' };
const ETIQUETA_ESCUELITA_ID = 'etiqueta-escuelita-1';

beforeEach(() => {
  vi.clearAllMocks();
  User.find.mockReturnValue(mockSelectLean([user]));
  Escuelita.findOne.mockReturnValue(mockAlumno());
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

  it('avisa cuando el socio debe escuelita (etiqueta con uso_sistema cuota_escuelita)', async () => {
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { _id: ETIQUETA_ESCUELITA_ID, uso_sistema: 'cuota_escuelita' }, mesesDeuda: 1 }],
      otrosCargos: [],
    });
    Escuelita.findOne.mockReturnValue(mockAlumno(ETIQUETA_ESCUELITA_ID));

    await enviarRecordatorios();

    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('escuelita (1 mes)') }),
    );
  });

  it('BUG appcarc-backend#156: avisa la deuda de escuelita también para un plan cuya etiqueta NO tiene uso_sistema cuota_escuelita (ej. AvanzadosX1)', async () => {
    const ETIQUETA_X1_ID = 'etiqueta-escuelita-x1';
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { _id: ETIQUETA_X1_ID, uso_sistema: null, nombre: 'Cuota Escuelita x 1' }, mesesDeuda: 3 }],
      otrosCargos: [],
    });
    Escuelita.findOne.mockReturnValue(mockAlumno(ETIQUETA_X1_ID));

    await enviarRecordatorios();

    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('escuelita (3 meses)') }),
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

  it('no avisa escuelita si el socio no está inscripto (no hay etiqueta que resolver)', async () => {
    calcularDeuda.mockResolvedValue({
      suscripciones: [{ etiqueta: { _id: ETIQUETA_ESCUELITA_ID, uso_sistema: 'cuota_escuelita' }, mesesDeuda: 1 }],
      otrosCargos: [],
    });
    Escuelita.findOne.mockReturnValue(mockAlumno(null));

    await enviarRecordatorios();

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('no revienta si un socio falla', async () => {
    calcularDeuda.mockRejectedValue(new Error('DB error'));

    await expect(enviarRecordatorios()).resolves.not.toThrow();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});

describe('startRecordatorioCuotasJob', () => {
  it('avisa al admin si el job entero falla inesperadamente', async () => {
    User.find.mockImplementation(() => { throw new Error('Mongo caído'); });
    startRecordatorioCuotasJob();

    await cronCallback();

    expect(notifyJobFailure).toHaveBeenCalledWith('CARC', 'Recordatorio de cuotas', 'Mongo caído');
  });
});
