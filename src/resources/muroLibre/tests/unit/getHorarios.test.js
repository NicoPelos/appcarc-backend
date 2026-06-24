import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHorariosHandler } from '../../handlers/getHorarios.handler.js';
import Horarios from '../../models/Horarios.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

const makeQuery = (data) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(data),
});

describe('getHorariosHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return active horarios by default', async () => {
    const items = [{ _id: 'h1', nombre: 'Vladimir', active: true }];
    vi.spyOn(Horarios, 'countDocuments').mockResolvedValue(1);
    vi.spyOn(Horarios, 'find').mockReturnValue(makeQuery(items));

    const res = mockRes();
    await getHorariosHandler({ query: {}, user: USER }, res);

    expect(Horarios.find).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.horarios).toEqual(items);
    expect(body.total).toBe(1);
  });

  it('should return deleted horarios when trash=true', async () => {
    vi.spyOn(Horarios, 'countDocuments').mockResolvedValue(1);
    vi.spyOn(Horarios, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getHorariosHandler({ query: { trash: 'true' }, user: USER }, res);

    expect(Horarios.find).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should filter by nombre', async () => {
    vi.spyOn(Horarios, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(Horarios, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getHorariosHandler({ query: { nombre: 'Lu' }, user: USER }, res);

    const callArg = Horarios.find.mock.calls[0][0];
    expect(callArg.nombre).toBeInstanceOf(RegExp);
  });

  it('should filter by tipoTarea', async () => {
    vi.spyOn(Horarios, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(Horarios, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getHorariosHandler({ query: { tipoTarea: 'Clase' }, user: USER }, res);

    expect(Horarios.find).toHaveBeenCalledWith(expect.objectContaining({ tipoTarea: 'Clase' }));
  });

  it('should filter by date range when desde and hasta provided', async () => {
    vi.spyOn(Horarios, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(Horarios, 'find').mockReturnValue(makeQuery([]));

    const res = mockRes();
    await getHorariosHandler({ query: { desde: '2026-06-01', hasta: '2026-06-30' }, user: USER }, res);

    const callArg = Horarios.find.mock.calls[0][0];
    expect(callArg.fecha).toHaveProperty('$gte');
    expect(callArg.fecha).toHaveProperty('$lte');
  });

  it('should return 500 on unexpected error', async () => {
    vi.spyOn(Horarios, 'countDocuments').mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await getHorariosHandler({ query: {}, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
