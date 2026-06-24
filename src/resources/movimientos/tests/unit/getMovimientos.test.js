import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMovimientosHandler } from '../../handlers/getMovimientos.handler.js';
import Movimiento from '../../models/Movimiento.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

const makeQuery = (queryable) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(queryable),
});

describe('getMovimientosHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return active movimientos by default', async () => {
    const movs = [{ _id: 'mov1', type: 'Ingreso', active: true }];
    vi.spyOn(Movimiento, 'countDocuments').mockResolvedValue(1);
    vi.spyOn(Movimiento, 'find').mockReturnValue(makeQuery(movs));

    const res = mockRes();
    await getMovimientosHandler({ query: {}, user: USER }, res);

    expect(Movimiento.find).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.movimientos).toEqual(movs);
    expect(body.total).toBe(1);
  });

  it('should return deleted movimientos when trash=true', async () => {
    vi.spyOn(Movimiento, 'countDocuments').mockResolvedValue(2);
    vi.spyOn(Movimiento, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getMovimientosHandler({ query: { trash: 'true' }, user: USER }, res);

    expect(Movimiento.find).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should filter by type when provided', async () => {
    vi.spyOn(Movimiento, 'countDocuments').mockResolvedValue(1);
    vi.spyOn(Movimiento, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getMovimientosHandler({ query: { type: 'Egreso' }, user: USER }, res);

    expect(Movimiento.find).toHaveBeenCalledWith(expect.objectContaining({ type: 'Egreso' }));
  });

  it('should ignore invalid type filter', async () => {
    vi.spyOn(Movimiento, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(Movimiento, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getMovimientosHandler({ query: { type: 'Otro' }, user: USER }, res);

    const callArg = Movimiento.find.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('type');
  });

  it('should return 500 on unexpected error', async () => {
    vi.spyOn(Movimiento, 'countDocuments').mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await getMovimientosHandler({ query: {}, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
