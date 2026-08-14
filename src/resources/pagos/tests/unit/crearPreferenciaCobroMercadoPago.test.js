import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIntentSave } = vi.hoisted(() => ({ mockIntentSave: vi.fn() }));

vi.mock('../../../socios/models/Socio.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../models/MercadoPagoConfig.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../models/PagoOnlineIntent.js', () => {
  const PagoOnlineIntentMock = vi.fn().mockImplementation((data) => ({ ...data, save: mockIntentSave }));
  return { default: PagoOnlineIntentMock };
});

import Socio from '../../../socios/models/Socio.js';
import MercadoPagoConfig from '../../models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../../models/PagoOnlineIntent.js';
import { crearPreferenciaCobroMercadoPago, BusinessError } from '../../services/crearPreferenciaCobroMercadoPago.service.js';

const CLUB_ID = 'CARC';
const SOCIO_ID = 'socio-1';
const SUSCRIPCION_ID = 'sus-1';

const baseArgs = () => ({
  clubId: CLUB_ID,
  requestedByUserId: 'user-1',
  requestedByEmail: 'secretaria@carc.test',
  socioId: SOCIO_ID,
  description: 'Cuota social',
  items: [{ socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07', '2026-08'], amount: 7500 }],
});

const stubMpFetch = (body, ok = true, status = 200) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  MercadoPagoConfig.findOne = vi.fn().mockResolvedValue({ clubId: CLUB_ID, accessToken: 'TEST-token', active: true });
  Socio.find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: SOCIO_ID, nombre: 'Ana', apellido: 'García', correoElectronico: 'ana@test.com' }]) });
  mockIntentSave.mockResolvedValue(undefined);
  stubMpFetch({ id: 'pref-1', init_point: 'https://mp.test/checkout/pref-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crearPreferenciaCobroMercadoPago', () => {
  it('genera la preferencia correctamente', async () => {
    const result = await crearPreferenciaCobroMercadoPago(baseArgs());

    expect(result).toEqual({ initPoint: 'https://mp.test/checkout/pref-1', preferenceId: 'pref-1', intentId: expect.any(String) });
    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({
      clubId: CLUB_ID,
      socioId: SOCIO_ID,
      totalAmount: 15000,
      preferenceId: 'pref-1',
    }));
    expect(mockIntentSave).toHaveBeenCalled();
  });

  it('suma el monto de varios items para el total, multiplicando por períodos/cantidad', async () => {
    const args = baseArgs();
    args.items = [
      { socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'], amount: 7500 }, // 1 período × 7500 = 7500
      { socioId: SOCIO_ID, cargoPuntualId: 'cargo-1', amount: 3000 }, // 3000
      { socioId: SOCIO_ID, muroLibrePendiente: true, cantidad: 2, amount: 4000 }, // 2 visitas × 4000 = 8000
    ];

    await crearPreferenciaCobroMercadoPago(args);

    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 18500 }));
  });

  it('rechaza si el club no tiene Mercado Pago configurado', async () => {
    MercadoPagoConfig.findOne.mockResolvedValue(null);

    await expect(crearPreferenciaCobroMercadoPago(baseArgs())).rejects.toBeInstanceOf(BusinessError);
    await expect(crearPreferenciaCobroMercadoPago(baseArgs())).rejects.toMatchObject({ message: expect.stringContaining('no configuró Mercado Pago') });
  });

  it('rechaza si no hay socioId', async () => {
    const args = { ...baseArgs(), socioId: undefined };
    await expect(crearPreferenciaCobroMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('socioId') });
  });

  it('rechaza si items está vacío', async () => {
    const args = { ...baseArgs(), items: [] };
    await expect(crearPreferenciaCobroMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('ítem') });
  });

  it('rechaza si un item no tiene monto', async () => {
    const args = baseArgs();
    args.items = [{ socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'] }];

    await expect(crearPreferenciaCobroMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('monto asignado') });
  });

  it('rechaza si un item no indica suscripcionId, cargoPuntualId ni muroLibrePendiente', async () => {
    const args = baseArgs();
    args.items = [{ socioId: SOCIO_ID, amount: 1000 }];

    await expect(crearPreferenciaCobroMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('suscripcionId, cargoPuntualId o muroLibrePendiente') });
  });

  it('rechaza si un item pertenece a otro socio', async () => {
    const args = baseArgs();
    args.items = [{ socioId: 'otro-socio', suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'], amount: 7500 }];

    await expect(crearPreferenciaCobroMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('no corresponde al socio') });
  });

  it('rechaza si el socio no existe', async () => {
    Socio.find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    await expect(crearPreferenciaCobroMercadoPago(baseArgs())).rejects.toMatchObject({ status: 404 });
  });

  it('propaga error 502 si Mercado Pago rechaza la creación de la preferencia', async () => {
    stubMpFetch({ message: 'invalid token' }, false, 401);

    await expect(crearPreferenciaCobroMercadoPago(baseArgs())).rejects.toMatchObject({ status: 502 });
    expect(mockIntentSave).not.toHaveBeenCalled();
  });
});
