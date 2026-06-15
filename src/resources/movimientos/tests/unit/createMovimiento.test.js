import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMovimientoHandler } from '../../handlers/createMovimiento.handler.js';
import Movimiento from '../../models/Movimiento.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const BASE_BODY = {
  type: 'Ingreso',
  amount: 1000,
  concept: 'Cuota mensual',
  responsable: 'Secretaría',
  paymentMethod: 'Efectivo',
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

describe('createMovimientoHandler', () => {
  beforeEach(() => {
    vi.spyOn(Movimiento.prototype, 'save').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when type is invalid', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, type: 'Otro' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Tipo de movimiento inválido' });
  });

  it('should return 400 when amount is not a positive number', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, amount: -50 }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El importe debe ser un número mayor que cero' });
  });

  it('should return 400 when amount is a string', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, amount: '1000' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when concept is missing', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, concept: '' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El concepto es obligatorio' });
  });

  it('should return 400 when responsable is missing', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, responsable: '' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El responsable es obligatorio' });
  });

  it('should return 400 when paymentMethod is invalid', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, paymentMethod: 'Tarjeta' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La forma de pago debe ser Efectivo o Transferencia' });
  });

  it('should return 400 when date is invalid', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: { ...BASE_BODY, date: 'no-es-fecha' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La fecha del movimiento es inválida' });
  });

  it('should create movimiento and return 201', async () => {
    const res = mockRes();
    await createMovimientoHandler({ body: BASE_BODY, user: USER }, res);

    expect(Movimiento.prototype.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    const created = res.json.mock.calls[0][0];
    expect(created).toMatchObject({
      type: 'Ingreso',
      amount: 1000,
      concept: 'Cuota mensual',
      paymentMethod: 'Efectivo',
      clubId: 'club1',
    });
  });

  it('should return 500 on unexpected error', async () => {
    Movimiento.prototype.save.mockRejectedValueOnce(new Error('DB down'));
    const res = mockRes();
    await createMovimientoHandler({ body: BASE_BODY, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
