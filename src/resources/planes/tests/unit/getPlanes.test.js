import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPlanesHandler } from '../../handlers/getPlanes.handler.js';

vi.mock('../../models/Plan.js', () => ({
  default: { find: vi.fn() },
}));

import Plan from '../../models/Plan.js';

const mockUser = { clubId: 'CARC' };
const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeQuery = (result) =>
  ({ populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(result) });

beforeEach(() => vi.clearAllMocks());

describe('getPlanesHandler', () => {
  it('devuelve lista de planes activos', async () => {
    const planes = [{ nombre: 'Socio Activo', tipo: 'social' }];
    Plan.find.mockReturnValue(makeQuery(planes));

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getPlanesHandler(req, res);

    expect(Plan.find).toHaveBeenCalledWith({ clubId: 'CARC', active: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(planes);
  });

  it('filtra por tipo', async () => {
    Plan.find.mockReturnValue(makeQuery([]));

    const req = { user: mockUser, query: { tipo: 'escuelita' } };
    const res = mockRes();

    await getPlanesHandler(req, res);

    expect(Plan.find).toHaveBeenCalledWith({ clubId: 'CARC', active: true, tipo: 'escuelita' });
  });

  it('muestra eliminados con trash=true', async () => {
    Plan.find.mockReturnValue(makeQuery([]));

    const req = { user: mockUser, query: { trash: 'true' } };
    const res = mockRes();

    await getPlanesHandler(req, res);

    expect(Plan.find).toHaveBeenCalledWith({ clubId: 'CARC', active: false });
  });

  it('retorna 500 si hay error', async () => {
    Plan.find.mockReturnValue({ populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn().mockRejectedValue(new Error('DB')) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getPlanesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
