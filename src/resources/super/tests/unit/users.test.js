import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUsersHandler }        from '../../handlers/getUsers.handler.js';
import { createSuperUserHandler } from '../../handlers/createSuperUser.handler.js';
import { deleteSuperUserHandler } from '../../handlers/deleteSuperUser.handler.js';
import { resetUserPasswordHandler } from '../../handlers/resetUserPassword.handler.js';
import User from '../../../usuarios/models/User.js';
import bcrypt from 'bcryptjs';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json   = vi.fn(() => res);
  return res;
};

describe('Super — users handlers (unit)', () => {
  beforeEach(() => {
    User.countDocuments    = vi.fn().mockResolvedValue(5);
    User.find              = vi.fn();
    User.findOne           = vi.fn();
    User.findByIdAndUpdate = vi.fn();
    User.findById          = vi.fn();
    User.create            = vi.fn();
    vi.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt');
    vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');
  });

  afterEach(() => vi.clearAllMocks());

  it('getUsersHandler devuelve lista paginada', async () => {
    const fakeUsers = [{ _id: 'u1', email: 'a@b.com' }];
    const query = {
      select: vi.fn().mockReturnThis(),
      sort:   vi.fn().mockReturnThis(),
      skip:   vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      lean:   vi.fn().mockResolvedValue(fakeUsers),
    };
    User.find.mockReturnValue(query);

    const req = { query: {} };
    const res = mockRes();
    await getUsersHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 5 }));
  });

  it('createSuperUserHandler devuelve 400 si falta email', async () => {
    const req = { body: { clubId: 'CARC' } };
    const res = mockRes();
    await createSuperUserHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createSuperUserHandler crea usuario y devuelve tempPassword', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ _id: 'u1', email: 'a@b.com', nombre: 'Test', roles: ['admin'], clubId: 'CARC' });
    const req = { body: { email: 'a@b.com', clubId: 'CARC', nombre: 'Test' } };
    const res = mockRes();
    await createSuperUserHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tempPassword: expect.any(String) }));
  });

  it('deleteSuperUserHandler desactiva usuario', async () => {
    User.findByIdAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: 'u1', active: false }),
    });
    const req = { params: { id: 'u1' } };
    const res = mockRes();
    await deleteSuperUserHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resetUserPasswordHandler resetea contraseña', async () => {
    const fakeUser = { _id: 'u1', password: 'old', mustChangePassword: false, passwordChangedAt: null, save: vi.fn() };
    User.findById.mockResolvedValue(fakeUser);
    const req = { params: { id: 'u1' } };
    const res = mockRes();
    await resetUserPasswordHandler(req, res);
    expect(fakeUser.mustChangePassword).toBe(true);
    expect(fakeUser.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tempPassword: expect.any(String) }));
  });
});
