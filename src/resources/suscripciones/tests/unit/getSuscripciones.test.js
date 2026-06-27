import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSuscripcionesHandler } from '../../handlers/getSuscripciones.handler.js';

vi.mock('../../models/Suscripcion.js', () => ({
  default: { find: vi.fn() },
}));

import Suscripcion from '../../models/Suscripcion.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeChain = (result) => ({
  populate: vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(result),
    }),
  }),
});

beforeEach(() => vi.clearAllMocks());

describe('getSuscripcionesHandler', () => {
  it('retorna lista de suscripciones filtradas por socioId', async () => {
    const suscripciones = [
      { socioId: 'socio1', etiquetaId: { nombre: 'Cuota Social', unidad: 'mes' }, fechaDesde: '2026-01' },
    ];
    Suscripcion.find.mockReturnValue(makeChain(suscripciones));

    const req = { user: mockUser, query: { socioId: 'socio1' } };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    expect(Suscripcion.find).toHaveBeenCalledWith(expect.objectContaining({ socioId: 'socio1', clubId: 'CARC' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(suscripciones);
  });

  it('filtra solo activas cuando activa=true (fechaHasta null)', async () => {
    Suscripcion.find.mockReturnValue(makeChain([]));

    const req = { user: mockUser, query: { socioId: 'socio1', activa: 'true' } };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    expect(Suscripcion.find).toHaveBeenCalledWith(expect.objectContaining({ fechaHasta: null }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('no agrega filtro fechaHasta cuando activa no es true', async () => {
    Suscripcion.find.mockReturnValue(makeChain([]));

    const req = { user: mockUser, query: { socioId: 'socio1' } };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    const filterUsed = Suscripcion.find.mock.calls[0][0];
    expect(filterUsed).not.toHaveProperty('fechaHasta');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('popula etiquetaId con nombre y unidad', async () => {
    const chain = makeChain([]);
    Suscripcion.find.mockReturnValue(chain);

    const req = { user: mockUser, query: { socioId: 'socio1' } };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    expect(chain.populate).toHaveBeenCalledWith('etiquetaId', 'nombre unidad');
  });

  it('retorna 400 si falta socioId', async () => {
    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Suscripcion.find).not.toHaveBeenCalled();
  });

  it('retorna 500 si hay error de base de datos', async () => {
    Suscripcion.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      }),
    });

    const req = { user: mockUser, query: { socioId: 'socio1' } };
    const res = mockRes();

    await getSuscripcionesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
