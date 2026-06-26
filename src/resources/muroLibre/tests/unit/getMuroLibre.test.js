import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../asistencias/models/Asistencia.js', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

import { getMuroLibreHandler } from '../../handlers/getMuroLibre.handler.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';

const mockUser = { clubId: 'CARC' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockFind = (results = []) =>
  Asistencia.find.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(results),
      }),
    }),
  });

beforeEach(() => vi.clearAllMocks());

describe('getMuroLibreHandler', () => {
  it('devuelve lista paginada de asistencias', async () => {
    const registros = [{ tipo: 'muro_libre', fecha: new Date() }];
    Asistencia.countDocuments.mockResolvedValue(1);
    mockFind(registros);

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getMuroLibreHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1, registros }));
  });

  it('aplica filtro de fecha from/to', async () => {
    Asistencia.countDocuments.mockResolvedValue(0);
    mockFind([]);

    const req = { user: mockUser, query: { from: '2026-01-01', to: '2026-01-31' } };
    const res = mockRes();
    await getMuroLibreHandler(req, res);

    expect(Asistencia.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }) }),
    );
  });

  it('respeta límite máximo de 500', async () => {
    Asistencia.countDocuments.mockResolvedValue(0);
    mockFind([]);

    const req = { user: mockUser, query: { limit: '9999' } };
    const res = mockRes();
    await getMuroLibreHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
  });

  it('retorna 500 si hay error', async () => {
    Asistencia.countDocuments.mockRejectedValue(new Error('DB'));

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getMuroLibreHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
