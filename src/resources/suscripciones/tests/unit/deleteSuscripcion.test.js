import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteSuscripcionHandler } from '../../handlers/deleteSuscripcion.handler.js';

vi.mock('../../models/Suscripcion.js', () => ({
  default: { findOne: vi.fn() },
}));

import Suscripcion from '../../models/Suscripcion.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('deleteSuscripcionHandler', () => {
  it('elimina suscripción correctamente (200)', async () => {
    const mockSave = vi.fn().mockResolvedValue();
    const suscripcion = { _id: 'sus123', active: true, save: mockSave };
    Suscripcion.findOne.mockResolvedValue(suscripcion);

    const req = { user: mockUser, params: { id: 'sus123' } };
    const res = mockRes();

    await deleteSuscripcionHandler(req, res);

    expect(suscripcion.active).toBe(false);
    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Suscripción eliminada' });
  });

  it('retorna 404 si la suscripción no existe', async () => {
    Suscripcion.findOne.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: 'noexiste' } };
    const res = mockRes();

    await deleteSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 500 si hay error de base de datos', async () => {
    Suscripcion.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, params: { id: 'sus123' } };
    const res = mockRes();

    await deleteSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
