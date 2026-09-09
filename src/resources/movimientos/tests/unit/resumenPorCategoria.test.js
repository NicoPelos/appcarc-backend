import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumenPorCategoriaHandler, resumenPorCategoriaMensualHandler } from '../../handlers/resumenPorCategoria.handler.js';
import * as categoriaMovimientoService from '../../services/categoriaMovimiento.service.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { clubId: 'club1' };

afterEach(() => vi.restoreAllMocks());

describe('resumenPorCategoriaHandler', () => {
  it('devuelve ingresos y egresos como listas {categoria, monto}', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});
    vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({
      ingresos: [['Cuota Social', 50000], ['Muro Libre', 20000]],
      egresos: [['Costos Fijos', 15000]],
    });

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.ingresosPorCategoria).toEqual([
      { categoria: 'Cuota Social', monto: 50000 },
      { categoria: 'Muro Libre', monto: 20000 },
    ]);
    expect(body.egresosPorCategoria).toEqual([{ categoria: 'Costos Fijos', monto: 15000 }]);
  });

  it('usa desde/hasta explícitos cuando vienen en la query', async () => {
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: { desde: '2026-01-01', hasta: '2026-01-31' }, user: USER }, res);

    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      desde: new Date('2026-01-01T00:00:00.000Z'),
      hasta: new Date('2026-01-31T23:59:59.999Z'),
    }));
  });

  it('default: usa un rango de 365 días hasta ahora si no vienen desde/hasta', async () => {
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    const { desde, hasta } = buildSpy.mock.calls[0][0];
    const dias = (hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeCloseTo(365, 0);
  });

  it('devuelve 500 ante un error inesperado', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockRejectedValue(new Error('DB down'));

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('resumenPorCategoriaMensualHandler', () => {
  it('devuelve un objeto por mes (default 6) con periodo, label e ingresos/egresos por categoría', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({
      ingresos: [['Cuota Social', 1000]],
      egresos: [['Varios', 500]],
    });

    const res = mockRes();
    await resumenPorCategoriaMensualHandler({ query: {}, user: USER }, res);

    expect(buildSpy).toHaveBeenCalledTimes(6);
    const body = res.json.mock.calls[0][0];
    expect(body.meses).toHaveLength(6);
    expect(body.meses[0]).toMatchObject({
      ingresosPorCategoria: [{ categoria: 'Cuota Social', monto: 1000 }],
      egresosPorCategoria: [{ categoria: 'Varios', monto: 500 }],
    });
    expect(body.meses[0].periodo).toMatch(/^\d{4}-\d{2}$/);
    expect(body.meses.at(-1).periodo > body.meses[0].periodo).toBe(true); // orden cronológico ascendente
  });

  it('respeta el query param meses, con un tope de 24', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });

    const res = mockRes();
    await resumenPorCategoriaMensualHandler({ query: { meses: '3' }, user: USER }, res);
    expect(buildSpy).toHaveBeenCalledTimes(3);

    buildSpy.mockClear();
    await resumenPorCategoriaMensualHandler({ query: { meses: '999' }, user: USER }, res);
    expect(buildSpy).toHaveBeenCalledTimes(24);
  });

  it('cada mes cubre desde el día 1 hasta el último día de ese mes calendario', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });

    const res = mockRes();
    await resumenPorCategoriaMensualHandler({ query: { meses: '2' }, user: USER }, res);

    const [primerMes, segundoMes] = buildSpy.mock.calls.map(([arg]) => arg);
    expect(primerMes.desde.getUTCDate()).toBe(1);
    expect(primerMes.desde.getUTCHours()).toBe(0);
    // El desde del segundo mes tiene que ser justo el día siguiente al hasta del primero.
    expect(segundoMes.desde.getTime()).toBe(primerMes.hasta.getTime() + 1);
  });

  it('devuelve 500 ante un error inesperado', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockRejectedValue(new Error('DB down'));

    const res = mockRes();
    await resumenPorCategoriaMensualHandler({ query: {}, user: USER }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
