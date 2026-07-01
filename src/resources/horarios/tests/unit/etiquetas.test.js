import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave = vi.fn();
vi.mock('../../models/HorarioEtiqueta.js', () => {
  const ctor = vi.fn().mockImplementation((data) => ({ ...data, save: mockSave }));
  ctor.find = vi.fn();
  ctor.findOneAndDelete = vi.fn();
  return { default: ctor };
});

import { getEtiquetasHandler } from '../../handlers/getEtiquetas.handler.js';
import { createEtiquetaHandler } from '../../handlers/createEtiqueta.handler.js';
import { deleteEtiquetaHandler } from '../../handlers/deleteEtiqueta.handler.js';
import HorarioEtiqueta from '../../models/HorarioEtiqueta.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('getEtiquetasHandler', () => {
  it('devuelve lista de etiquetas', async () => {
    const etiquetas = [{ tipo: 'nombre', valor: 'Juan' }];
    HorarioEtiqueta.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(etiquetas) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getEtiquetasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(etiquetas);
  });

  it('filtra por tipo', async () => {
    HorarioEtiqueta.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });

    const req = { user: mockUser, query: { tipo: 'nombre' } };
    const res = mockRes();
    await getEtiquetasHandler(req, res);

    expect(HorarioEtiqueta.find).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'nombre' }));
  });

  it('retorna 500 si hay error', async () => {
    HorarioEtiqueta.find.mockReturnValue({ sort: vi.fn().mockRejectedValue(new Error('DB')) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getEtiquetasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('createEtiquetaHandler', () => {
  it('crea etiqueta correctamente', async () => {
    mockSave.mockResolvedValue();
    const req = { user: mockUser, body: { tipo: 'nombre', valor: 'Juan' } };
    const res = mockRes();
    await createEtiquetaHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si tipo es inválido', async () => {
    const req = { user: mockUser, body: { tipo: 'invalido', valor: 'Juan' } };
    const res = mockRes();
    await createEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si falta valor', async () => {
    const req = { user: mockUser, body: { tipo: 'nombre', valor: '' } };
    const res = mockRes();
    await createEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 409 si etiqueta duplicada', async () => {
    mockSave.mockRejectedValue({ code: 11000 });
    const req = { user: mockUser, body: { tipo: 'nombre', valor: 'Juan' } };
    const res = mockRes();
    await createEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('retorna 500 si hay error al guardar', async () => {
    mockSave.mockRejectedValue(new Error('DB'));
    const req = { user: mockUser, body: { tipo: 'nombre', valor: 'Juan' } };
    const res = mockRes();
    await createEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('deleteEtiquetaHandler', () => {
  it('elimina etiqueta correctamente', async () => {
    HorarioEtiqueta.findOneAndDelete.mockResolvedValue({ _id: '1', valor: 'Juan' });

    const req = { user: mockUser, params: { id: '1' } };
    const res = mockRes();
    await deleteEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 si no existe', async () => {
    HorarioEtiqueta.findOneAndDelete.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: '1' } };
    const res = mockRes();
    await deleteEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 500 si hay error', async () => {
    HorarioEtiqueta.findOneAndDelete.mockRejectedValue(new Error('DB'));

    const req = { user: mockUser, params: { id: '1' } };
    const res = mockRes();
    await deleteEtiquetaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
