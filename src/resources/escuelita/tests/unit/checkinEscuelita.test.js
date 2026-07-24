import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkinEscuelitaHandler } from '../../handlers/checkinEscuelita.handler.js';

vi.mock('../../../socios/services/socioQr.service.js', () => ({
  resolveSocioFromQrTokenOrDni: vi.fn(),
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

import { resolveSocioFromQrTokenOrDni, BusinessError } from '../../../socios/services/socioQr.service.js';
import Escuelita from '../../models/Escuelita.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com', id: 'u1' };
const mockSocio = { _id: 'socio1', nombre: 'Ana', apellido: 'García', dni: '12345678' };
const mockPlan = { _id: 'plan1', nombre: 'PrincipiantesX2', atributos: { frecuenciaSemanal: 2 } };
const mockAlumno = { estado: 'activo', socioId: 'socio1', planId: mockPlan };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
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

  it('retorna 402 si la inscripción está dada de baja', async () => {
    Escuelita.findOne.mockReturnValue({
      populate: vi.fn().mockResolvedValue({ ...mockAlumno, estado: 'baja' }),
    });
    const req = { user: mockUser, body: { token: 'tok' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(402);
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

  it('retorna 500 si hay error inesperado', async () => {
    Asistencia.create.mockRejectedValue(new Error('DB error'));
    const req = { user: mockUser, body: { token: 'tok' } };
    const res = mockRes();

    await checkinEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
