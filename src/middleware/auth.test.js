import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/permisosCache.js', () => ({
  tienePermiso: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

vi.mock('../services/tokenBlacklistService.js', () => ({
  default: { hasToken: vi.fn().mockResolvedValue(false) },
}));

vi.mock('../resources/usuarios/models/User.js', () => ({
  default: { findById: vi.fn() },
}));

vi.mock('../resources/vinculos/models/VinculoFamiliar.js', () => ({
  default: { exists: vi.fn() },
}));

import jwt from 'jsonwebtoken';
import { authorizeSelfSocioOr, authorizeSelfSocioQueryOr, protect } from './auth.js';
import { tienePermiso } from '../services/permisosCache.js';
import tokenService from '../services/tokenBlacklistService.js';
import User from '../resources/usuarios/models/User.js';
import VinculoFamiliar from '../resources/vinculos/models/VinculoFamiliar.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('authorizeSelfSocioOr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deja pasar a un socio operando sobre su propio registro, sin chequear permisos', async () => {
    const req = { user: { roles: ['socio'], socioId: 'socio1', clubId: 'CARC' }, params: { id: 'socio1' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioOr('socios:write')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(tienePermiso).not.toHaveBeenCalled();
  });

  it('rechaza a un socio operando sobre el registro de otro, sin el permiso', async () => {
    tienePermiso.mockResolvedValue(false);
    const req = { user: { roles: ['socio'], socioId: 'socio1', clubId: 'CARC' }, params: { id: 'otroSocio' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioOr('socios:write')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deja pasar a staff con el permiso, aunque no sea el propio socio', async () => {
    tienePermiso.mockResolvedValue(true);
    const req = { user: { roles: ['admin'], socioId: null, clubId: 'CARC' }, params: { id: 'socio1' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioOr('socios:write')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deja pasar siempre a superadmin', async () => {
    const req = { user: { roles: ['superadmin'], socioId: null, clubId: 'SUPER' }, params: { id: 'socio1' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioOr('socios:write')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(tienePermiso).not.toHaveBeenCalled();
  });
});

describe('authorizeSelfSocioQueryOr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deja pasar a un socio consultando su propio socioId por query, sin chequear permisos', async () => {
    const req = { user: { roles: ['socio'], socioId: 'socio1', clubId: 'CARC' }, query: { socioId: 'socio1' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioQueryOr('escuelita:read')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(tienePermiso).not.toHaveBeenCalled();
  });

  it('rechaza a un socio consultando el socioId de otro, sin el permiso', async () => {
    tienePermiso.mockResolvedValue(false);
    const req = { user: { roles: ['socio'], socioId: 'socio1', clubId: 'CARC' }, query: { socioId: 'otroSocio' } };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioQueryOr('escuelita:read')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rechaza a un socio sin query.socioId (listado completo), sin el permiso', async () => {
    tienePermiso.mockResolvedValue(false);
    const req = { user: { roles: ['socio'], socioId: 'socio1', clubId: 'CARC' }, query: {} };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioQueryOr('escuelita:read')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deja pasar a staff con el permiso, sin importar el query', async () => {
    tienePermiso.mockResolvedValue(true);
    const req = { user: { roles: ['admin'], socioId: null, clubId: 'CARC' }, query: {} };
    const res = mockRes();
    const next = vi.fn();

    await authorizeSelfSocioQueryOr('escuelita:read')(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('protect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenService.hasToken.mockResolvedValue(false);
  });

  const mockReq = () => ({ headers: { authorization: 'Bearer tok123' } });

  it('deja pasar cuando el socioId del token es el propio del User, sin consultar VinculoFamiliar', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', clubId: 'CARC', socioId: 'socio1', iat: 1000 });
    User.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ active: true, socioId: 'socio1' }) }) });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(VinculoFamiliar.exists).not.toHaveBeenCalled();
  });

  it('deja pasar cuando el token no trae socioId (staff), sin consultar VinculoFamiliar', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', clubId: 'CARC', socioId: null, iat: 1000 });
    User.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ active: true, socioId: null }) }) });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(VinculoFamiliar.exists).not.toHaveBeenCalled();
  });

  it('deja pasar cuando actúa vía un perfil vinculado y el vínculo sigue activo', async () => {
    jwt.verify.mockReturnValue({ id: 'padre1', clubId: 'CARC', socioId: 'hijo1', iat: 1000 });
    User.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ active: true, socioId: 'socioPropioPadre' }) }) });
    VinculoFamiliar.exists.mockResolvedValue(true);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await protect(req, res, next);

    expect(VinculoFamiliar.exists).toHaveBeenCalledWith({
      clubId: 'CARC', padreUserId: 'padre1', hijoSocioId: 'hijo1', active: true,
    });
    expect(next).toHaveBeenCalled();
  });

  it('rechaza con 401 si el vínculo fue anulado (appcarc-backend#71)', async () => {
    jwt.verify.mockReturnValue({ id: 'padre1', clubId: 'CARC', socioId: 'hijo1', iat: 1000 });
    User.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ active: true, socioId: 'socioPropioPadre' }) }) });
    VinculoFamiliar.exists.mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await protect(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
