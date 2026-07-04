import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../../index.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';
import { createAdminUser, createSocio } from '../../../../testUtils/integrationHelpers.js';

const crearAsistenciaConAdvertencia = async ({
  socio, tipo = 'escuelita', codigo = 'CUOTA_SOCIAL_IMPAGA', fecha = new Date(),
}) => Asistencia.create({
  clubId: 'CARC',
  tipo,
  socioId: socio._id,
  nombre: socio.nombre,
  apellido: socio.apellido,
  dni: socio.dni,
  esSocio: true,
  fecha,
  advertencias: [{ codigo, mensaje: `Advertencia ${codigo}` }],
  createdBy: 'test',
  updatedBy: 'test',
});

describe('GET /api/advertencias (integración)', () => {
  it('solo lista asistencias que tienen advertencias', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    await crearAsistenciaConAdvertencia({ socio });
    await Asistencia.create({
      clubId: 'CARC', tipo: 'escuelita', socioId: socio._id, nombre: socio.nombre, apellido: socio.apellido, esSocio: true, fecha: new Date(), advertencias: [], createdBy: 'test', updatedBy: 'test',
    });

    const res = await request(app).get('/api/advertencias').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('filtra por tipo y por código', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    await crearAsistenciaConAdvertencia({ socio, tipo: 'escuelita', codigo: 'CUOTA_SOCIAL_IMPAGA' });
    await crearAsistenciaConAdvertencia({ socio, tipo: 'muro_libre', codigo: 'PASE_MENSUAL_IMPAGO' });

    const porTipo = await request(app).get('/api/advertencias?tipo=muro_libre').set('Authorization', `Bearer ${token}`);
    expect(porTipo.body.total).toBe(1);
    expect(porTipo.body.advertencias[0].tipo).toBe('muro_libre');

    const porCodigo = await request(app).get('/api/advertencias?codigo=CUOTA_SOCIAL_IMPAGA').set('Authorization', `Bearer ${token}`);
    expect(porCodigo.body.total).toBe(1);
    expect(porCodigo.body.advertencias[0].advertencias[0].codigo).toBe('CUOTA_SOCIAL_IMPAGA');
  });

  it('rechaza un tipo o código inválido (400)', async () => {
    const { token } = await createAdminUser();

    const tipoInvalido = await request(app).get('/api/advertencias?tipo=natacion').set('Authorization', `Bearer ${token}`);
    expect(tipoInvalido.status).toBe(400);

    const codigoInvalido = await request(app).get('/api/advertencias?codigo=INVENTADO').set('Authorization', `Bearer ${token}`);
    expect(codigoInvalido.status).toBe(400);
  });

  it('no incluye asistencias fuera de la ventana de días', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio();
    const haceCuarentaDias = new Date();
    haceCuarentaDias.setDate(haceCuarentaDias.getDate() - 40);
    await crearAsistenciaConAdvertencia({ socio, fecha: haceCuarentaDias });

    const res = await request(app).get('/api/advertencias?dias=30').set('Authorization', `Bearer ${token}`);
    expect(res.body.total).toBe(0);
  });

  it.each([
    ['0358-154164618', '549358154164618'],
    ['543581234567', '543581234567'],
    ['3581234567', '5493581234567'],
  ])('arma el waLink normalizando el teléfono %s', async (telefonoCrudo, esperado) => {
    const { token } = await createAdminUser();
    const socio = await createSocio({ telefono: telefonoCrudo });
    await crearAsistenciaConAdvertencia({ socio });

    const res = await request(app).get('/api/advertencias').set('Authorization', `Bearer ${token}`);
    expect(res.body.advertencias[0].waLink).toContain(`https://wa.me/${esperado}?text=`);
  });

  it('devuelve waLink null si el socio no tiene teléfono cargado', async () => {
    const { token } = await createAdminUser();
    const socio = await createSocio({ telefono: undefined });
    await crearAsistenciaConAdvertencia({ socio });

    const res = await request(app).get('/api/advertencias').set('Authorization', `Bearer ${token}`);
    expect(res.body.advertencias[0].waLink).toBeNull();
  });
});
