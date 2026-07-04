import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../../index.js';
import Movimiento from '../../../movimientos/models/Movimiento.js';
import { createAdminUser, createSocio } from '../../../../testUtils/integrationHelpers.js';

describe('POST /api/muro-libre (integración)', () => {
  it('registra un no-socio con monto manual y crea el movimiento de ingreso', async () => {
    const { token } = await createAdminUser();

    const res = await request(app)
      .post('/api/muro-libre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Visitante', apellido: 'Ocasional', dni: '99999999', tipoPase: 'diario', estadoPago: 'pagado', paymentMethod: 'Efectivo', amount: 2000,
      });

    expect(res.status).toBe(201);
    expect(res.body.registro.monto).toBe(2000);
    expect(res.body.registro.esSocio).toBe(false);

    const movimiento = await Movimiento.findOne({ sourceId: res.body.registro._id });
    expect(movimiento.amount).toBe(2000);
  });

  it('rechaza un no-socio sin nombre (400)', async () => {
    const { token } = await createAdminUser();

    const res = await request(app)
      .post('/api/muro-libre')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipoPase: 'diario', estadoPago: 'exento' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/muro-libre/:id (integración)', () => {
  it('actualiza el monto y propaga el cambio al movimiento asociado', async () => {
    const { token } = await createAdminUser();
    const createRes = await request(app)
      .post('/api/muro-libre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Visitante', tipoPase: 'diario', estadoPago: 'pagado', paymentMethod: 'Efectivo', amount: 1000,
      });

    const res = await request(app)
      .put(`/api/muro-libre/${createRes.body.registro._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 1800 });

    expect(res.status).toBe(200);
    expect(res.body.monto).toBe(1800);

    const movimiento = await Movimiento.findOne({ sourceId: createRes.body.registro._id });
    expect(movimiento.amount).toBe(1800);
  });

  it('rechaza un monto negativo (400)', async () => {
    const { token } = await createAdminUser();
    const createRes = await request(app)
      .post('/api/muro-libre')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Visitante', tipoPase: 'diario', estadoPago: 'exento' });

    const res = await request(app)
      .put(`/api/muro-libre/${createRes.body.registro._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: -5 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/muro-libre/:id (integración)', () => {
  it('anula el registro y desactiva el movimiento asociado', async () => {
    const { token } = await createAdminUser();
    const createRes = await request(app)
      .post('/api/muro-libre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Visitante', tipoPase: 'diario', estadoPago: 'pagado', paymentMethod: 'Efectivo', amount: 1000,
      });

    const delRes = await request(app)
      .delete(`/api/muro-libre/${createRes.body.registro._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const movimiento = await Movimiento.findOne({ sourceId: createRes.body.registro._id });
    expect(movimiento.active).toBe(false);

    const updateRes = await request(app)
      .put(`/api/muro-libre/${createRes.body.registro._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 500 });
    expect(updateRes.status).toBe(404);
  });
});
