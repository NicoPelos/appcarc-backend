import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdvertenciasHandler } from '../../handlers/getAdvertencias.handler.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';
import Advertencia from '../../models/Advertencia.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { clubId: 'club1' };
const CLUB_ID = 'club1';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const ETIQUETA_ESCUELITA_ID = '507f1f77bcf86cd799439022';

// Encadena find().populate().sort().lean() (o subsets) resolviendo `result`.
const chainable = (result) => {
  const q = {};
  q.populate = vi.fn(() => q);
  q.sort = vi.fn(() => q);
  q.select = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
};

const buildAsistencia = (overrides = {}) => ({
  _id: 'asist-1',
  clubId: CLUB_ID,
  tipo: 'escuelita',
  socioId: { _id: SOCIO_ID, telefono: '3511234567' },
  nombre: 'Juan',
  apellido: 'Pérez',
  fecha: new Date('2026-09-01T15:00:00.000Z'),
  advertencias: [{ codigo: 'CUOTA_IMPAGA', mensaje: 'Sin cuota de escuelita pagada para 2026-09' }],
  ...overrides,
});

describe('getAdvertenciasHandler', () => {
  beforeEach(() => {
    Advertencia.find = vi.fn().mockReturnValue(chainable([]));
  });

  afterEach(() => vi.restoreAllMocks());

  it('should return 400 on invalid tipo', async () => {
    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: { tipo: 'invalido' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 on invalid codigo', async () => {
    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: { codigo: 'INVALIDO' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should exclude a CUOTA_IMPAGA advertencia when the Cuota was later paid (worklist se autolimpia)', async () => {
    Asistencia.find = vi.fn().mockReturnValue(chainable([buildAsistencia()]));
    Etiqueta.find = vi.fn().mockReturnValue(chainable([{ _id: ETIQUETA_ESCUELITA_ID, uso_sistema: 'cuota_escuelita' }]));
    Cuota.find = vi.fn().mockReturnValue(chainable([
      { socioId: SOCIO_ID, etiquetaId: ETIQUETA_ESCUELITA_ID, periodo: '2026-09' },
    ]));

    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: {} }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.advertencias).toHaveLength(0);
    expect(payload.total).toBe(0);
  });

  it('should keep a CUOTA_IMPAGA advertencia when the Cuota is still unpaid', async () => {
    Asistencia.find = vi.fn().mockReturnValue(chainable([buildAsistencia()]));
    Etiqueta.find = vi.fn().mockReturnValue(chainable([{ _id: ETIQUETA_ESCUELITA_ID, uso_sistema: 'cuota_escuelita' }]));
    Cuota.find = vi.fn().mockReturnValue(chainable([])); // nada pagado

    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: {} }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.advertencias).toHaveLength(1);
    expect(payload.advertencias[0].advertencias).toEqual([
      { codigo: 'CUOTA_IMPAGA', mensaje: 'Sin cuota de escuelita pagada para 2026-09' },
    ]);
  });

  it('should never re-check LIMITE_SEMANAL — se mantiene siempre aunque no haya Cuota que consultar', async () => {
    const asistencia = buildAsistencia({
      advertencias: [{ codigo: 'LIMITE_SEMANAL', mensaje: 'Ya registró 2 clases esa semana (límite: 1)' }],
    });
    Asistencia.find = vi.fn().mockReturnValue(chainable([asistencia]));
    // Etiqueta/Cuota no deberían ni consultarse porque LIMITE_SEMANAL no es resoluble.
    Etiqueta.find = vi.fn().mockReturnValue(chainable([]));
    Cuota.find = vi.fn().mockReturnValue(chainable([]));

    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: {} }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.advertencias).toHaveLength(1);
    expect(Etiqueta.find).not.toHaveBeenCalled();
    expect(Cuota.find).not.toHaveBeenCalled();
  });

  it('should keep only the pending advertencia when one of two on the same asistencia got paid', async () => {
    const asistencia = buildAsistencia({
      advertencias: [
        { codigo: 'CUOTA_SOCIAL_IMPAGA', mensaje: 'Sin cuota social pagada para 2026-09' },
        { codigo: 'CUOTA_IMPAGA', mensaje: 'Sin cuota de escuelita pagada para 2026-09' },
      ],
    });
    const ETIQUETA_SOCIAL_ID = '507f1f77bcf86cd799439033';
    Asistencia.find = vi.fn().mockReturnValue(chainable([asistencia]));
    Etiqueta.find = vi.fn().mockReturnValue(chainable([
      { _id: ETIQUETA_SOCIAL_ID, uso_sistema: 'cuota_social' },
      { _id: ETIQUETA_ESCUELITA_ID, uso_sistema: 'cuota_escuelita' },
    ]));
    // Solo se pagó la cuota social, no la de escuelita.
    Cuota.find = vi.fn().mockReturnValue(chainable([
      { socioId: SOCIO_ID, etiquetaId: ETIQUETA_SOCIAL_ID, periodo: '2026-09' },
    ]));

    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: {} }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.advertencias).toHaveLength(1);
    expect(payload.advertencias[0].advertencias).toEqual([
      { codigo: 'CUOTA_IMPAGA', mensaje: 'Sin cuota de escuelita pagada para 2026-09' },
    ]);
  });

  it('should not query Cuota/Etiqueta at all when no asistencia has a resolvable codigo', async () => {
    Asistencia.find = vi.fn().mockReturnValue(chainable([]));
    Etiqueta.find = vi.fn();
    Cuota.find = vi.fn();

    const res = mockRes();
    await getAdvertenciasHandler({ user: USER, query: {} }, res);

    expect(Etiqueta.find).not.toHaveBeenCalled();
    expect(Cuota.find).not.toHaveBeenCalled();
  });
});
