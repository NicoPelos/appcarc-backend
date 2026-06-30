import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateRolHandler } from '../../handlers/updateRol.handler.js';

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

const makeRol = (overrides = {}) => ({
  nombre: 'palestrero',
  permisos: ['muroLibre:read'],
  save: vi.fn().mockResolvedValue(),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('updateRolHandler', () => {
  it('actualiza permisos correctamente (200)', async () => {
    const rol = makeRol();
    Rol.findOne.mockResolvedValue(rol);

    const req = { user: mockUser, params: { id: 'rol1' }, body: { permisos: ['socios:read', 'muroLibre:read'] } };
    const res = mockRes();
    await updateRolHandler(req, res);

    expect(rol.permisos).toEqual(['socios:read', 'muroLibre:read']);
    expect(rol.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('actualiza nombre correctamente', async () => {
    const rol = makeRol();
    Rol.findOne.mockResolvedValue(rol);

    const req = { user: mockUser, params: { id: 'rol1' }, body: { nombre: 'entrenador' } };
    const res = mockRes();
    await updateRolHandler(req, res);

    expect(rol.nombre).toBe('entrenador');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 400 si hay permisos inválidos', async () => {
    const req = { user: mockUser, params: { id: 'rol1' }, body: { permisos: ['permiso:falso'] } };
    const res = mockRes();
    await updateRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('inválidos') }));
  });

  it('retorna 404 si el rol no existe', async () => {
    Rol.findOne.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: 'noexiste' }, body: { nombre: 'x' } };
    const res = mockRes();
    await updateRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 500 si hay error de BD', async () => {
    Rol.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, params: { id: 'rol1' }, body: { nombre: 'x' } };
    const res = mockRes();
    await updateRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
