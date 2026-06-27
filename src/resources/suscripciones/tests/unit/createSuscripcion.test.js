import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSuscripcionHandler } from '../../handlers/createSuscripcion.handler.js';

const mockSave = vi.fn();

vi.mock('../../models/Suscripcion.js', () => ({
  default: vi.fn().mockImplementation((data) => ({ ...data, save: mockSave })),
}));

vi.mock('../../../socios/models/Socio.js', () => ({
  default: { findOne: vi.fn() },
}));

vi.mock('../../../etiquetas/models/Etiqueta.js', () => ({
  default: { findOne: vi.fn() },
}));

import Socio from '../../../socios/models/Socio.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const validBody = {
  socioId: 'socio123',
  etiquetaId: 'etiqueta456',
  fechaDesde: '2026-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  Socio.findOne.mockResolvedValue({ _id: 'socio123', clubId: 'CARC' });
  Etiqueta.findOne.mockResolvedValue({ _id: 'etiqueta456', clubId: 'CARC', nombre: 'Cuota Social', unidad: 'mes' });
  mockSave.mockResolvedValue();
});

describe('createSuscripcionHandler', () => {
  it('crea suscripción correctamente (201)', async () => {
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si falta socioId', async () => {
    const req = { user: mockUser, body: { ...validBody, socioId: undefined } };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('socioId') }));
  });

  it('retorna 400 si falta etiquetaId', async () => {
    const req = { user: mockUser, body: { ...validBody, etiquetaId: undefined } };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('etiquetaId') }));
  });

  it('retorna 400 si falta fechaDesde', async () => {
    const req = { user: mockUser, body: { ...validBody, fechaDesde: undefined } };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('fechaDesde') }));
  });

  it('retorna 400 si fechaDesde tiene formato inválido', async () => {
    const req = { user: mockUser, body: { ...validBody, fechaDesde: '01-2026' } };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('YYYY-MM') }));
  });

  it('retorna 404 si el socio no existe', async () => {
    Socio.findOne.mockResolvedValue(null);
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Socio') }));
  });

  it('retorna 404 si la etiqueta no existe', async () => {
    Etiqueta.findOne.mockResolvedValue(null);
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Etiqueta') }));
  });

  it('retorna 500 si hay error de base de datos', async () => {
    mockSave.mockRejectedValue(new Error('DB error'));
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
