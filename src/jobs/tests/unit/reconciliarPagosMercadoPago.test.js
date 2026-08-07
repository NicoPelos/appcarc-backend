import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../resources/pagos/models/MercadoPagoConfig.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../resources/pagos/models/PagoOnlineIntent.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../resources/pagos/services/procesarPagoMercadoPago.service.js', () => ({
  procesarPagoMercadoPago: vi.fn(),
}));
vi.mock('../../../services/pushNotification.service.js', () => ({
  notifyJobFailure: vi.fn().mockResolvedValue(undefined),
}));

import { reconciliarPagosMercadoPago } from '../../reconciliarPagosMercadoPago.job.js';
import MercadoPagoConfig from '../../../resources/pagos/models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../../../resources/pagos/models/PagoOnlineIntent.js';
import { procesarPagoMercadoPago } from '../../../resources/pagos/services/procesarPagoMercadoPago.service.js';
import { notifyJobFailure } from '../../../services/pushNotification.service.js';

const CONFIG = { clubId: 'CARC', accessToken: 'TEST-token' };

const stubSearchFetch = (payments, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue({ results: payments }),
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  MercadoPagoConfig.find.mockResolvedValue([CONFIG]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reconciliarPagosMercadoPago', () => {
  it('no hace nada si no hay intents pendientes', async () => {
    PagoOnlineIntent.find.mockResolvedValue([]);

    await reconciliarPagosMercadoPago();

    expect(PagoOnlineIntent.find).toHaveBeenCalledWith(expect.objectContaining({ clubId: 'CARC', estado: 'pendiente' }));
    expect(procesarPagoMercadoPago).not.toHaveBeenCalled();
  });

  it('busca por external_reference y procesa el pago encontrado', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([{ id: '555', status: 'approved', external_reference: 'ext-1' }]);
    procesarPagoMercadoPago.mockResolvedValue({ resultado: 'aprobado' });

    await reconciliarPagosMercadoPago();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('external_reference=ext-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer TEST-token' } }),
    );
    expect(procesarPagoMercadoPago).toHaveBeenCalledWith({
      clubId: 'CARC',
      payment: expect.objectContaining({ id: '555', status: 'approved' }),
    });
  });

  it('si Mercado Pago no devuelve resultados, no llama a procesarPagoMercadoPago', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([]);

    await reconciliarPagosMercadoPago();

    expect(procesarPagoMercadoPago).not.toHaveBeenCalled();
  });

  it('prefiere el resultado aprobado si hay varios pagos para el mismo external_reference', async () => {
    PagoOnlineIntent.find.mockResolvedValue([{ externalReference: 'ext-1' }]);
    stubSearchFetch([
      { id: '1', status: 'rejected', external_reference: 'ext-1' },
      { id: '2', status: 'approved', external_reference: 'ext-1' },
    ]);
    procesarPagoMercadoPago.mockResolvedValue({ resultado: 'aprobado' });

    await reconciliarPagosMercadoPago();

    expect(procesarPagoMercadoPago).toHaveBeenCalledWith({
      clubId: 'CARC',
      payment: expect.objectContaining({ id: '2', status: 'approved' }),
    });
  });

  it('no revienta si falla la búsqueda de un club, y avisa al admin de ese club', async () => {
    PagoOnlineIntent.find.mockImplementation(() => { throw new Error('DB error'); });

    await expect(reconciliarPagosMercadoPago()).resolves.not.toThrow();
    expect(notifyJobFailure).toHaveBeenCalledWith('CARC', 'Reconciliación Mercado Pago', 'DB error');
  });
});
