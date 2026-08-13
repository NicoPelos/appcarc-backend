import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkinEscuelitaHandler } from '../../handlers/checkinEscuelita.handler.js';

vi.mock('../../../socios/services/socioQr.service.js', () => ({
  resolveSocioFromQrTokenOrDni: vi.fn(),
  findActiveSocioById: vi.fn(),
  BusinessError: class BusinessError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  },
}));
vi.mock('../../models/Escuelita.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../cuotas/models/Cuota.js', () => ({
  default: { findOne: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock('../../../etiquetas/models/Etiqueta.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../asistencias/models/Asistencia.js', () => ({
  default: { countDocuments: vi.fn(), findOne: vi.fn(), create: vi.fn() },
}));
vi.mock('../../../vinculos/models/VinculoFamiliar.js', () => ({
  default: { exists: vi.fn() },
}));
vi.mock('../../../../services/permisosCache.js', () => ({
  tienePermiso: vi.fn(),
}));

import { resolveSocioFromQrTokenOrDni, findActiveSocioById, BusinessError } from '../../../socios/services/socioQr.service.js';
import Escuelita from '../../models/Escuelita.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';
import VinculoFamiliar from '../../../vinculos/models/VinculoFamiliar.js';
import { tienePermiso } from '../../../../services/permisosCache.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com', id: 'u1', roles: ['secretaria'] };
const mockSocio = { _id: 'socio1', nombre: 'Ana', apellido: 'García', dni: '12345678' };
const mockPlan = { _id: 'plan1', nombre: 'PrincipiantesX2', atributos: { frecuenciaSemanal: 2 } };
const mockAlumno = { socioId: 'socio1', planId: mockPlan };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  tienePermiso.mockResolvedValue(true); // staff por defecto en estos tests
  resolveSocioFromQrTokenOrDni.mockResolvedValue({ socio: mockSocio, method: 'QR' });
  Escuelita.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(mockAlumno) });
  Etiqueta.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'etiqueta1' }) });
  Cuota.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'cuota1', estado: 'pagada' }) });
  Asistencia.countDocuments.mockResolvedValue(0);
  Asistencia.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  Asistencia.create.mockResolvedValue({ _id: 'asist1' });
});

describe('checkinEscuelitaHandler', () => {
  it('registra asistencia correctamente', async () => {
    const req = { user: mockUser, body: { token: 'tok123' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(Asistencia.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 404 si el socio no está inscripto', async () => {
    Escuelita.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });
    const req = { user: mockUser, body: { dni: '12345678' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('registra con advertencias si no tiene cuota pagada', async () => {
    Cuota.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = { user: mockUser, body: { token: 'tok' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      advertencias: expect.arrayContaining([
        expect.objectContaining({ codigo: 'CUOTA_SOCIAL_IMPAGA' }),
        expect.objectContaining({ codigo: 'CUOTA_IMPAGA' }),
      ]),
    }));
  });

  it('registra con advertencia si alcanzó el límite de clases semanales', async () => {
    Asistencia.countDocuments.mockResolvedValue(2); // ya tiene 2, límite es 2
    const req = { user: mockUser, body: { token: 'tok' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      advertencias: expect.arrayContaining([
        expect.objectContaining({ codigo: 'LIMITE_SEMANAL' }),
      ]),
      limiteClases: 2,
    }));
  });

  it('retorna 400 si la fecha es inválida', async () => {
    const req = { user: mockUser, body: { token: 'tok', fecha: 'no-es-una-fecha' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Asistencia.create).not.toHaveBeenCalled();
  });

  it('registra la asistencia con la fecha pasada, no con la de hoy', async () => {
    const req = { user: mockUser, body: { token: 'tok', fecha: '2026-02-10T15:00:00.000Z' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(Asistencia.create).toHaveBeenCalledWith(expect.objectContaining({
      fecha: new Date('2026-02-10T15:00:00.000Z'),
    }));
  });

  it('calcula el período de cuota y el límite semanal en base a la fecha pasada, no a la real', async () => {
    const req = { user: mockUser, body: { token: 'tok', fecha: '2026-02-10T15:00:00.000Z' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    // La cuota se busca con periodo '2026-02' (el de la fecha pasada), no el mes real.
    expect(Cuota.findOne).toHaveBeenCalledWith(expect.objectContaining({ periodo: '2026-02' }));
    // El conteo semanal filtra por el rango de esa semana, no "ahora".
    const countArgs = Asistencia.countDocuments.mock.calls[0][0];
    expect(countArgs.fecha.$gte.getTime()).toBeLessThan(new Date('2026-02-10T15:00:00.000Z').getTime());
    expect(countArgs.fecha.$lte.getTime()).toBeGreaterThan(new Date('2026-02-10T15:00:00.000Z').getTime());
  });

  it('retorna 500 si hay error inesperado', async () => {
    Asistencia.create.mockRejectedValue(new Error('DB error'));
    const req = { user: mockUser, body: { token: 'tok' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  describe('autoescaneo (checkin_propio, sin permiso de staff)', () => {
    const tutorUser = { clubId: 'CARC', email: 'tutor@carc.com', id: 'tutor1', socioId: 'socioTutor', roles: ['socio'] };

    beforeEach(() => {
      tienePermiso.mockResolvedValue(false);
      findActiveSocioById.mockResolvedValue(mockSocio);
    });

    it('usa el propio socio del usuario cuando no manda hijoSocioId', async () => {
      const req = { user: tutorUser, body: {} };
      const res = mockRes();

      await checkinEscuelitaHandler(req, res);

      expect(resolveSocioFromQrTokenOrDni).not.toHaveBeenCalled();
      expect(findActiveSocioById).toHaveBeenCalledWith('socioTutor', 'CARC');
      expect(VinculoFamiliar.exists).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('permite marcar a un hijo vinculado si el VinculoFamiliar está activo', async () => {
      VinculoFamiliar.exists.mockResolvedValue(true);
      const req = { user: tutorUser, body: { hijoSocioId: 'hijo1' } };
      const res = mockRes();

      await checkinEscuelitaHandler(req, res);

      expect(VinculoFamiliar.exists).toHaveBeenCalledWith({
        clubId: 'CARC', padreUserId: 'tutor1', hijoSocioId: 'hijo1', active: true,
      });
      expect(findActiveSocioById).toHaveBeenCalledWith('hijo1', 'CARC');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rechaza con 403 si el hijoSocioId no está vinculado al usuario', async () => {
      VinculoFamiliar.exists.mockResolvedValue(false);
      const req = { user: tutorUser, body: { hijoSocioId: 'hijo-ajeno' } };
      const res = mockRes();

      await checkinEscuelitaHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(Asistencia.create).not.toHaveBeenCalled();
    });

    it('rechaza con 403 si no hay socioId propio ni hijoSocioId', async () => {
      const req = { user: { clubId: 'CARC', id: 'tutor1', roles: ['socio'] }, body: {} };
      const res = mockRes();

      await checkinEscuelitaHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
