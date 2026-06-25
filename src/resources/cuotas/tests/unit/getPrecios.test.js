import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPreciosHandler } from '../../handlers/getPrecios.handler.js';

vi.mock('../../models/Precios.js', () => ({
  default: { find: vi.fn() },
}));

import Precios from '../../models/Precios.js';

const mockUser = { clubId: 'CARC' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('getPreciosHandler', () => {
  it('devuelve lista de precios activos', async () => {
    const precios = [{ codigo: 'cuota_social', monto: 5000 }];
    Precios.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(precios) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getPreciosHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(precios);
  });

  it('filtra por categoria', async () => {
    Precios.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const req = { user: mockUser, query: { categoria: 'cuota' } };
    const res = mockRes();

    await getPreciosHandler(req, res);

    expect(Precios.find).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'cuota' }));
  });

  it('filtra por codigo', async () => {
    Precios.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const req = { user: mockUser, query: { codigo: 'cuota_social' } };
    const res = mockRes();

    await getPreciosHandler(req, res);

    expect(Precios.find).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'cuota_social' }));
  });

  it('muestra eliminados con trash=true', async () => {
    Precios.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const req = { user: mockUser, query: { trash: 'true' } };
    const res = mockRes();

    await getPreciosHandler(req, res);

    expect(Precios.find).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });

  it('retorna 500 si hay error', async () => {
    Precios.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getPreciosHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
