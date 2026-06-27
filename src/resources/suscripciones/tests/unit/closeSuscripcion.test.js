import { describe, it, expect, vi, beforeEach } from 'vitest';
import { closeSuscripcionHandler } from '../../handlers/closeSuscripcion.handler.js';

vi.mock('../../models/Suscripcion.js', () => ({
  default: { findOne: vi.fn() },
}));

import Suscripcion from '../../models/Suscripcion.js';

const mockUser = { clubId: 'CARC', email: 'admin@carc.com' };

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('closeSuscripcionHandler', () => {
  it('cierra suscripción correctamente (200)', async () => {
    const mockSave = vi.fn().mockResolvedValue();
    const suscripcion = { _id: 'sus123', fechaHasta: null, save: mockSave };
    Suscripcion.findOne.mockResolvedValue(suscripcion);

    const req = { user: mockUser, params: { id: 'sus123' }, body: { fechaHasta: '2026-06' } };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(suscripcion.fechaHasta).toBe('2026-06');
    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 si la suscripción no existe', async () => {
    Suscripcion.findOne.mockResolvedValue(null);

    const req = { user: mockUser, params: { id: 'noexiste' }, body: { fechaHasta: '2026-06' } };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 400 si ya tiene fechaHasta', async () => {
    const mockSave = vi.fn();
    const suscripcion = { _id: 'sus123', fechaHasta: '2026-03', save: mockSave };
    Suscripcion.findOne.mockResolvedValue(suscripcion);

    const req = { user: mockUser, params: { id: 'sus123' }, body: { fechaHasta: '2026-06' } };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('fecha de cierre') }));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('retorna 400 si falta fechaHasta en el body', async () => {
    const req = { user: mockUser, params: { id: 'sus123' }, body: {} };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('fechaHasta') }));
    expect(Suscripcion.findOne).not.toHaveBeenCalled();
  });

  it('retorna 400 si fechaHasta tiene formato inválido', async () => {
    const req = { user: mockUser, params: { id: 'sus123' }, body: { fechaHasta: '2026/06' } };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('YYYY-MM') }));
    expect(Suscripcion.findOne).not.toHaveBeenCalled();
  });

  it('retorna 500 si hay error de base de datos', async () => {
    Suscripcion.findOne.mockRejectedValue(new Error('DB error'));

    const req = { user: mockUser, params: { id: 'sus123' }, body: { fechaHasta: '2026-06' } };
    const res = mockRes();

    await closeSuscripcionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
