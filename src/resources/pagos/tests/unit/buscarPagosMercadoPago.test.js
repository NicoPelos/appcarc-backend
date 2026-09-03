import { describe, it, expect, vi, afterEach } from 'vitest';
import { buscarPagosMercadoPago } from '../../services/buscarPagosMercadoPago.service.js';

const CLUB_USER_ID = 111;
const OTRO_USER_ID = 222;

const buildPago = (overrides = {}) => ({
  id: 1,
  status: 'approved',
  operation_type: 'money_transfer',
  collector_id: CLUB_USER_ID,
  payer_id: OTRO_USER_ID,
  transaction_amount: 1000,
  date_approved: '2026-09-01T12:00:00.000Z',
  payer: { email: 'pagador@test.com' },
  collector: { email: null },
  description: 'Varios',
  ...overrides,
});

const mockFetchSecuencia = (respuestas) => {
  const fn = vi.fn();
  for (const r of respuestas) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => vi.unstubAllGlobals());

describe('buscarPagosMercadoPago', () => {
  it('direccion ingreso (default): filtra por collector_id === club y usa payer.email', async () => {
    mockFetchSecuencia([
      { ok: true, json: vi.fn().mockResolvedValue({ id: CLUB_USER_ID }) },
      {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            buildPago({ id: 1, collector_id: CLUB_USER_ID, payer_id: OTRO_USER_ID }),
            buildPago({ id: 2, collector_id: OTRO_USER_ID, payer_id: CLUB_USER_ID }), // egreso, no debe aparecer
          ],
        }),
      },
    ]);

    const resultado = await buscarPagosMercadoPago({ accessToken: 'token', fecha: '2026-09-01', direccion: 'ingreso' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ paymentId: '1', payerEmail: 'pagador@test.com' });
  });

  it('direccion egreso: filtra por payer_id === club y usa collector.email', async () => {
    mockFetchSecuencia([
      { ok: true, json: vi.fn().mockResolvedValue({ id: CLUB_USER_ID }) },
      {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            buildPago({ id: 1, collector_id: CLUB_USER_ID, payer_id: OTRO_USER_ID }), // ingreso, no debe aparecer
            buildPago({ id: 2, collector_id: OTRO_USER_ID, payer_id: CLUB_USER_ID, collector: { email: 'proveedor@test.com' } }),
          ],
        }),
      },
    ]);

    const resultado = await buscarPagosMercadoPago({ accessToken: 'token', fecha: '2026-09-01', direccion: 'egreso' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ paymentId: '2', payerEmail: 'proveedor@test.com' });
  });

  it('default sin direccion se comporta como ingreso', async () => {
    mockFetchSecuencia([
      { ok: true, json: vi.fn().mockResolvedValue({ id: CLUB_USER_ID }) },
      {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [buildPago({ id: 5, collector_id: CLUB_USER_ID, payer_id: OTRO_USER_ID })],
        }),
      },
    ]);

    const resultado = await buscarPagosMercadoPago({ accessToken: 'token', fecha: '2026-09-01' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].paymentId).toBe('5');
  });
});
