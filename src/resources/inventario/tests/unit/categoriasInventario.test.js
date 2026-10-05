import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../audit/services/audit.service.js', () => ({ logAudit: vi.fn() }));
vi.mock('../../models/CategoriaInventario.js', () => {
  const CategoriaInventario = vi.fn();
  CategoriaInventario.exists = vi.fn();
  CategoriaInventario.insertMany = vi.fn().mockResolvedValue([]);
  CategoriaInventario.find = vi.fn();
  CategoriaInventario.create = vi.fn();
  return {
    default: CategoriaInventario,
    CATEGORIAS_POR_DEFECTO: ['Cuerdas', 'Otros'],
  };
});

import CategoriaInventario from '../../models/CategoriaInventario.js';
import { createCategoriaInventarioHandler } from '../../handlers/categoriasInventario.handler.js';

const USER = { id: 'u1', email: 'staff@club.ar', clubId: 'CARC' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('createCategoriaInventarioHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CategoriaInventario.exists.mockResolvedValue(true);
  });

  it('rechaza un nombre vacío', async () => {
    const res = mockRes();
    await createCategoriaInventarioHandler({ body: { nombre: '   ' }, user: USER }, res);
    expect(CategoriaInventario.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responde 409 si la categoría ya existe (sin distinguir mayúsculas)', async () => {
    CategoriaInventario.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const res = mockRes();
    await createCategoriaInventarioHandler({ body: { nombre: 'cuerdas' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('crea la categoría del club del staff', async () => {
    CategoriaInventario.create.mockResolvedValue({ nombre: 'Bicis', _id: 'c1', toObject: () => ({}) });
    const res = mockRes();
    await createCategoriaInventarioHandler({ body: { nombre: ' Bicis ' }, user: USER }, res);
    expect(CategoriaInventario.create).toHaveBeenCalledWith({ clubId: 'CARC', nombre: 'Bicis', createdBy: 'staff@club.ar' });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
