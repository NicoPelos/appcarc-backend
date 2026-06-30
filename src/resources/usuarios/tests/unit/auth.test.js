import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import User from '../../models/User.js';
import Socio from '../../../socios/models/Socio.js';
import * as authHandlers from '../../handlers/auth.handler.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import tokenService from '../../../../services/tokenBlacklistService.js';
import mongoose from 'mongoose';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('Usuarios auth handlers (unit)', () => {
  beforeEach(() => {
    User.findOne = vi.fn();
    User.findById = vi.fn();
    Socio.findOne = vi.fn().mockResolvedValue(null);
    Socio.findById = vi.fn().mockResolvedValue(null);
    vi.spyOn(User.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'mock-token');
    vi.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed-pass');
    vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    vi.spyOn(tokenService, 'addToken').mockImplementation(async () => true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('register should create user and return token', async () => {
    User.findOne.mockResolvedValue(null);
    const req = { body: { email: 'a@b.com', password: 'pass', nombre: 'N', clubId: 'club1' } };
    const res = mockRes();

    await authHandlers.register(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@b.com', clubId: 'club1' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }));
  });

  it('register should link socioId when socio exists with same email', async () => {
    User.findOne.mockResolvedValue(null);
    Socio.findOne.mockResolvedValue({ _id: 'socio1', nombre: 'Ana', clubId: 'club1' });
    const req = { body: { email: 'ana@b.com', password: 'pass', clubId: 'club1' } };
    const res = mockRes();

    await authHandlers.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ socioId: 'socio1' }),
    }));
  });

  it('login should return token and socio when credentials valid', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', email: 'a@b.com', password: 'hashed-pass', roles: ['secretaria'], clubId: 'c1', active: true, socioId: null });
    const req = { body: { email: 'a@b.com', password: 'pass' } };
    const res = mockRes();

    await authHandlers.login(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token', socio: null }));
  });

  it('logout should add token to blacklist', async () => {
    const req = { headers: { authorization: 'Bearer sometoken' } };
    const res = mockRes();

    await authHandlers.logout(req, res);

    expect(tokenService.addToken).toHaveBeenCalledWith('sometoken');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('registerPushToken should update user and return 200', async () => {
    User.findByIdAndUpdate = vi.fn().mockResolvedValue({});
    const req = {
      body: { expoPushToken: 'ExponentPushToken[abc123]' },
      user: { id: 'u1' },
    };
    const res = mockRes();

    await authHandlers.registerPushToken(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { expoPushToken: 'ExponentPushToken[abc123]' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('registerPushToken should return 400 when token is missing', async () => {
    const req = { body: {}, user: { id: 'u1' } };
    const res = mockRes();

    await authHandlers.registerPushToken(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
