import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveGlobal = vi.fn();
vi.mock('../../models/CategoriaEscuelita.js', () => {
  const ctor = vi.fn().mockImplementation((data) => ({ ...data, save: mockSaveGlobal }));
  ctor.find = vi.fn();
  ctor.findOne = vi.fn();
  return { default: ctor };
});

import { getCategoriasHandler } from '../../handlers/getCategorias.handler.js';
import { createCategoriaHandler } from '../../handlers/createCategoria.handler.js';
import { updateCategoriaHandler } from '../../handlers/updateCategoria.handler.js';
import { deleteCategoriaHandler } from '../../handlers/deleteCategoria.handler.js';
import CategoriaEscuelita from '../../models/CategoriaEscuelita.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('getCategoriasHandler', () => {
  it('devuelve lista de categorías activas', async () => {
    const cats = [{ nombre: 'Niños', codigo: 'ninos_2x' }];
    CategoriaEscuelita.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(cats) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getCategoriasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cats);
  });

  it('retorna 500 si hay error', async () => {
    CategoriaEscuelita.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB')) }) });

    const req = { user: mockUser, query: {} };
    const res = mockRes();
    await getCategoriasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('createCategoriaHandler', () => {
  const validBody = { nombre: 'Niños', codigo: 'ninos_2x', frecuenciaSemanal: 2, precioMensual: 5000 };

  it('crea categoría correctamente', async () => {
    CategoriaEscuelita.findOne.mockResolvedValue(null);
    mockSaveGlobal.mockResolvedValue();

    const req = { user: mockUser, body: validBody };
    const res = mockRes();
    await createCategoriaHandler(req, res);

    expect(mockSaveGlobal).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('retorna 400 si falta nombre', async () => {
    const req = { user: mockUser, body: { ...validBody, nombre: undefined } };
    const res = mockRes();
    await createCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si falta codigo', async () => {
    const req = { user: mockUser, body: { ...validBody, codigo: undefined } };
    const res = mockRes();
    await createCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si frecuenciaSemanal es inválida', async () => {
    const req = { user: mockUser, body: { ...validBody, frecuenciaSemanal: 3 } };
    const res = mockRes();
    await createCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 409 si el codigo ya existe', async () => {
    CategoriaEscuelita.findOne.mockResolvedValue({ _id: '1' });
    const req = { user: mockUser, body: validBody };
    const res = mockRes();
    await createCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('updateCategoriaHandler', () => {
  it('actualiza precioMensual correctamente', async () => {
    const mockSave = vi.fn().mockResolvedValue();
    CategoriaEscuelita.findOne.mockResolvedValue({ _id: '1', precioMensual: 5000, save: mockSave });

    const req = { user: mockUser, params: { id: '1' }, body: { precioMensual: 6000 } };
    const res = mockRes();
    await updateCategoriaHandler(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 si no existe', async () => {
    CategoriaEscuelita.findOne.mockResolvedValue(null);
    const req = { user: mockUser, params: { id: '1' }, body: {} };
    const res = mockRes();
    await updateCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 400 si frecuenciaSemanal es inválida', async () => {
    CategoriaEscuelita.findOne.mockResolvedValue({ _id: '1', save: vi.fn() });
    const req = { user: mockUser, params: { id: '1' }, body: { frecuenciaSemanal: 5 } };
    const res = mockRes();
    await updateCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('deleteCategoriaHandler', () => {
  it('soft delete correctamente', async () => {
    const mockSave = vi.fn().mockResolvedValue();
    const cat = { _id: '1', active: true, save: mockSave };
    CategoriaEscuelita.findOne.mockResolvedValue(cat);

    const req = { user: mockUser, params: { id: '1' } };
    const res = mockRes();
    await deleteCategoriaHandler(req, res);

    expect(cat.active).toBe(false);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 si no existe', async () => {
    CategoriaEscuelita.findOne.mockResolvedValue(null);
    const req = { user: mockUser, params: { id: '1' } };
    const res = mockRes();
    await deleteCategoriaHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
