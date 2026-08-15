import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../models/Cobro.js', () => ({
  default: { countDocuments: vi.fn(), find: vi.fn() },
}));

import Cobro from '../../models/Cobro.js';
import { getCobrosHandler } from '../../handlers/getCobros.handler.js';

const CLUB_ID = 'CARC';

const buildRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockFind = (cobros) => {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    then: (resolve) => resolve(cobros),
  };
  Cobro.find.mockReturnValue(query);
  return query;
};

beforeEach(() => {
  vi.clearAllMocks();
  Cobro.countDocuments.mockResolvedValue(0);
  mockFind([]);
});

describe('getCobrosHandler', () => {
  it('con req.accessibleSocioIds (autoservicio), filtra items.socioId con $in y no usa query.socioId', async () => {
    const req = {
      user: { clubId: CLUB_ID },
      query: {},
      accessibleSocioIds: new Set(['socio1', 'hijo1']),
    };
    const res = buildRes();

    await getCobrosHandler(req, res);

    expect(Cobro.find).toHaveBeenCalledWith(expect.objectContaining({
      'items.socioId': { $in: expect.arrayContaining(['socio1', 'hijo1']) },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('con query.socioId (consulta de staff), filtra por ese socio puntual', async () => {
    const req = { user: { clubId: CLUB_ID }, query: { socioId: 'socio-x' } };
    const res = buildRes();

    await getCobrosHandler(req, res);

    expect(Cobro.find).toHaveBeenCalledWith(expect.objectContaining({ 'items.socioId': 'socio-x' }));
  });

  it('sin accessibleSocioIds ni query.socioId, no agrega filtro de socio (listado general de staff)', async () => {
    const req = { user: { clubId: CLUB_ID }, query: {} };
    const res = buildRes();

    await getCobrosHandler(req, res);

    const filtroUsado = Cobro.find.mock.calls[0][0];
    expect(filtroUsado).not.toHaveProperty('items.socioId');
  });

  it('responde con la forma paginada { page, limit, total, totalPages, cobros }', async () => {
    mockFind([{ _id: 'c1' }]);
    Cobro.countDocuments.mockResolvedValue(1);
    const req = { user: { clubId: CLUB_ID }, query: {} };
    const res = buildRes();

    await getCobrosHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      page: 1, limit: 20, total: 1, totalPages: 1, cobros: [{ _id: 'c1' }],
    });
  });
});
