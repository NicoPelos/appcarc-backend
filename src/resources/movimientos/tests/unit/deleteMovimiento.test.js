import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteMovimientoHandler } from '../../handlers/deleteMovimiento.handler.js';
import Movimiento from '../../models/Movimiento.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

const makeMovimiento = (overrides = {}) => ({
  _id: 'mov1',
  active: true,
  updatedBy: '',
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('deleteMovimientoHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 404 when movimiento is not found', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(null);
    const res = mockRes();
    await deleteMovimientoHandler({ params: { id: 'mov1' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Movimiento no encontrado' });
  });

  it('should soft delete and return 200', async () => {
    const mov = makeMovimiento();
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(mov);
    const res = mockRes();
    await deleteMovimientoHandler({ params: { id: 'mov1' }, user: USER }, res);
    expect(mov.active).toBe(false);
    expect(mov.updatedBy).toBe('admin@carc.test');
    expect(mov.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Movimiento eliminado' });
  });

  it('should return 500 on unexpected error', async () => {
    vi.spyOn(Movimiento, 'findOne').mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await deleteMovimientoHandler({ params: { id: 'mov1' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
