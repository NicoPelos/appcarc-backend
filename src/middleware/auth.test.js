import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/permisosCache.js', () => ({
  tienePermiso: vi.fn(),
}));

import { authorizeSelfSocioOr } from './auth.js';
import { tienePermiso } from '../services/permisosCache.js';

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
