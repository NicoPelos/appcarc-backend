import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../services/permisosCache.js', () => ({
  getPermisosUsuario: vi.fn().mockResolvedValue(['socios:read', 'muroLibre:read']),
}));

vi.mock('../../../roles/services/resolverRoles.service.js', () => ({
  obtenerRolIdsPorNombres: vi.fn().mockResolvedValue(['rol-id-1']),
  obtenerRolIdsPorSlugs: vi.fn().mockResolvedValue(['rol-id-1']),
  obtenerSlugsPorRolIds: vi.fn().mockResolvedValue(['secretaria']),
}));

vi.mock('../../../../services/refreshTokenService.js', () => ({
  issueRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
  findValidRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

import User from '../../models/User.js';
import Socio from '../../../socios/models/Socio.js';
import VinculoFamiliar from '../../../vinculos/models/VinculoFamiliar.js';
import Notification from '../../../notificaciones/models/Notification.js';
import * as authHandlers from '../../handlers/auth.handler.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import tokenService from '../../../../services/tokenBlacklistService.js';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { obtenerRolIdsPorNombres, obtenerSlugsPorRolIds } from '../../../roles/services/resolverRoles.service.js';
import { issueRefreshToken, findValidRefreshToken, revokeRefreshToken } from '../../../../services/refreshTokenService.js';

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
    Socio.findById = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    VinculoFamiliar.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
    VinculoFamiliar.findOne = vi.fn().mockResolvedValue(null);
    Notification.aggregate = vi.fn().mockResolvedValue([]);
    vi.spyOn(User.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'mock-token');
    vi.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed-pass');
    vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    vi.spyOn(tokenService, 'addToken').mockImplementation(async () => true);
    obtenerRolIdsPorNombres.mockResolvedValue(['rol-id-1']);
    obtenerSlugsPorRolIds.mockResolvedValue(['secretaria']);
    issueRefreshToken.mockResolvedValue('mock-refresh-token');
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

  it('appcarc-backend#67: register no debe setear socioId:null explícito cuando no hay socio (rompe el índice unique+sparse)', async () => {
    User.findOne.mockResolvedValue(null);
    Socio.findOne.mockResolvedValue(null);
    let constructedUser = null;
    User.prototype.save.mockImplementation(async function () { constructedUser = this; return this; });
    const req = { body: { email: 'sinSocio@b.com', password: 'pass', clubId: 'club1' } };
    const res = mockRes();

    await authHandlers.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(constructedUser.socioId).toBeUndefined();
    expect('socioId' in constructedUser.toObject()).toBe(false);
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

  it('login should return requiresProfileSelection when the user has a socio propio and a vínculo', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', email: 'a@b.com', password: 'hashed-pass', roles: ['secretaria'], clubId: 'c1', active: true, socioId: 'socio-propio' });
    Socio.findById = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-propio', nombre: 'Juan', apellido: 'Pérez', fotoPerfil: null }) }) });
    VinculoFamiliar.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ hijoSocioId: { _id: 'socio-hijo', nombre: 'Hijo', apellido: 'Pérez', fotoPerfil: null } }]),
      }),
    });

    const req = { body: { email: 'a@b.com', password: 'pass' } };
    const res = mockRes();

    await authHandlers.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      requiresProfileSelection: true,
      selectToken: 'mock-token',
      perfiles: [
        expect.objectContaining({ socioId: 'socio-propio', tipo: 'propio' }),
        expect.objectContaining({ socioId: 'socio-hijo', tipo: 'vinculado' }),
      ],
    }));
  });

  it('login should log in directly as the único vínculo when the user has no socio propio', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', email: 'papa@b.com', password: 'hashed-pass', roles: [], clubId: 'c1', active: true, socioId: null });
    VinculoFamiliar.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ hijoSocioId: { _id: 'socio-hijo', nombre: 'Hijo', apellido: 'Pérez', fotoPerfil: null } }]),
      }),
    });
    Socio.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-hijo', nombre: 'Hijo', apellido: 'Pérez' }) });

    const req = { body: { email: 'papa@b.com', password: 'pass' } };
    const res = mockRes();

    await authHandlers.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: 'mock-token',
      user: expect.objectContaining({ socioId: 'socio-hijo', roles: ['socio'] }),
    }));
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ requiresProfileSelection: true }));
  });

  it('selectProfile should return 401 when the selectToken is invalid', async () => {
    vi.spyOn(jwt, 'verify').mockImplementation(() => { throw new Error('bad token'); });
    const req = { body: { selectToken: 'garbage', socioId: 'socio-hijo' } };
    const res = mockRes();

    await authHandlers.selectProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('selectProfile should return 401 when the token type is not profile-select', async () => {
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', clubId: 'c1', type: 'other' });
    const req = { body: { selectToken: 'tok', socioId: 'socio-hijo' } };
    const res = mockRes();

    await authHandlers.selectProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('selectProfile should return 403 when the chosen socioId has no active vínculo', async () => {
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', clubId: 'c1', type: 'profile-select' });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'papa@b.com', clubId: 'c1', active: true, socioId: null, roles: [] });
    VinculoFamiliar.findOne.mockResolvedValue(null);
    const req = { body: { selectToken: 'tok', socioId: 'socio-ajeno' } };
    const res = mockRes();

    await authHandlers.selectProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('selectProfile should issue the final token scoped to the vinculado socioId with rol socio', async () => {
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', clubId: 'c1', type: 'profile-select' });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'papa@b.com', clubId: 'c1', active: true, socioId: null, roles: [] });
    VinculoFamiliar.findOne.mockResolvedValue({ _id: 'vinc1', padreUserId: 'u1', hijoSocioId: 'socio-hijo', active: true });
    Socio.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-hijo', nombre: 'Hijo', apellido: 'Pérez' }) });

    const req = { body: { selectToken: 'tok', socioId: 'socio-hijo' } };
    const res = mockRes();

    await authHandlers.selectProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: 'mock-token',
      user: expect.objectContaining({ socioId: 'socio-hijo', roles: ['socio'] }),
    }));
  });

  it('selectProfile should issue the full token when choosing the perfil propio', async () => {
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', clubId: 'c1', type: 'profile-select' });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'papa@b.com', clubId: 'c1', active: true, socioId: 'socio-propio', roles: ['rol-id-1'] });
    Socio.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-propio', nombre: 'Papá' }) });

    const req = { body: { selectToken: 'tok', socioId: 'socio-propio' } };
    const res = mockRes();

    await authHandlers.selectProfile(req, res);

    expect(VinculoFamiliar.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ socioId: 'socio-propio', roles: ['secretaria'] }),
    }));
  });

  it('getProfiles should list perfiles of the logged in user', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', clubId: 'c1', active: true, socioId: 'socio-propio' });
    Socio.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-propio', nombre: 'Juan', apellido: 'Pérez', fotoPerfil: null }) }) });

    const req = { user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.getProfiles(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ perfiles: [expect.objectContaining({ socioId: 'socio-propio', tipo: 'propio' })] });
  });

  it('getProfiles should include the unread notification count per perfil', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', clubId: 'c1', active: true, socioId: 'socio-propio' });
    Socio.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-propio', nombre: 'Juan', apellido: 'Pérez', fotoPerfil: null }) }) });
    VinculoFamiliar.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ hijoSocioId: { _id: 'socio-hijo', nombre: 'Ana', apellido: 'Pérez', fotoPerfil: null } }]),
      }),
    });
    Notification.aggregate.mockResolvedValue([{ _id: 'socio-hijo', count: 3 }]);

    const req = { user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.getProfiles(req, res);

    const { perfiles } = res.json.mock.calls[0][0];
    expect(perfiles.find((p) => p.socioId === 'socio-propio').notificacionesNoLeidas).toBe(0);
    expect(perfiles.find((p) => p.socioId === 'socio-hijo').notificacionesNoLeidas).toBe(3);
  });

  it('getProfiles should return 401 when the user is missing or inactive', async () => {
    User.findById.mockResolvedValue(null);
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.getProfiles(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('switchProfile should return 400 without socioId', async () => {
    const req = { body: {}, user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.switchProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('switchProfile should return 403 when the socioId has no active vínculo', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', clubId: 'c1', active: true, socioId: null });
    VinculoFamiliar.findOne.mockResolvedValue(null);

    const req = { body: { socioId: 'socio-ajeno' }, user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.switchProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('switchProfile should issue a new token for a vinculado profile without touching selectToken', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', clubId: 'c1', active: true, socioId: 'socio-papa' });
    VinculoFamiliar.findOne.mockResolvedValue({ _id: 'vinc1', padreUserId: 'u1', hijoSocioId: 'socio-hijo', active: true });
    Socio.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'socio-hijo', nombre: 'Hijo' }) });

    const req = { body: { socioId: 'socio-hijo' }, user: { id: 'u1' } };
    const res = mockRes();
    await authHandlers.switchProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ socioId: 'socio-hijo', roles: ['socio'] }),
    }));
  });

  // Socio.findById se usa con 3 formas de encadenar distintas en este archivo
  // (await directo, .lean(), .select().lean()) — este mock soporta las tres.
  const makeSocioFindByIdMock = (socio) => ({
    then: (resolve) => Promise.resolve(socio).then(resolve),
    lean: vi.fn().mockResolvedValue(socio),
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(socio) }),
  });

  it('googleLogin should return requiresProfileSelection when the user has a socio propio and a vínculo', async () => {
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ email: 'papa@b.com', email_verified: true, sub: 'google-sub-1' }),
    });
    User.findOne.mockResolvedValue({ _id: 'u1', email: 'papa@b.com', clubId: 'CARC', active: true, socioId: 'socio-propio', roles: [], googleId: 'google-sub-1' });
    Socio.findById.mockReturnValue(makeSocioFindByIdMock({ _id: 'socio-propio', nombre: 'Papá', apellido: 'Pérez', fotoPerfil: 'foto' }));
    VinculoFamiliar.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ hijoSocioId: { _id: 'socio-hijo', nombre: 'Hijo', apellido: 'Pérez', fotoPerfil: null } }]),
      }),
    });

    const req = { body: { idToken: 'fake-id-token', clubId: 'CARC' } };
    const res = mockRes();
    await authHandlers.googleLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      requiresProfileSelection: true,
      selectToken: 'mock-token',
      perfiles: [
        expect.objectContaining({ socioId: 'socio-propio', tipo: 'propio' }),
        expect.objectContaining({ socioId: 'socio-hijo', tipo: 'vinculado' }),
      ],
    }));
  });

  it('googleLogin should log in directly when the user only has their own perfil (no vínculos)', async () => {
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ email: 'socio@b.com', email_verified: true, sub: 'google-sub-2' }),
    });
    User.findOne.mockResolvedValue({ _id: 'u2', email: 'socio@b.com', clubId: 'CARC', active: true, socioId: 'socio-1', roles: [], googleId: 'google-sub-2' });
    Socio.findById.mockReturnValue(makeSocioFindByIdMock({ _id: 'socio-1', nombre: 'Juan', apellido: 'Pérez', fotoPerfil: null }));

    const req = { body: { idToken: 'fake-id-token', clubId: 'CARC' } };
    const res = mockRes();
    await authHandlers.googleLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: 'mock-token',
      user: expect.objectContaining({ socioId: 'socio-1' }),
    }));
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ requiresProfileSelection: true }));
  });

  it('logout should add token to blacklist', async () => {
    const req = { headers: { authorization: 'Bearer sometoken' } };
    const res = mockRes();

    await authHandlers.logout(req, res);

    expect(tokenService.addToken).toHaveBeenCalledWith('sometoken');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('logout should revoke the refresh token when provided', async () => {
    const req = { headers: { authorization: 'Bearer sometoken' }, body: { refreshToken: 'rt1' } };
    const res = mockRes();

    await authHandlers.logout(req, res);

    expect(revokeRefreshToken).toHaveBeenCalledWith('rt1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refresh should return 400 without refreshToken', async () => {
    const req = { body: {} };
    const res = mockRes();

    await authHandlers.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refresh should return 401 when the refreshToken is invalid or expired', async () => {
    findValidRefreshToken.mockResolvedValue(null);
    const req = { body: { refreshToken: 'nope' } };
    const res = mockRes();

    await authHandlers.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refresh should return 401 and revoke the token when the user no longer exists or is inactive', async () => {
    findValidRefreshToken.mockResolvedValue({ userId: 'u1', payload: { socioId: null, roles: ['secretaria'], clubId: 'club1' } });
    User.findById.mockResolvedValue(null);
    const req = { body: { refreshToken: 'rt1' } };
    const res = mockRes();

    await authHandlers.refresh(req, res);

    expect(revokeRefreshToken).toHaveBeenCalledWith('rt1');
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refresh should rotate the token and preserve the active profile (ej. un perfil vinculado)', async () => {
    findValidRefreshToken.mockResolvedValue({ userId: 'u1', payload: { socioId: 'socio-hijo', roles: ['socio'], clubId: 'club1' } });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'a@b.com', roles: [], clubId: 'club1', mustChangePassword: false, active: true });
    const req = { body: { refreshToken: 'rt1' } };
    const res = mockRes();

    await authHandlers.refresh(req, res);

    expect(revokeRefreshToken).toHaveBeenCalledWith('rt1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: 'mock-token',
      refreshToken: 'mock-refresh-token',
      user: expect.objectContaining({ socioId: 'socio-hijo', roles: ['socio'] }),
    }));
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
