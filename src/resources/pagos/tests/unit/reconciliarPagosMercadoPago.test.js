import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../models/PagoOnlineIntent.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../services/procesarPagoMercadoPago.service.js', () => ({
  procesarPagoMercadoPago: vi.fn(),
}));

import PagoOnlineIntent from '../../models/PagoOnlineIntent.js';
import { procesarPagoMercadoPago } from '../../services/procesarPagoMercadoPago.service.js';
import { reconciliarPagosMercadoPagoClub } from '../../services/reconciliarPagosMercadoPago.service.js';

const stubSearchFetch = (payments, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue({ results: payments }),
  }));
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('reconciliarPagosMercadoPagoClub', () => {
  it('no hace nada si no hay intents pendientes', async () => {
    PagoOnlineIntent.find.mockResolvedValue([]);

    const result = await reconciliarPagosMercadoPagoClub({ clubId: 'CARC', accessToken: 'token' });

    expect(PagoOnlineIntent.find).toHaveBeenCalledWith(expect.objectContaining({ clubId: 'CARC', estado: 'pendiente' }));
    expect(procesarPagoMercadoPago).not.toHaveBeenCalled();
    expect(result).toEqual({ revisados: 0, resueltos: 0 });
  });

  it('busca por external_reference y procesa el pago encontrado', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([{ id: '555', status: 'approved', external_reference: 'ext-1' }]);
    procesarPagoMercadoPago.mockResolvedValue({ resultado: 'aprobado' });

    const result = await reconciliarPagosMercadoPagoClub({ clubId: 'CARC', accessToken: 'TEST-token' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('external_reference=ext-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer TEST-token' } }),
    );
    expect(procesarPagoMercadoPago).toHaveBeenCalledWith({
      clubId: 'CARC',
      payment: expect.objectContaining({ id: '555', status: 'approved' }),
      accessToken: 'TEST-token',
    });
    expect(result).toEqual({ revisados: 1, resueltos: 1 });
  });

  it('si Mercado Pago no devuelve resultados, no llama a procesarPagoMercadoPago', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([]);

    const result = await reconciliarPagosMercadoPagoClub({ clubId: 'CARC', accessToken: 'token' });

    expect(procesarPagoMercadoPago).not.toHaveBeenCalled();
    expect(result).toEqual({ revisados: 1, resueltos: 0 });
  });

  it('prefiere el resultado aprobado si hay varios pagos para el mismo external_reference', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([
      { id: '1', status: 'rejected', external_reference: 'ext-1' },
      { id: '2', status: 'approved', external_reference: 'ext-1' },
    ]);
    procesarPagoMercadoPago.mockResolvedValue({ resultado: 'aprobado' });

    await reconciliarPagosMercadoPagoClub({ clubId: 'CARC', accessToken: 'token' });

    expect(procesarPagoMercadoPago).toHaveBeenCalledWith({
      clubId: 'CARC',
      payment: expect.objectContaining({ id: '2', status: 'approved' }),
      accessToken: 'token',
    });
  });

  it('no cuenta como resuelto un intent que sigue pendiente o duplicado', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([{ id: '1', status: 'in_process', external_reference: 'ext-1' }]);
    procesarPagoMercadoPago.mockResolvedValue({ resultado: 'pendiente' });

    const result = await reconciliarPagosMercadoPagoClub({ clubId: 'CARC', accessToken: 'token' });

    expect(result).toEqual({ revisados: 1, resueltos: 0 });
  });
});
