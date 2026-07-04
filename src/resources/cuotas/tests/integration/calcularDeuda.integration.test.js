import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../../index.js';
import Cuota from '../../models/Cuota.js';
import {
  createAdminUser, createSocio, createEtiqueta, createPrecio, createSuscripcion,
} from '../../../../testUtils/integrationHelpers.js';

const periodoHace = (mesesAtras) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - mesesAtras, 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const periodoEnMeses = (mesesAdelante) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + mesesAdelante, 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

describe('GET /api/socios/:id/deuda (integración)', () => {
  it('calcula meses de deuda desde fechaDesde cuando no hay cuotas pagadas', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    const etiqueta = await createEtiqueta();
    await createPrecio({ etiquetaId: etiqueta._id, monto: 5000, vigenteDesde: new Date('2020-01-01') });
    await createSuscripcion({ socioId: socio._id, etiquetaId: etiqueta._id, fechaDesde: periodoHace(3) });

    const res = await request(app)
      .get(`/api/socios/${socio._id}/deuda`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].mesesDeuda).toBe(4); // hace 3 meses + el mes actual, inclusive
    expect(res.body[0].totalDeuda).toBe(4 * 5000);
    expect(res.body[0].ultimoPeriodoPagado).toBeNull();
  });

  it('descuenta los períodos ya pagados de la deuda', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    const etiqueta = await createEtiqueta();
    await createPrecio({ etiquetaId: etiqueta._id, monto: 5000, vigenteDesde: new Date('2020-01-01') });
    const suscripcion = await createSuscripcion({ socioId: socio._id, etiquetaId: etiqueta._id, fechaDesde: periodoHace(3) });

    await Cuota.create({
      clubId: 'CARC',
      socioId: socio._id,
      suscripcionId: suscripcion._id,
      etiquetaId: etiqueta._id,
      periodo: periodoHace(3),
      estado: 'pagada',
      montoEsperadoSnapshot: 5000,
      montoPagadoSnapshot: 5000,
      paymentMethod: 'Efectivo',
      createdBy: 'test',
      updatedBy: 'test',
    });

    const res = await request(app)
      .get(`/api/socios/${socio._id}/deuda`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].mesesDeuda).toBe(3);
    expect(res.body[0].ultimoPeriodoPagado).toBe(periodoHace(3));
  });

  it('devuelve 0 meses de deuda si la suscripción todavía no empezó', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    const etiqueta = await createEtiqueta();
    await createPrecio({ etiquetaId: etiqueta._id, monto: 5000, vigenteDesde: new Date('2020-01-01') });
    await createSuscripcion({ socioId: socio._id, etiquetaId: etiqueta._id, fechaDesde: periodoEnMeses(2) });

    const res = await request(app)
      .get(`/api/socios/${socio._id}/deuda`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].mesesDeuda).toBe(0);
    expect(res.body[0].totalDeuda).toBe(0);
  });

  it('devuelve array vacío si el socio no tiene suscripciones activas', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();

    const res = await request(app)
      .get(`/api/socios/${socio._id}/deuda`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rechaza (403) si un socio intenta ver la deuda de otro socio', async () => {
    const socio = await createSocio();
    const otroSocio = await createSocio();
    const { token } = await createAdminUser({ roles: ['socio'], socioId: String(socio._id) });

    const res = await request(app)
      .get(`/api/socios/${otroSocio._id}/deuda`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
