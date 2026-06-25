import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updatePrecioHandler } from '../../handlers/updatePrecio.handler.js';

vi.mock('../../models/Precios.js', () => ({
  default: { findOne: vi.fn() },
}));

import Precios from '../../models/Precios.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('updatePrecioHandler', () => {
  it('actualiza monto correctamente', async () => {
    const mockSave = vi.fn().mockResolvedValue();
    Precios.findOne.mockResolvedValue({ _id: '1', monto: 5000, save: mockSave });

    const req = { user: mockUser, params: { id: '1' }, body: { monto: 6000 } };
    const res = mockRes();

    await updatePrecioHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 si no existe', async () => {
    Precios.findOne.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: '1' }, body: { monto: 6000 } };
    const res = mockRes();

    await updatePrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 400 si monto es inválido', async () => {
    Precios.findOne.mockResolvedValue({ _id: '1', save: vi.fn() });

    const req = { user: mockUser, params: { id: '1' }, body: { monto: -50 } };
    const res = mockRes();

    await updatePrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si vigenteDesde es inválido', async () => {
    Precios.findOne.mockResolvedValue({ _id: '1', save: vi.fn() });

    const req = { user: mockUser, params: { id: '1' }, body: { vigenteDesde: 'no-es-fecha' } };
    const res = mockRes();

    await updatePrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 500 si hay error', async () => {
    Precios.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, params: { id: '1' }, body: {} };
    const res = mockRes();

    await updatePrecioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
