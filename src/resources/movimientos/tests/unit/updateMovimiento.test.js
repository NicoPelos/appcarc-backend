import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMovimientoHandler } from '../../handlers/updateMovimiento.handler.js';
import Movimiento from '../../models/Movimiento.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

const makeMovimiento = (overrides = {}) => ({
  _id: 'mov1',
  type: 'Ingreso',
  amount: 1000,
  concept: 'Cuota mensual',
  paymentMethod: 'Efectivo',
  description: '',
  date: new Date(),
  active: true,
  updatedBy: '',
  save: vi.fn().mockResolvedValue(undefined),
  toObject: vi.fn().mockReturnValue({}),
  ...overrides,
});

describe('updateMovimientoHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 404 when movimiento is not found', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(null);
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { amount: 500 }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Movimiento no encontrado' });
  });

  it('should return 400 when type is invalid', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(makeMovimiento());
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { type: 'Otro' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Tipo de movimiento inválido' });
  });

  it('should return 400 when amount is not positive', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(makeMovimiento());
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { amount: 0 }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El importe debe ser un número mayor que cero' });
  });

  it('should return 400 when concept is empty string', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(makeMovimiento());
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { concept: '   ' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El concepto no puede estar vacío' });
  });

  it('should return 400 when paymentMethod is invalid', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(makeMovimiento());
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { paymentMethod: 'Tarjeta' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La forma de pago debe ser Efectivo o Transferencia' });
  });

  it('should return 400 when date is invalid', async () => {
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(makeMovimiento());
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: { date: 'no-es-fecha' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La fecha del movimiento es inválida' });
  });

  it('should update fields and return 200', async () => {
    const mov = makeMovimiento();
    vi.spyOn(Movimiento, 'findOne').mockResolvedValue(mov);
    const res = mockRes();
    await updateMovimientoHandler(
      { params: { id: 'mov1' }, body: { type: 'Egreso', amount: 500, concept: 'Gasto nuevo' }, user: USER },
      res,
    );
    expect(mov.type).toBe('Egreso');
    expect(mov.amount).toBe(500);
    expect(mov.concept).toBe('Gasto nuevo');
    expect(mov.updatedBy).toBe('admin@carc.test');
    expect(mov.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 500 on unexpected error', async () => {
    vi.spyOn(Movimiento, 'findOne').mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await updateMovimientoHandler({ params: { id: 'mov1' }, body: {}, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
