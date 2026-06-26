import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrecioHandler } from '../../handlers/createPrecio.handler.js';

const mockSave = vi.fn();
vi.mock('../../models/Precios.js', () => ({
  default: vi.fn().mockImplementation((data) => ({ ...data, save: mockSave })),
}));

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const validBody = {
  categoria: 'cuota',
  codigo: 'cuota_social',
  nombre: 'Cuota Social',
  unidad: 'mes',
  monto: 5000,
};

beforeEach(() => vi.clearAllMocks());

describe('createPrecioHandler', () => {
  it('crea precio correctamente', async () => {
    mockSave.mockResolvedValue();
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si falta categoria', async () => {
    const req = { user: mockUser, body: { ...validBody, categoria: undefined } };
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

  it('retorna 400 si monto es negativo', async () => {
    const req = { user: mockUser, body: { ...validBody, monto: -100 } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si codigo tiene caracteres inválidos', async () => {
    const req = { user: mockUser, body: { ...validBody, codigo: 'Código Inválido!' } };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 500 si hay error al guardar', async () => {
    mockSave.mockRejectedValue(new Error('DB error'));
    const req = { user: mockUser, body: validBody };
    const res = mockRes();

    await createPrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
