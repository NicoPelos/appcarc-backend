import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteRolHandler } from '../../handlers/deleteRol.handler.js';

vi.mock('../../models/Rol.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../services/permisosCache.js', () => ({ invalidarClub: vi.fn() }));

import Rol from '../../models/Rol.js';

const mockUser = { clubId: 'CARC' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('deleteRolHandler', () => {
  it('desactiva el rol correctamente (200)', async () => {
    const rol = { active: true, save: vi.fn().mockResolvedValue() };
    Rol.findOne.mockResolvedValue(rol);

    const req = { user: mockUser, params: { id: 'rol1' } };
    const res = mockRes();
    await deleteRolHandler(req, res);

    expect(rol.active).toBe(false);
    expect(rol.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Rol eliminado' });
  });

  it('retorna 404 si el rol no existe', async () => {
    Rol.findOne.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: 'noexiste' } };
    const res = mockRes();
    await deleteRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 500 si hay error de BD', async () => {
    Rol.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, params: { id: 'rol1' } };
    const res = mockRes();
    await deleteRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
