import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEtiquetasHandler } from '../../handlers/getEtiquetas.handler.js';

vi.mock('../../models/Etiqueta.js', () => ({
  default: { find: vi.fn() },
}));

import Etiqueta from '../../models/Etiqueta.js';

const mockUser = { clubId: 'CARC' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('getEtiquetasHandler', () => {
  it('devuelve lista de etiquetas activas', async () => {
    const etiquetas = [{ nombre: 'Cuota Social', unidad: 'mes' }];
    Etiqueta.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(etiquetas) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getEtiquetasHandler(req, res);

    expect(Etiqueta.find).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(etiquetas);
  });

  it('filtra por uso_sistema', async () => {
    Etiqueta.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const req = { user: mockUser, query: { uso_sistema: 'cuota_social' } };
    const res = mockRes();

    await getEtiquetasHandler(req, res);

    expect(Etiqueta.find).toHaveBeenCalledWith(expect.objectContaining({ uso_sistema: 'cuota_social' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('muestra eliminadas con trash=true', async () => {
    Etiqueta.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const req = { user: mockUser, query: { trash: 'true' } };
    const res = mockRes();

    await getEtiquetasHandler(req, res);

    expect(Etiqueta.find).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 500 si hay error', async () => {
    Etiqueta.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getEtiquetasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
