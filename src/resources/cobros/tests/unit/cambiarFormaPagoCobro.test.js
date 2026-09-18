import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../models/Cobro.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../movimientos/models/Movimiento.js', () => ({
  default: { findOne: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('../../services/anularCobro.service.js', () => ({
  anularCobroConTrazabilidad: vi.fn(),
}));
vi.mock('../../services/registrarCobro.service.js', async () => {
  const actual = await vi.importActual('../../services/registrarCobro.service.js');
  return { ...actual, registrarCobro: vi.fn() };
});

import Cobro from '../../models/Cobro.js';
import Movimiento from '../../../movimientos/models/Movimiento.js';
import { anularCobroConTrazabilidad } from '../../services/anularCobro.service.js';
import { registrarCobro } from '../../services/registrarCobro.service.js';
import { cambiarFormaPagoCobro } from '../../services/cambiarFormaPagoCobro.service.js';

const CLUB_ID = 'club1';
const COBRO_ID = '507f1f77bcf86cd799439011';
const MOVIMIENTO_ID = '507f1f77bcf86cd799439012';
const USER = { id: 'user1', email: 'secretaria@carc.test' };

const buildCobroCuotas = (overrides = {}) => ({
  _id: COBRO_ID,
  clubId: CLUB_ID,
  paymentMethod: 'Efectivo',
  date: new Date('2026-09-01T12:00:00Z'),
  description: 'Cobro de prueba',
  movimientoId: MOVIMIENTO_ID,
  items: [
    { socioId: 'socio1', suscripcionId: 'susc1', periodo: '2026-08', amount: 6000, precioSugeridoSnapshot: 6000, description: '' },
    { socioId: 'socio1', suscripcionId: 'susc1', periodo: '2026-09', amount: 6000, precioSugeridoSnapshot: 6000, description: '' },
  ],
  ...overrides,
});

describe('cambiarFormaPagoCobro (unit)', () => {
  let sessionMock;
  let findQuerySession;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock = {
      withTransaction: vi.fn(async (cb) => cb()),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(sessionMock);

    findQuerySession = { session: vi.fn() };
    Cobro.findOne = vi.fn((filter) => {
      if (filter.active !== undefined) {
        // Primer chequeo (.lean()) y el fetch dentro de la transacción usan
        // ambos findOne({..., active:true}) — distinguibles por si piden .lean()
        // o .session() después.
        const chain = { lean: vi.fn(), session: findQuerySession.session };
        return chain;
      }
      return { lean: vi.fn() };
    });
    Movimiento.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    Movimiento.findByIdAndUpdate = vi.fn().mockResolvedValue(null);
    anularCobroConTrazabilidad.mockResolvedValue(undefined);
    registrarCobro.mockResolvedValue({ cobro: { _id: 'nuevoCobro1' }, movimiento: { _id: 'nuevoMov1' } });
  });

  afterEach(() => vi.restoreAllMocks());

  const mockCobroLean = (cobro) => {
    Cobro.findOne = vi.fn().mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(cobro) })
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue(cobro && { ...cobro, save: vi.fn() }) });
  };

  it('rechaza una forma de pago inválida', async () => {
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Bitcoin' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('falla con 404 si el cobro no existe', async () => {
    mockCobroLean(null);
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rechaza si ya está en esa forma de pago', async () => {
    mockCobroLean(buildCobroCuotas({ paymentMethod: 'Transferencia' }));
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('ya está registrado') });
  });

  it('rechaza cobros con cargo puntual (no soportado para el cambio automático)', async () => {
    mockCobroLean(buildCobroCuotas({
      items: [{ socioId: 'socio1', cargoPuntualId: 'cargo1', periodo: '2026-09', amount: 30000 }],
    }));
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('cargo puntual') });
  });

  it('rechaza cobros con visita de Muro Libre (no soportado para el cambio automático)', async () => {
    mockCobroLean(buildCobroCuotas({
      items: [{ socioId: 'socio1', asistenciaId: 'asis1', periodo: '2026-09', amount: 5000 }],
    }));
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('Muro Libre') });
  });

  it('rechaza si el movimiento tiene pagos de Mercado Pago vinculados', async () => {
    mockCobroLean(buildCobroCuotas());
    Movimiento.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ mercadopagoVinculos: [{ paymentId: 'mp1' }] }) });
    await expect(cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('Mercado Pago') });
  });

  it('anula el cobro original, desactiva el movimiento viejo y registra uno nuevo con los mismos ítems', async () => {
    const cobro = buildCobroCuotas();
    mockCobroLean(cobro);

    const result = await cambiarFormaPagoCobro({ clubId: CLUB_ID, user: USER, cobroId: COBRO_ID, paymentMethod: 'Transferencia' });

    expect(Movimiento.findByIdAndUpdate).toHaveBeenCalledWith(
      MOVIMIENTO_ID,
      { active: false, updatedBy: USER.email },
      { session: sessionMock },
    );
    expect(anularCobroConTrazabilidad).toHaveBeenCalledWith(expect.objectContaining({
      clubId: CLUB_ID,
      actor: USER.email,
      motivo: expect.stringContaining('Efectivo → Transferencia'),
      session: sessionMock,
    }));
    expect(registrarCobro).toHaveBeenCalledWith({
      clubId: CLUB_ID,
      user: USER,
      body: {
        paymentMethod: 'Transferencia',
        date: cobro.date,
        description: 'Cobro de prueba',
        items: [
          { socioId: 'socio1', suscripcionId: 'susc1', periodos: ['2026-08'], amount: 6000, precioSugeridoSnapshot: 6000 },
          { socioId: 'socio1', suscripcionId: 'susc1', periodos: ['2026-09'], amount: 6000, precioSugeridoSnapshot: 6000 },
        ],
      },
    });
    expect(result).toEqual({ cobro: { _id: 'nuevoCobro1' }, movimiento: { _id: 'nuevoMov1' } });
  });
});
