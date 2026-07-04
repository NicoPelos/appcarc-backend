import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../../index.js';
import Movimiento from '../../models/Movimiento.js';
import { createAdminUser } from '../../../../testUtils/integrationHelpers.js';

const baseMovimiento = {
  type: 'Ingreso',
  amount: 1000,
  concept: 'Venta de gorra',
  responsable: 'Secretaria',
  paymentMethod: 'Efectivo',
};

describe('POST /api/movimientos (integración)', () => {
  it('crea un movimiento válido', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/movimientos')
      .set('Authorization', `Bearer ${token}`)
      .send(baseMovimiento);

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(1000);
    expect(res.body.active).toBe(true);
  });

  it('rechaza un importe negativo o cero (400)', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/movimientos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseMovimiento, amount: 0 });

    expect(res.status).toBe(400);
  });

  it('rechaza una forma de pago inválida (400)', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/movimientos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseMovimiento, paymentMethod: 'Cripto' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/movimientos/:id (integración)', () => {
  it('actualiza el monto y el concepto de un movimiento', async () => {
    const { token } = await createAdminUser();
    const createRes = await request(app).post('/api/movimientos').set('Authorization', `Bearer ${token}`).send(baseMovimiento);

    const res = await request(app)
      .put(`/api/movimientos/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 2500, concept: 'Venta de gorra y buff' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(2500);
    expect(res.body.concept).toBe('Venta de gorra y buff');
  });

  it('devuelve 404 si el movimiento no existe', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .put('/api/movimientos/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/movimientos/:id (integración)', () => {
  it('hace soft delete: el movimiento queda inactivo y no vuelve a aparecer para update', async () => {
    const { token } = await createAdminUser();
    const createRes = await request(app).post('/api/movimientos').set('Authorization', `Bearer ${token}`).send(baseMovimiento);

    const delRes = await request(app)
      .delete(`/api/movimientos/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const movimiento = await Movimiento.findById(createRes.body._id);
    expect(movimiento.active).toBe(false);

    const updateRes = await request(app)
      .put(`/api/movimientos/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 999 });
    expect(updateRes.status).toBe(404);
  });
});
