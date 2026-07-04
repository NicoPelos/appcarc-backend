import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../../index.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import Movimiento from '../../../movimientos/models/Movimiento.js';
import {
  CLUB_ID, createAdminUser, createSocio, createEtiqueta, createPrecio, createSuscripcion,
} from '../../../../testUtils/integrationHelpers.js';

const setupSocioConSuscripcion = async () => {
  const socio = await createSocio();
  const etiqueta = await createEtiqueta();
  await createPrecio({ etiquetaId: etiqueta._id, monto: 5000 });
  const suscripcion = await createSuscripcion({ socioId: socio._id, etiquetaId: etiqueta._id });
  return { socio, etiqueta, suscripcion };
};

describe('POST /api/cobros (integración)', () => {
  it('registra un cobro, crea la cuota pagada y el movimiento de ingreso', async () => {
    const { token } = await createAdminUser();
    const { socio, suscripcion } = await setupSocioConSuscripcion();

    const res = await request(app)
      .post('/api/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'Efectivo',
        items: [{ socioId: String(socio._id), suscripcionId: String(suscripcion._id), periodo: '2026-01' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.cobro.totalAmount).toBe(5000);

    const cuota = await Cuota.findOne({ socioId: socio._id, periodo: '2026-01' });
    expect(cuota.estado).toBe('pagada');
    expect(cuota.montoPagadoSnapshot).toBe(5000);
    expect(String(cuota.cobroId)).toBe(String(res.body.cobro._id));

    const movimiento = await Movimiento.findOne({ sourceId: res.body.cobro._id });
    expect(movimiento).toBeTruthy();
    expect(movimiento.type).toBe('Ingreso');
    expect(movimiento.amount).toBe(5000);
  });

  it('rechaza un cobro si la cuota del período ya está pagada (409)', async () => {
    const { token } = await createAdminUser();
    const { socio, suscripcion } = await setupSocioConSuscripcion();

    const payload = {
      paymentMethod: 'Efectivo',
      items: [{ socioId: String(socio._id), suscripcionId: String(suscripcion._id), periodo: '2026-03' }],
    };

    const first = await request(app).post('/api/cobros').set('Authorization', `Bearer ${token}`).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/cobros').set('Authorization', `Bearer ${token}`).send(payload);
    expect(second.status).toBe(409);

    const cuotasPagadas = await Cuota.countDocuments({ socioId: socio._id, periodo: '2026-03', estado: 'pagada' });
    expect(cuotasPagadas).toBe(1);
  });

  it('rechaza un cobro para un socio de otro club (404)', async () => {
    const { token } = await createAdminUser({ clubId: CLUB_ID });
    const { suscripcion } = await setupSocioConSuscripcion();
    const socioOtroClub = await createSocio({ clubId: 'OTRO_CLUB' });

    const res = await request(app)
      .post('/api/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'Efectivo',
        items: [{ socioId: String(socioOtroClub._id), suscripcionId: String(suscripcion._id), periodo: '2026-02' }],
      });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/cobros/:id/anular (integración)', () => {
  it('anula un cobro y revierte la cuota y el movimiento asociados', async () => {
    const { token } = await createAdminUser();
    const { socio, suscripcion } = await setupSocioConSuscripcion();

    const cobroRes = await request(app)
      .post('/api/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'Efectivo',
        items: [{ socioId: String(socio._id), suscripcionId: String(suscripcion._id), periodo: '2026-04' }],
      });
    expect(cobroRes.status).toBe(201);
    const cobroId = cobroRes.body.cobro._id;

    const anularRes = await request(app)
      .post(`/api/cobros/${cobroId}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Test de anulación' });

    expect(anularRes.status).toBe(200);

    const cuota = await Cuota.findOne({ socioId: socio._id, periodo: '2026-04' });
    expect(cuota.estado).toBe('anulada');

    const movimiento = await Movimiento.findOne({ sourceId: cobroId });
    expect(movimiento.active).toBe(false);
  });

  it('rechaza anular un cobro ya anulado (409)', async () => {
    const { token } = await createAdminUser();
    const { socio, suscripcion } = await setupSocioConSuscripcion();

    const cobroRes = await request(app)
      .post('/api/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMethod: 'Efectivo',
        items: [{ socioId: String(socio._id), suscripcionId: String(suscripcion._id), periodo: '2026-05' }],
      });
    const cobroId = cobroRes.body.cobro._id;

    const first = await request(app).post(`/api/cobros/${cobroId}/anular`).set('Authorization', `Bearer ${token}`).send({});
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/cobros/${cobroId}/anular`).set('Authorization', `Bearer ${token}`).send({});
    expect(second.status).toBe(409);
  });
});
