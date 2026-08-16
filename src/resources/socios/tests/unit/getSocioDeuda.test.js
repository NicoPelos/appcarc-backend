import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../cuotas/services/calcularDeuda.service.js', () => ({
  calcularDeuda: vi.fn(),
}));
vi.mock('../../../vinculos/services/getSocioIdsAccesibles.service.js', () => ({
  getSocioIdsAccesibles: vi.fn(),
}));

import { calcularDeuda } from '../../../cuotas/services/calcularDeuda.service.js';
import { getSocioIdsAccesibles } from '../../../vinculos/services/getSocioIdsAccesibles.service.js';
import { getSocioDeudaHandler } from '../../handlers/getSocioDeuda.handler.js';

const CLUB_ID = 'CARC';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const HIJO_ID = '507f1f77bcf86cd799439022';
const OTRO_ID = '507f1f77bcf86cd799439099';

const buildRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  calcularDeuda.mockResolvedValue({ suscripciones: [], otrosCargos: [] });
});

describe('getSocioDeudaHandler', () => {
  it('deja pasar a un socio consultando su propio id', async () => {
    getSocioIdsAccesibles.mockResolvedValue({ ownSocioId: SOCIO_ID, accessibleIds: new Set([SOCIO_ID]) });
    const req = { params: { id: SOCIO_ID }, user: { id: 'u1', roles: ['socio'], clubId: CLUB_ID, socioId: SOCIO_ID } };
    const res = buildRes();

    await getSocioDeudaHandler(req, res);

    expect(calcularDeuda).toHaveBeenCalledWith({ socioId: SOCIO_ID, clubId: CLUB_ID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deja pasar a un tutor consultando la deuda de un hijo vinculado, aunque no sea el perfil activo', async () => {
    getSocioIdsAccesibles.mockResolvedValue({ ownSocioId: SOCIO_ID, accessibleIds: new Set([SOCIO_ID, HIJO_ID]) });
    const req = { params: { id: HIJO_ID }, user: { id: 'u1', roles: ['socio'], clubId: CLUB_ID, socioId: SOCIO_ID } };
    const res = buildRes();

    await getSocioDeudaHandler(req, res);

    expect(calcularDeuda).toHaveBeenCalledWith({ socioId: HIJO_ID, clubId: CLUB_ID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rechaza con 403 a un socio consultando el id de alguien que no es ni suyo ni de un hijo vinculado', async () => {
    getSocioIdsAccesibles.mockResolvedValue({ ownSocioId: SOCIO_ID, accessibleIds: new Set([SOCIO_ID, HIJO_ID]) });
    const req = { params: { id: OTRO_ID }, user: { id: 'u1', roles: ['socio'], clubId: CLUB_ID, socioId: SOCIO_ID } };
    const res = buildRes();

    await getSocioDeudaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(calcularDeuda).not.toHaveBeenCalled();
  });

  it('deja pasar a staff privilegiado sin consultar los vínculos', async () => {
    const req = { params: { id: OTRO_ID }, user: { id: 'u1', roles: ['secretaria'], clubId: CLUB_ID, socioId: null } };
    const res = buildRes();

    await getSocioDeudaHandler(req, res);

    expect(getSocioIdsAccesibles).not.toHaveBeenCalled();
    expect(calcularDeuda).toHaveBeenCalledWith({ socioId: OTRO_ID, clubId: CLUB_ID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('devuelve 404 si el id no es un ObjectId válido', async () => {
    const req = { params: { id: 'no-es-valido' }, user: { id: 'u1', roles: ['admin'], clubId: CLUB_ID } };
    const res = buildRes();

    await getSocioDeudaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
