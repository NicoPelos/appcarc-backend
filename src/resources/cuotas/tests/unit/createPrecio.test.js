import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrecioHandler } from '../../handlers/createPrecio.handler.js';

const mockSave = vi.fn();
vi.mock('../../models/Precios.js', () => ({
  default: vi.fn().mockImplementation((data) => ({ ...data, save: mockSave, toObject: vi.fn().mockReturnValue(data) })),
}));
vi.mock('../../../etiquetas/models/Etiqueta.js', () => ({
  default: { findOne: vi.fn() },
}));

import Etiqueta from '../../../etiquetas/models/Etiqueta.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const validBody = {
  etiquetaId: '6650000000000000000000aa',
  nombre: 'Cuota Social Enero 2025',
  unidad: 'mes',
  monto: 15000,
};

beforeEach(() => {
  vi.clearAllMocks();
  Etiqueta.findOne.mockResolvedValue({ _id: validBody.etiquetaId, nombre: 'Cuota Social' });
});

describe('createPrecioHandler', () => {
  it('crea precio correctamente', async () => {
    mockSave.mockResolvedValue();
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si falta etiquetaId', async () => {
    const req = { user: mockUser, body: { ...validBody, etiquetaId: undefined } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si falta nombre', async () => {
    const req = { user: mockUser, body: { ...validBody, nombre: undefined } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si unidad es inválida', async () => {
    const req = { user: mockUser, body: { ...validBody, unidad: 'quincenal' } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si monto es negativo', async () => {
    const req = { user: mockUser, body: { ...validBody, monto: -100 } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 404 si etiqueta no existe', async () => {
    Etiqueta.findOne.mockResolvedValue(null);
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 500 si hay error al guardar', async () => {
    mockSave.mockRejectedValue(new Error('DB error'));
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
