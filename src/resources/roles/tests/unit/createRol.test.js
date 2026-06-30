import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRolHandler } from '../../handlers/createRol.handler.js';

const mockSave = vi.fn();

vi.mock('../../models/Rol.js', () => ({
  default: {
    findOne: vi.fn(),
    ...({ default: vi.fn() }),
  },
}));

vi.mock('../../models/Rol.js', () => ({
  default: Object.assign(
    vi.fn().mockImplementation((data) => ({ ...data, save: mockSave })),
    { findOne: vi.fn() },
  ),
}));

vi.mock('../../../services/permisosCache.js', () => ({ invalidarClub: vi.fn() }));

import Rol from '../../models/Rol.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('createRolHandler', () => {
  it('crea rol correctamente (201)', async () => {
    Rol.findOne.mockResolvedValue(null);
    mockSave.mockResolvedValue();

    const req = { user: mockUser, body: { nombre: 'entrenador', permisos: ['socios:read'] } };
    const res = mockRes();
    await createRolHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si falta nombre', async () => {
    const req = { user: mockUser, body: {} };
    const res = mockRes();
    await createRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('nombre') }));
  });

  it('retorna 400 si hay permisos inválidos', async () => {
    const req = { user: mockUser, body: { nombre: 'test', permisos: ['permiso:inexistente'] } };
    const res = mockRes();
    await createRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('inválidos') }));
  });

  it('retorna 409 si el rol ya existe', async () => {
    Rol.findOne.mockResolvedValue({ nombre: 'entrenador' });

    const req = { user: mockUser, body: { nombre: 'entrenador' } };
    const res = mockRes();
    await createRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('retorna 500 si hay error de BD', async () => {
    Rol.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, body: { nombre: 'entrenador' } };
    const res = mockRes();
    await createRolHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
